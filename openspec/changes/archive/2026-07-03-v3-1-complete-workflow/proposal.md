# v3.1 Complete Workflow — 端到端工作流完善

## Context

v3.0 declaration engine 的审计发现了多个关键缺口，导致 spec-graph 无法完整运行端到端工作流。核心引擎（状态机、gate 评估、dispatch manifest 生成）是可靠且测试通过的（212 tests passing），但工作流的完整性还有缺口：planning 不是 LLM、Meeting 协议无 runtime、gate 系统两套不通信、并行 sub-agent 无隔离。

### 审计结论速览

```
能跑通的路径:
  init → plan(关键词) → compose → dispatch → [外部协调者] → advance → status
  所有 212 个测试通过

不能跑通的:
  ✗ plan 对复杂意图只做关键词匹配（不是 LLM）
  ✗ Meeting 协议有类型/声明但无 runtime 执行引擎
  ✗ graph.yaml gates 和 knowledge gate.yaml 是两套不通信的系统
  ✗ propose/archive/contract/release 在 graph 中但不在 FSM 中
  ✗ knowledge base 有 5 个僵尸 stage（不在 8-stage FSM 中）
  ✗ dispatch evaluateGateStatus 有 bug（plan → tasks key 未更新）
  ✗ 并行 sub-agent 共享同一个工作目录，无 worktree 隔离
```

### 和 v3.0 的关系

v3.0 完成了 "brain-not-hands" 原则的代码落地（删除违反代码 + 修复关键 bug）。v3.1 在此基础之上 **完善工作流完整性**，不改动 v3.0 的架构原则。

## Goals / Non-Goals

**Goals:**
- P0: 修复 v3-bugfix-gate-and-compat 中的 3 个已知 bug（阻塞性）
- P1: 将 planning 从关键词匹配升级为真正的 LLM 意图分解
- P2: 将 graph.yaml gate 系统和 knowledge gate.yaml 统一为一套 gate 评估
- P2: 实现 Meeting 协议的 runtime 执行引擎
- P2: 对齐 FSM stages 和 graph actions（补充 propose stage）
- P2: 实现 worktree 隔离，使并行 sub-agent 真正独立执行
- P3: 清理 knowledge base 僵尸 stage
- P3: dispatch manifest 支持 meeting actions

**Non-Goals:**
- 不修改 brain-not-hands 原则（spec-graph 仍然不直接调用 agent）
- 不修改现有 8-stage FSM 核心结构
- 不添加新的 agent 类型或 pack
- 不实现 compose `$or/$and` 操作符（deferred to v3.2）
- 不实现 tasks stage 的 capabilities 注入（deferred to v3.2）
- 不实现真实的 LLM judge / downstream-executability 验证方法（deferred to v3.3）

## What Changes

### P0: 合并 v3-bugfix-gate-and-compat（阻塞性 bug 修复）

| # | Fix | 模块 | 影响 |
|---|-----|------|------|
| F1 | dispatch `stageArtifacts` 字典 `plan` → `tasks` key | dispatch/index.ts:710 | tasks stage gate 当前永远显示 passed |
| F2 | 补充 `normalizeStage()` 到 automator | automator/index.ts:172 | v2 session 向后兼容不完整 |
| F3 | 测试 fixtures 中 `'plan'` → `'tasks'` | 3 个测试文件 | 测试与实际代码不一致 |

### P1: Planning LLM 化

**现状**:
```typescript
// packages/core/src/planning/index.ts:48-108
const DOMAIN_TEMPLATES: Record<string, CapabilityTemplate[]> = {
  auth: [{ id: 'user-model', ... }, ...],
  api: [{ id: 'api-endpoints', ... }, ...],
  // 9 个硬编码关键词模板
};
// "Build WebSocket notification service" → 无匹配 → 返回 generic capability
```

**改后**:
```
spec-graph plan "intent"
  → planning module 组装 prompt（profile + intent + 知识库上下文）
  → 写入 dispatch manifest（类似其他 stage，但 target 是 planning agent）
  → 外部协调者 dispatch planning-capable agent
  → agent 返回结构化 plan JSON
  → automator.confirmPlan() 存储 plan
```

**关键设计决策**:
- planning 模块不再自己做分解，而是 **生成 prompt + 验证返回的 JSON schema**
- 仍然不直接调用 LLM（遵循 brain-not-hands）
- 流程：`spec-graph plan` → 输出 planning manifest → 协调者 dispatch → `spec-graph confirm` 存储结果
- Planning agent 使用 `model_tier: capable`（需要判断力）
- 保留关键词匹配作为 **fallback**（无协调者时的最小可用路径）

```
当前 plan 命令行为:
  spec-graph plan "Build JWT auth"
  → 同步返回 Plan (关键词匹配)
  → 直接创建 session

改后 plan 命令行为:
  spec-graph plan "Build JWT auth"
  → 输出 planning manifest JSON
  → 协调者 dispatch planning agent
  → agent 返回 { capabilities, order, complexity, risks }
  → spec-graph confirm <session-id>
  → 创建 session

  spec-graph plan "Build JWT auth" --fallback
  → 使用关键词匹配（当前行为，离线可用）
```

### P2: Gate 系统统一

**现状**: 两套互不通信的 gate 系统

```
System A: knowledge/stages/<stage>/gate.yaml     ← automator evaluateGate() 使用
  specify/gate.yaml    → 12 exit criteria (proposal-structure, capabilities-enumerated, ...)
  design/gate.yaml     → 8 exit criteria
  tasks/gate.yaml      → 6 exit criteria
  implement/gate.yaml  → 4 exit criteria
  ...

System B: graph.yaml gates                         ← compose 生成，dispatch 引用
  requirements-clarified  → on_transition: [specify, design]
  stories-decomposed      → on_transition: [tasks, implement]
  entry-phase4            → on_transition: [tasks, implement]
  exit-merged             → on_transition: [accept, integrate]
  → require_artifacts, require_checks, require_traces 用不同格式
```

**改后**: 统一为 knowledge/gate.yaml 作为唯一来源，graph.yaml 的 gates 改为引用

```yaml
# graph.yaml (compose 输出) — gates 简化为引用
gates:
  - id: specify-exit
    source: knowledge/stages/specify/gate.yaml
    on_transition: [specify, design]
  - id: exit-merged
    source: knowledge/stages/integrate/gate.yaml
    on_transition: [accept, integrate]
    add_checks: [contract-drift-scan]  # pack 可以追加 checks
```

### P2: Meeting 协议 Runtime

**现状**: 类型定义完整（~200 行类型），graph.yaml 声明了 `requirements-meeting`，但没有执行代码

**改后**: 添加最小可用的 meeting runtime

```
新增 CLI 命令:
  spec-graph meeting list                          # 列出当前 session 需要的 meetings
  spec-graph meeting start <meeting-id>            # 创建 meeting runtime state
  spec-graph meeting record <meeting-id>           # 记录当前轮次贡献
  spec-graph meeting advance <meeting-id>          # 推进到下一轮
  spec-graph meeting complete <meeting-id>         # facilitator 综合输出
  spec-graph meeting abandon <meeting-id>          # 放弃未完成的 meeting
  spec-graph meeting transcript <meeting-id>       # 查看 transcript

新增核心逻辑:
  packages/core/src/meeting/                       # meeting 状态管理（不执行 agent）
    ├── index.ts                                   # 创建/推进/完成 meeting
    └── index.test.ts

dispatch 集成:
  - dispatch 检测到 meeting on_actions 匹配当前 stage → 生成 meeting dispatch action
  - meeting dispatch action 包含 round prompts 和 participant 信息
  - 协调者按 round 组织多 agent 讨论
```

### P2: FSM 补充 propose stage

```
当前 FSM (8 stages):
  specify → design → tasks → implement → review → test → accept → integrate

graph.yaml actions (12):
  propose, specify, plan(→tasks), design, implement, review, test, accept,
  integrate, archive, contract, release

改后 FSM (9 stages):
  propose → specify → design → tasks → implement → review → test → accept → integrate
    ↑ 新增

propose stage:
  - Agent: pm (capable)
  - Output: proposal.md (初始提案)
  - Gate: problem-statement + user-personas + scope 初稿
  - 与 specify 的区别: propose 产出原始需求理解，specify 产出结构化 spec

archive / contract / release 保持为 actions（非 stage），通过 hook 触发
```

### P2: Worktree 隔离 — 并行 sub-agent 执行环境

**现状**: 并行 sub-agent 共享同一个工作目录

```
dispatch 生成 implement stage 的并行 actions:
  Wave 0: [user-model, api-endpoints]    ← parallel_group: 0
    → 两个 sub-agent 同时跑在同一个目录
    → 虽然 file_scope 不同，但共享:
        node_modules/  (npm install 互相干扰)
        build/         (构建产物冲突)
        .git/           (git 操作竞态)

现有防护:
  ✅ file_scope { read, write, forbid } — prompt 级约束
  ✅ file-conflict-analyzer — 检测文件重叠
  ✅ integration-gate (3-level) — 合并后验证
  ❌ 没有文件系统级隔离 — sub-agent 可能互相干扰
  ❌ types 中 IsolationUnit/ScopeLock/MergeQueue 全部定义了但未实现
```

**改后**: dispatch 为并行 action 自动创建隔离环境

```
并行 dispatch 流程:

  spec-graph dispatch --json
    │
    ├─ 检测 stage === 'implement' && waves.length > 0
    │
    ├─ 为每个并行 action 创建 git worktree:
    │   git worktree add .spec-graph/worktrees/<session>-<action-id> <base-branch>
    │   写入 .spec-graph/isolation/worktrees.yaml:
    │     - id: <session>-<action-id>
    │       status: prepared
    │       branch: spec-graph/<session>-<action-id>
    │       path: .spec-graph/worktrees/<session>-<action-id>
    │       scope_lock: { allowed_paths, protected_paths, forbidden_paths }
    │
    ├─ manifest action 的 file_scope.write 指向 worktree 路径
    │   而不是项目根目录
    │
    ├─ 协调者 dispatch sub-agent 到各自 worktree
    │
    ├─ sub-agent 完成后:
    │   spec-graph worktree verify <unit-id>
    │     → 检查 worktree 内验证通过
    │     → status: prepared → self_verified
    │
    ├─ 所有 wave 完成:
    │   spec-graph worktree merge <unit-id>
    │     → git merge worktree branch → main
    │     → 冲突检测 (file-conflict-analyzer)
    │     → status: self_verified → merged
    │
    └─ 所有 unit merged:
        spec-graph advance --result ...
        → gate 评估（含 integration-gate 3-level）
```

**新增模块**: `packages/core/src/isolation/`

```
isolation/
├── index.ts              # WorktreeManager: create/verify/merge/abandon
│                          #   使用 GitBackend 接口（可注入，可测试）
├── index.test.ts
├── scope-lock.ts         # ScopeLock 强制检查
│                          #   读取 scope_lock 配置
│                          #   验证 sub-agent 没有越界写入
└── merge-queue.ts         # MergeQueue 管理
                           #   按依赖顺序 merge（Wave 0 → Wave 1 → ...）
                           #   冲突时 block + 报告
```

**新增 CLI 命令**:

```
spec-graph worktree list                    # 列出所有 isolation units
spec-graph worktree status <unit-id>        # 查看单个 unit 状态
spec-graph worktree verify <unit-id>        # 标记 unit 为 self_verified
spec-graph worktree merge <unit-id>         # merge unit 到主分支
spec-graph worktree abandon <unit-id>       # 放弃 unit（清理 worktree）
spec-graph worktree scope-check <unit-id>   # 检查 scope lock 违规
```

**关键设计决策**:

| 决策 | 选择 | 理由 |
|------|------|------|
| Worktree 由谁创建？ | spec-graph dispatch | 基础设施准备，类似 init 创建目录；不违反 brain-not-hands（不调用 agent） |
| GitBackend 怎么实现？ | 默认用 `child_process.execSync('git')`，测试注入 fake | types 已定义接口，只差实现 |
| Worktree 什么时候清理？ | merge 后自动清理，abandon 时也清理 | 避免 `.spec-graph/worktrees/` 膨胀 |
| Scope lock 如何强制执行？ | prompt 约束 + scope-check 命令事后验证 | 真正的文件系统级强制需要 OS 权限，过度设计 |
| 和 dispatch-watcher hook 的关系？ | hook 检测到 manifest 有 worktree 信息 → 在 system-reminder 中包含 worktree 路径 | hook 不做 worktree 管理，只传递信息 |

### P3: 清理

```
P3.1 清理 knowledge base:
  归档（不删除）knowledge base 中不在 FSM 中的 stage:
    knowledge/stages/requirement-analysis/
    knowledge/stages/user-stories/
    knowledge/stages/ui-design/
    knowledge/stages/dev-stories/
  保留 9 个 FSM stage:
    propose(新) + specify + design + tasks + implement + review + test + accept + integrate
```

## Architecture

### 改后完整架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    spec-graph v3.1 完整架构                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        CLI Layer (packages/cli)                   │  │
│  │                                                                    │  │
│  │  plan  dispatch  advance  meeting  worktree  status  intervene ... │  │
│  └───────────────────────────────┬────────────────────────────────────┘  │
│                                  │                                       │
│  ┌───────────────────────────────▼────────────────────────────────────┐  │
│  │                     Core Engine (packages/core)                     │  │
│  │                                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │  │
│  │  │automator │ │dispatch  │ │gate-enf  │ │meeting (NEW)         │ │  │
│  │  │9-stages  │ │manifest  │ │unified   │ │runtime state mgmt    │ │  │
│  │  │FSM       │ │generator │ │gates     │ │round/transcript      │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │  │
│  │                                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │  │
│  │  │planning  │ │composer  │ │recovery  │ │machine-state         │ │  │
│  │  │LLM-prompt│ │pack merge│ │4-level   │ │artifact tracking     │ │  │
│  │  │generator │ │          │ │retry     │ │                      │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │  │
│  │                                                                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │  │
│  │  │sense     │ │knowledge │ │dep-analy │ │context-sharing       │ │  │
│  │  │project   │ │base      │ │topo sort │ │                      │ │  │
│  │  │profile   │ │(cleaned) │ │          │ │                      │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Knowledge Base (cleaned)                        │  │
│  │                                                                    │  │
│  │  stages/                                                           │  │
│  │    propose/    ← NEW (from requirement-analysis merge)             │  │
│  │    specify/    ← keep                                              │  │
│  │    design/     ← keep                                              │  │
│  │    tasks/      ← keep                                              │  │
│  │    implement/  ← keep                                              │  │
│  │    review/     ← keep                                              │  │
│  │    test/       ← keep                                              │  │
│  │    accept/     ← keep                                              │  │
│  │    integrate/  ← keep                                              │  │
│  │                                                                    │  │
│  │  archived/ (not loaded)                                            │  │
│  │    user-stories/  requirement-analysis/  ui-design/  dev-stories/ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 统一 Gate 系统流程

```
spec-graph advance --result '{...}'
  │
  ▼
automator.submitResult()
  │
  ├─ 1. 加载 knowledge/stages/<stage>/gate.yaml  → 获取 criteria
  ├─ 2. 加载 graph.yaml gates                        → 获取追加的 checks/artifacts
  ├─ 3. 合并: knowledge criteria + graph add_checks + graph add_artifacts
  ├─ 4. evaluateGate(merged criteria, context)
  ├─ 5. 如果 passed  → 推进到下一 stage
  └─ 6. 如果 failed  → diagnose → recovery plan
```

### Meeting Runtime 流程

```
dispatch 检测 stage 有关联 meeting:
  │
  ▼
spec-graph meeting start requirements-meeting
  → 创建 .spec-graph/meetings/requirements-meeting.yaml
  → status: in_progress, current_round: 1, phase: diverge
  │
  ▼
协调者按 meeting dispatch action 组织 discussion:
  Round 1 (diverge):
    - 每个 core participant 产出 statement
    - spec-graph meeting record --content '...' --participant pm
  │
  ▼
spec-graph meeting advance requirements-meeting
  → round 1 contributions → round[1] transcript
  → current_round → 2, phase → challenge
  │
  ▼
Round 2 (challenge): ... 同上
  │
  ▼
spec-graph meeting complete requirements-meeting
  → facilitator 综合所有 round
  → 产出 output_artifacts (proposal.md, requirements.md)
  → status: completed
```

## 9-Stage FSM（改后）

```
┌─────────────┬──────────────┬───────────────────┬────────────────────────────────┐
│ Stage       │ Agent        │ Output            │ Gate (exit criteria)           │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ propose     │ pm           │ proposal.md       │ Problem statement + personas   │
│ (NEW)       │ capable      │                   │ + initial scope                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ specify     │ pm           │ specs/*.md        │ Structured requirements        │
│             │ capable      │                   │ + acceptance criteria          │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ design      │ architect    │ design.md         │ Architecture decisions + ADR   │
│             │ capable      │                   │ + traceability to specs        │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ tasks       │ developer    │ tasks.md          │ Checkbox format + ≥3 tasks     │
│             │ standard     │                   │ + traceability to design       │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ implement   │ developer    │ src/**/*          │ Source files + validation      │
│             │ standard     │                   │ + all tasks checked            │
│             │ ★ parallel   │                   │                                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ review      │ reviewer     │ review.md         │ Findings + resolutions         │
│             │ capable      │                   │                                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ test        │ qa           │ test.md           │ Test results + coverage        │
│             │ standard     │                   │                                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ accept      │ qa           │ verification.md   │ Acceptance criteria met        │
│             │ standard     │                   │ + manual confirmation          │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ integrate   │ developer    │ pr.md             │ Summary + Test Plan +          │
│             │ standard     │                   │ contract verification          │
└─────────────┴──────────────┴───────────────────┴────────────────────────────────┘
```

## Implementation Plan

```
Phase 1: P0 Bugfix (0.5 day) — 阻塞性，先修
  • F1: 修复 dispatch stageArtifacts plan → tasks key
  • F2: 补充 automator normalizeStage()
  • F3: 修复测试 fixtures 中的 'plan' 引用
  → 合并 v3-bugfix-gate-and-compat

Phase 2: P1 Planning LLM 化 (1.5 days)
  • 重构 planning 模块：生成 planning manifest 而不是直接分解
  • 新增 planning agent prompt template
  • 添加 JSON schema 验证（agent 返回值）
  • 保留 --fallback 关键词匹配路径
  • 更新 spec-graph plan CLI 命令
  • 更新 spec-graph-plan SKILL

Phase 3: P2 Gate 统一 (1 day)
  • 合并 graph.yaml gates 和 knowledge gate.yaml
  • graph.yaml gates 改为引用 + 追加模式
  • gate-enforcement 支持从 knowledge base 加载门禁 + graph 追加 checks
  • 更新 compose 逻辑（gates 段简化）
  • 回归测试（不影响现有 30+ 规则评估器）

Phase 4: P2 Worktree 隔离 (1.5 days)
  • 创建 packages/core/src/isolation/ 模块
  • 实现 GitBackend 默认实现（child_process.execSync）
  • 实现 WorktreeManager: create/verify/merge/abandon
  • 实现 ScopeLock 事后验证
  • 实现 MergeQueue 按依赖顺序合并
  • dispatch 集成：检测并行 actions → 自动创建 worktrees
  • manifest action 的 output_spec.path 指向 worktree 路径
  • CLI 命令：worktree list/status/verify/merge/abandon/scope-check
  • 测试

Phase 5: P2 Meeting Runtime (1.5 days)
  • 创建 packages/core/src/meeting/ 模块
  • 实现 meeting state management（CRUD）
  • 实现 round advancement 和 transcript 记录
  • dispatch 集成：检测 meeting → 生成 meeting dispatch action
  • CLI 命令：meeting list/start/record/advance/complete/abandon/transcript
  • 测试

Phase 6: P2 FSM 补充 propose stage (0.5 day)
  • STAGES 从 8 → 9（prepend 'propose'）
  • 更新 knowledge/stages/propose/gate.yaml
  • 移动 requirement-analysis 内容到 propose
  • 更新 graph.yaml agent_bindings
  • 更新测试

Phase 7: P3 清理 & 文档 (1 day)
  • 清理 knowledge base（归档 4 个僵尸 stage 到 archived/）
  • 文档更新
  • 回归测试

Total: ~7.5 days (2 weeks)
```

## 不同优先级可以独立交付

```
P0 (0.5 day) → 独立 PR
  ✓ 修复 3 个 bug
  ✓ 阻塞性，应该立即合并
  ✓ 可以单独 release v3.0.1

P1 (1.5 days) → 独立 PR
  ✓ Planning LLM 化
  ✓ 最大用户体验提升
  ✓ 可以单独 release v3.1.0-alpha

P2 (4.5 days) → 独立 PR
  ✓ Gate 统一 + Worktree 隔离 + Meeting Runtime + propose stage
  ✓ 架构完善
  ✓ 可以单独 release v3.1.0-beta

P3 (1 day) → 独立 PR
  ✓ 清理
  ✓ release v3.1.0
```

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Planning LLM 化后 agent 返回不符合 schema 的 JSON | Medium | Medium | JSON schema 验证 + 自动重试（最多 2 次）+ fallback 到关键词匹配 |
| Meeting runtime 对协调者有新的能力要求 | Medium | Medium | 提供清晰的 meeting dispatch action 格式 + 协调者只需按 round 分发 prompt |
| Gate 统一打破现有 212 个测试 | Low | High | 增量修改，不重写 gate-enforcement 核心逻辑 |
| 9-stage FSM 打破 v3.0 session 兼容 | Low | Medium | 使用 normalizeStage() 同样的向后兼容机制 |
| propose stage 增加工作流长度 | Medium | Low | propose 和 specify 可以合并 dispatch（同一个 pm agent 连续执行） |

## Impact

- **new files**: `packages/core/src/meeting/index.ts`, `packages/core/src/meeting/index.test.ts`, `packages/core/src/isolation/index.ts`, `packages/core/src/isolation/index.test.ts`, `packages/core/src/isolation/scope-lock.ts`, `packages/core/src/isolation/merge-queue.ts`, `packages/cli/src/commands/meeting.ts`, `packages/cli/src/commands/worktree.ts`, `packages/core/knowledge/stages/propose/gate.yaml`
- **modified files**: `planning/index.ts`, `dispatch/index.ts`, `gate-enforcement/index.ts`, `automator/index.ts`, `composer/index.ts`, `cli/src/index.ts`, pack files, SKILL files
- **deleted files**: `knowledge/stages/requirement-analysis/`, `knowledge/stages/user-stories/`, `knowledge/stages/ui-design/`, `knowledge/stages/dev-stories/` → 移动到 `knowledge/archived/`
- **no breaking changes**: 所有现有 API 保持不变，9-stage FSM 向后兼容 8-stage session

## Success Criteria

```
P0 完成后:
  ✓ dispatch stageArtifacts 使用 'tasks' key
  ✓ automator loadSession 自动 normalize 'plan' → 'tasks'
  ✓ 所有 212+ 测试通过

P1 完成后:
  ✓ spec-graph plan "complex intent" → 输出 planning manifest（不是关键词匹配结果）
  ✓ agent 返回的 JSON 被 schema 验证
  ✓ spec-graph plan --fallback → 关键词匹配（离线可用）
  ✓ planning 测试覆盖 LLM 和 fallback 两条路径

P2 完成后:
  ✓ graph.yaml gates 引用 knowledge gate.yaml 而不是重复定义
  ✓ gate-enforcement 统一使用 knowledge + graph 追加
  ✓ dispatch 检测并行 actions，自动创建 git worktree
  ✓ sub-agent 在隔离的 worktree 中执行
  ✓ worktree merge 带冲突检测和 scope lock 验证
  ✓ meeting start/record/advance/complete 端到端可用
  ✓ meeting transcript 正确记录所有 round 和 contributions
  ✓ dispatch 为有 meeting 的 stage 生成 meeting dispatch action
  ✓ 9-stage FSM 包含 propose

P3 完成后:
  ✓ knowledge base 只有 9 个有效 stage 目录
  ✓ 所有 240+ 测试通过
  ✓ 文档反映最新架构
```

## Open Questions

| Question | Proposed Answer | Rationale |
|----------|----------------|-----------|
| Q1: propose 和 specify 是否需要合并 dispatch？ | 是，pm agent 可以连续执行两个 stage（同一 session，不需要重新加载 context） | 减少协调者往返次数，pm agent 已经有完整上下文 |
| Q2: meeting record 命令是由协调者调用还是由 agent 调用？ | 协调者调用。agent 产出 contribution 文本，协调者用 `meeting record` 记录到 runtime state | agent 不直接访问 .spec-graph/ 目录 |
| Q3: planning LLM agent 用什么 model_tier？ | `capable` | 意图分解需要判断力和领域知识 |
| Q4: 清理的 knowledge stages 真的删除还是归档？ | 移动到 `knowledge/archived/`，不加载但保留参考 | 保留知识资产，以备用 |
| Q5: Worktree 创建失败时怎么办？ | 回退到共享目录执行 + 在 manifest 中警告；dispatch 仍然生成 action，但标注 isolation_mode: "shared" | 保证工作流不因基础设施问题中断 |

## Timeline

```
Week 1:
  Day 1: P0 Bugfix (0.5 day) → 独立 PR + merge
  Day 1-2: P1 Planning LLM 化 (1.5 days)
  Day 3: P2 Gate 统一 (1 day)
  Day 4-5: P2 Worktree 隔离 (1.5 days)

Week 2:
  Day 6-7: P2 Meeting Runtime (1.5 days)
  Day 8: P2 FSM propose stage (0.5 day)
  Day 8-9: P3 清理 & 文档 (1 day)
  Day 9: Release v3.1.0
```
