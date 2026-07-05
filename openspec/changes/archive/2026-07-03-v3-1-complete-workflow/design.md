# v3.1 Technical Design

## Context

spec-graph v3.0 的核心引擎（automator + dispatch + gate-enforcement）是稳定且测试通过的。v3.1 要在此基础上增加 5 个相互关联的 P2 改动：

```
改动                          影响的核心模块
──────────────────────────────────────────────
P2 Gate 统一                  gate-enforcement, composer, dispatch
P2 Worktree 隔离              isolation (NEW), dispatch, automator
P2 Meeting Runtime            meeting (NEW), dispatch, automator
P2 Propose stage              automator, dispatch, knowledge
P1 Planning LLM 化            planning, dispatch, automator
```

这 5 个改动不是独立的：它们共享同一个 dispatch 模块，共享同一个 automator 状态机，共享同一套 gate 系统。如果分别设计，会在集成时互相打架。

本 design 文档解决**跨模块的架构决策**，spec 文档解决**单个 capability 的需求细节**。

## Goals / Non-Goals

**Goals:**
- 确定 5 个 P2 改动的统一 dispatch 架构（dispatch 如何同时支持 meeting + worktree + 9-stage）
- 确定 gate 统一的技术方案（knowledge + graph 如何合并）
- 确定 worktree 的生命周期管理（谁创建、谁验证、谁合并、谁清理）
- 确定 meeting runtime 的边界（状态管理 vs agent 执行）
- 确定 propose stage 的加入方式（9-stage 向后兼容）
- 确定 planning LLM 化的 manifest 格式

**Non-Goals:**
- 不重新设计 automator 的核心状态机循环（保持 submitResult → gate → advance 模型）
- 不重新设计 dispatch 的 9-section envelope（只扩展，不改核心格式）
- 不实现 LLM 调用（brain-not-hands）
- 不实现文件系统级权限隔离（OS 级别 scope-lock 过度设计）

## 统一 Dispatch 架构

### 问题

dispatch 模块目前只处理单 agent stage 或 implement stage 的并行 dispatch。v3.1 需要它同时处理：

```
┌────────────────────────────────────────────────────────────────┐
│                    dispatch 需要支持的场景                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 普通 stage (propose/specify/design/tasks/review/test/...)  │
│     → 1 个 sub-agent action                                     │
│                                                                 │
│  2. Meeting (任意 stage 可能触发)                                │
│     → 1 个 meeting action (含 round prompts + participants)     │
│                                                                 │
│  3. 并行 implement (multi-capability)                           │
│     → N 个 sub-agent action, 各自独立 worktree                  │
│                                                                 │
│  4. 混合 (meeting + parallel implement)                         │
│     → meeting action 后接并行 worktree actions                  │
│                                                                 │
│  5. Planning stage                                              │
│     → 1 个 planning-capable agent action                        │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 设计

dispatch 采用 **Action Pipeline** 模型：一个 manifest 包含有序的 action 列表，每个 action 有明确的 type 决定协调者如何处理。

```
DispatchManifest
├── session_id
├── current_stage
├── gate_passed
├── actions: DispatchAction[]          ← 有序 pipeline
│   ├── [0] type: "meeting"            ← 如果有 meeting 触发
│   │   meeting: { meeting_id, rounds, participants }
│   │   parallel_group: 0
│   │
│   └── [1..N] type: "perform_stage"   ← stage 执行
│       ├── parallel_group: 0          ← 可并行
│       ├── isolation: {               ← 并行时自动 worktree
│       │   mode: "worktree" | "shared"
│       │   worktree_path: "..."
│       │   worktree_branch: "..."
│       │   scope_lock: { ... }
│       │ }
│       └── prompt: "..."
│
└── isolation_summary                  ← 供 hook 和协调者使用
    ├── worktree_count: 3
    ├── meeting_required: true
    └── cleanup_after: "merge"
```

**关键改动**：

1. `DispatchAction` 新增 `isolation` 字段 — 告诉协调者这个 action 跑在哪里
2. `DispatchAction.type` 新增 `"meeting"` — 区别于 sub-agent dispatch
3. `DispatchManifest` 新增 `isolation_summary` — 顶层概览

**为什么不用 "mode" 字段**：meeting 和 worktree 不是互斥的。一个 stage 可能先开 meeting，再进入并行 implement。它们是不同的 action type，可以在同一个 pipeline 中顺序/并行出现。

### Action Pipeline 构建逻辑

```
dispatch.generateManifest(session):

  1. 检测当前 stage 是否有 meeting 触发
     └─ graph.meetings 中 on_actions 包含当前 stage 的 action
        → 插入 meeting action 到 pipeline 首位
  
  2. 检测当前 stage 的并行策略
     └─ stage === 'implement' && plan.capabilities.length > 1
        → 依赖分析 → 分 wave → 每 wave 内 actions 有相同 parallel_group
        → 每个 action 的 isolation.mode = "worktree"
     └─ 否则
        → 单 action, isolation.mode = "shared" (不创建 worktree)
  
  3. 为每个 perform_stage action 构建 prompt envelope
     └─ 9-section envelope 不变
     └─ isolation 信息注入到 "Task Context" section
  
  4. 评估 gate 状态（统一 gate 系统，见下节）
```

## Gate 统一方案

### 问题

现在有两套 gate：

```
knowledge/stages/<stage>/gate.yaml     → automator.evaluateGate() 使用
  - 30+ 规则评估器
  - 面向"这个 stage 的输出是否合格"

graph.yaml gates                       → compose 生成，dispatch 引用
  - on_transition 绑定
  - require_artifacts/checks/traces
  - 面向"这个 transition 是否允许"
```

两套 system 格式不同，加载路径不同，评估时机也不同。gate-enforcement 的 `evaluateGate()` 只读 knowledge gate.yaml，完全忽略 graph.yaml gates。

### 设计

**knowledge gate.yaml 为 primary source，graph.yaml gates 为 supplementary source**。

```
                    ┌─────────────────────────┐
                    │  knowledge gate.yaml    │  ← Primary
                    │  (entry + exit criteria) │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Merge Gate Criteria    │  ← 合并
                    │  knowledge + graph add  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  graph.yaml gates       │  ← Supplementary
                    │  add_checks/add_artifacts│
                    │  add_traces             │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  evaluateGate(merged)   │  ← 统一评估
                    └─────────────────────────┘
```

**合并算法**：

```typescript
function buildMergedCriteria(stage, graph, knowledgeBase):
  // 1. 从 knowledge base 加载 entry/exit criteria
  const knowledgeGate = loadGateConfig(stage, knowledgeBase)
  
  // 2. 从 graph.yaml 查找 on_transition 匹配当前 stage transition 的 gates
  const transition = `${currentStage} → ${nextStage}`
  const graphGates = graph.gates.filter(g => 
    g.on_transition 包含当前 transition
  )
  
  // 3. 合并
  return {
    entry: knowledgeGate.entry,  // entry criteria 只来自 knowledge
    exit: [
      ...knowledgeGate.exit,     // primary: knowledge 定义的 exit criteria
      ...graphGates.flatMap(g =>  // supplementary: graph 追加的 checks
        g.require_checks.map(checkId => ({
          id: `graph-${checkId}`,
          description: `graph-required check: ${checkId}`,
          verification: 'rule',
        })),
      ),
      ...graphGates.flatMap(g =>  // graph 追加的 artifacts
        g.require_artifacts.map(artId => ({
          id: `graph-${artId}-exists`,
          description: `graph-required artifact: ${artId}`,
          verification: 'rule',
        })),
      ),
    ],
  }
```

**关键决策**：

- **entry criteria 只来自 knowledge** — graph gates 只定义 transition 约束（exit）
- **graph gates 只做追加，不做覆盖** — 防止 pack 意外覆盖 knowledge 规则
- **graph gate id 前缀 `graph-`** — 区分来源，避免 id 冲突
- **graph gate 的 require_traces 转为 rule 类型** — 复用现有 rule evaluator 框架

**为什么不让 graph gates 覆盖 knowledge gates**：knowledge gates 是 spec-graph 的核心质量保证，pack 不应该能覆盖它们。pack 只能追加。

## Worktree 生命周期

### 状态机

```
                         ┌─────────────────────────────────────────┐
                         │          IsolationUnit Lifecycle        │
                         └─────────────────────────────────────────┘

    dispatch 创建
         │
         ▼
    ┌─────────┐      worktree verify      ┌────────────────┐
    │prepared │ ──────────────────────────▶│ self_verified  │
    │         │                            │                │
    └─────────┘                            └───────┬────────┘
         │                                         │
         │ worktree abandon                        │ worktree merge
         │ (失败/取消)                              │ (验证通过)
         ▼                                         ▼
    ┌──────────┐                            ┌──────────┐
    │abandoned │◀─── 冲突无法解决 ───────────│  merged  │
    │          │                            │          │
    └──────────┘                            └──────────┘
         │                                         │
         │ cleanup                                 │ cleanup (自动)
         ▼                                         ▼
    git worktree remove                       git worktree remove
    branch delete                             branch delete
```

### 谁在什么时候做什么

| 时机 | 操作 | 谁做 |
|------|------|------|
| `spec-graph dispatch --json` (并行 stage) | 创建 worktree + 写入 isolation/worktrees.yaml | spec-graph |
| dispatch manifest 生成 | 设置 action.isolation.worktree_path | spec-graph |
| sub-agent 执行 | 在 worktree_path 目录内工作 | 外部协调者 → sub-agent |
| sub-agent 完成 | 执行 action.next_step (通常是 advance) | 外部协调者 |
| `spec-graph advance` (或 worktree verify) | 检查 worktree 内验证 + 标记 self_verified | spec-graph |
| 所有 wave 完成 | merge worktree branches → main | spec-graph |
| merge 后 | 清理 worktree (git worktree remove + branch delete) | spec-graph |
| merge 失败 (冲突) | 标记 abandoned + 报告冲突 | spec-graph |

### 关键设计决策

**Q: worktree 在 dispatch 时创建还是在 confirm 时创建？**

**A: dispatch 时。** 理由：
- dispatch 是唯一知道需要多少并行 action 的地方
- 并行策略（waves）由依赖分析决定，dispatch 已经做了这个分析
- 如果提前创建（confirm 时），plan 可能变化导致 worktree 白创建

**Q: 单 action stage 也用 worktree 吗？**

**A: 不用。** 只有 parallel_group 有多个 actions 时才创建 worktree。单 action 直接在工作目录执行。理由：
- 单 action 没有并发冲突
- 创建 worktree 有成本（磁盘 + git 操作）
- 大多数 stage 是单 action，只有 implement 通常是并行的

**Q: worktree merge 失败怎么办？**

**A: 分级处理：**
1. **自动 resolve**: 如果冲突是不同文件的并行写入 → git 自动处理
2. **回退到 serial**: 如果 auto-resolve 失败 → 标记当前 unit abandoned → 下一个 wave 改为 serial 执行
3. **escalate**: 如果 serial 也失败 → 停止 workflow，escalate 给协调者

### 和 dispatch-watcher hook 的关系

hook 在 manifest JSON 中能看到 `action.isolation` 字段。hook 在生成 system-reminder 时：
- 如果 `isolation.mode === "worktree"` → 在 EXECUTION 指令中明确告诉 sub-agent "你的工作目录是 X，不要写 Y"
- hook 本身不做 worktree 管理

## Meeting Runtime 边界

### 边界原则

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  spec-graph (brain)              外部协调者 (hands)              │
│  ─────────────────              ──────────────────               │
│                                                                  │
│  ✅ 声明 meeting 配置             ❌ 不参与 round 讨论            │
│  ✅ 管理 meeting 状态               (由 sub-agents 执行)         │
│  ✅ 记录 contributions            ✅ dispatch sub-agents          │
│  ✅ 推进 rounds                   ✅ 收集 agent 贡献              │
│  ✅ 综合 transcript               ✅ 调用 meeting record         │
│  ✅ 生成 output artifacts         ✅ 调用 meeting advance        │
│                                    ✅ 调用 meeting complete       │
│                                                                  │
│  meeting runtime 模块:                                          │
│  ┌──────────────────────┐                                      │
│  │ create/start          │ ← 协调者触发                         │
│  │ record contribution   │ ← 协调者传入 agent 贡献               │
│  │ advance round         │ ← 协调者推进                         │
│  │ complete              │ ← 协调者综合，输出 artifacts          │
│  │ abandon               │ ← 协调者放弃                         │
│  │ transcript (read)     │ ← 查询                              │
│  └──────────────────────┘                                      │
│                                                                  │
│  meeting runtime 不:                                            │
│  ❌ 调用 LLM                                                    │
│  ❌ 管理 agent 生命周期                                          │
│  ❌ 决定谁发言/何时发言                                           │
│  ❌ 判断贡献质量                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Meeting 状态存储

```
.spec-graph/meetings/<meeting-id>.yaml

  meeting_id: "requirements-meeting"
  status: "in_progress"
  current_round: 2
  current_phase: "challenge"
  participants: ["pm", "architect", "qa"]
  rounds:
    - number: 1
      phase: "diverge"
      contributions:
        - participant: "pm"
          type: "statement"
          content: "..."
          round: 1
        - participant: "architect"
          type: "statement"
          content: "..."
          round: 1
  current_round_contributions: []   # 当前轮次（进行中）
  convergence_summary: null
  open_questions: []
```

### Meeting 和 Dispatch 的集成

dispatch 检测到当前 stage 有 meeting 触发时：

```
Action Pipeline:
  [0] type: "meeting"
      meeting: { meeting_id, rounds, participants }
      parallel_group: -1         ← meeting 不参与并行
  
  [1..N] type: "perform_stage"    ← meeting 完成后的 stage 执行
      ...
```

协调者的执行逻辑：
1. 看到 meeting action → 按 round 分发 prompts 给各 participant sub-agents
2. 每个 participant sub-agent 返回 contribution
3. 协调者调用 `spec-graph meeting record` 记录贡献
4. 当前 round 所有 participant 贡献完 → 协调者调用 `spec-graph meeting advance`
5. 所有 round 完成 → 协调者调用 `spec-graph meeting complete`
6. meeting 产出 artifacts → 进入后续 perform_stage actions

## Propose Stage 集成

### 9-stage 向后兼容

```
TypeScript:
  type Stage = 'propose' | 'specify' | 'design' | 'tasks' | 'implement' |
               'review' | 'test' | 'accept' | 'integrate'
  // 新增 'propose' 到联合类型

Session 兼容:
  normalizeStage(stage: string): Stage
    if stage === 'plan' return 'tasks'     // 已有: v2 兼容
    // 不需要额外处理: v3.0 session 从 'specify' 开始
    // v3.1 session 从 'propose' 开始
    // 两者都在新的 STAGES 数组中，只是起始位置不同

  问题: 已有的 v3.0 session 在 'specify' stage，加 'propose' 在前面后，
        STAGES.indexOf('specify') 从 0 变成 1。
  
  解决: progress.currentStageIndex 是基于 STAGES.indexOf() 计算的，
        但这只是显示用途，不影响状态机逻辑。
        真正的阶段转换靠 stage 字符串，不是 index。
```

### Propose vs Specify 的区别

| | Propose | Specify |
|---|---------|---------|
| 目的 | 原始需求理解 + 范围界定 | 结构化 spec + 验收标准 |
| 输出 | proposal.md（初稿，问题陈述 + personas + scope 轮廓） | specs/*.md（per-capability 结构化需求） |
| Gate | 宽松：problem-statement + personas + scope 轮廓存在即可 | 严格：每个 spec 的 requirement/scenario 格式 + SHALL/MUST |
| Agent | pm (capable) | pm (capable) |
| Dispatch | 可以合并（同一个 pm agent 连续执行） | 可以合并 |

**为什么不能合并 propose 和 specify 为一个 stage**：
- propose 的 gate 宽松（只要有轮廓就通过）
- specify 的 gate 严格（格式化的 spec + 验收标准）
- 分开后，propose 失败可以快速迭代（修改 proposal），specify 失败需要修改结构化 spec
- 两个 stage 的 agent prompt 不同（propose: 头脑风暴模式 vs specify: 严谨分析模式）

### propose stage 的 gate.yaml

```yaml
# knowledge/stages/propose/gate.yaml

entry:
  - id: plan-confirmed
    description: Plan has been confirmed
    verification: rule

exit:
  - id: proposal-exists
    description: proposal.md has been created
    verification: rule

  - id: proposal-problem-statement
    description: Contains problem statement or "Why" section
    verification: rule

  - id: proposal-personas
    description: Contains at least one user persona
    verification: rule

  - id: proposal-scope-outline
    description: Contains scope outline (What/How at high level)
    verification: rule
```

注意：propose 的 exit gate 比 specify 宽松。propose 只检查结构存在，specify 检查内容质量。

## Planning LLM 化

### 设计

Planning 模块的输入从 intent 变为 manifest 生成 + JSON 验证。

```
当前:
  planning.generatePlan({ intent, profile })
    → 关键词匹配 DOMAIN_TEMPLATES
    → 返回 PlanOutput

改后:
  planning.generatePlanningManifest({ intent, profile })
    → 组装 prompt（intent + profile + 知识库上下文 + schema 约束）
    → 返回 PlanningManifest（DispatchManifest 的变体，type: "planning"）
    → 协调者 dispatch planning agent (model_tier: capable)
    → agent 返回 JSON
    → planning.validatePlanOutput(json) → PlanOutput | ValidationError

  planning.generatePlanFallback({ intent, profile })
    → 关键词匹配（当前行为）
    → 返回 PlanOutput
```

### Plan JSON Schema

agent 返回的 JSON 必须符合：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["capabilities", "order", "complexity", "risks"],
  "properties": {
    "capabilities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description", "dependsOn"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
          "description": { "type": "string", "minLength": 10 },
          "dependsOn": { "type": "array", "items": { "type": "string" } }
        }
      },
      "minItems": 1,
      "maxItems": 15
    },
    "order": {
      "type": "array",
      "items": { "type": "string" }
    },
    "complexity": { "type": "string", "enum": ["low", "medium", "high"] },
    "risks": { "type": "array", "items": { "type": "string" } },
    "openQuestions": { "type": "array", "items": { "type": "string" } }
  }
}
```

### Fallback 策略

```
attempt 1: dispatch planning agent
  → agent 返回 JSON
  → validatePlanOutput(json)
  → 如果 valid → 使用
  → 如果 invalid → attempt 2

attempt 2: dispatch planning agent + 错误反馈
  → 把 validation error 注入 prompt
  → 重试
  → 如果 valid → 使用
  → 如果 invalid → fallback

attempt 3 (fallback): 关键词匹配
  → 当前 DOMAIN_TEMPLATES 行为
  → 记录 warning: "planning LLM failed, used keyword fallback"
```

## Risks / Trade-offs

### R1: 统一 dispatch 增加 manifest 复杂度

**风险**: dispatch manifest 从简单的 action list 变成包含 isolation + meeting 的复杂结构，协调者理解成本上升。

**缓解**: 
- 保持 9-section envelope 核心不变，只增加 `isolation` 和 `type: "meeting"` 两种扩展
- dispatch-watcher hook 已经做了 manifest → 执行指令的翻译，新字段只需要 hook 更新
- 提供 `manifest.isolation_summary` 顶层概览，协调者不需要解析每个 action

### R2: Worktree 创建/合并有 IO 成本

**风险**: 每个并行 action 创建 git worktree 需要磁盘空间和 git 操作时间。大项目可能需要几秒到几十秒。

**缓解**:
- 只有 parallel_group > 1 时才创建（单 action 直接在工作目录）
- worktree 使用 shallow clone（`--depth 1`）减少磁盘
- merge 后自动清理，避免累积
- 提供 `isolation.mode: "shared"` fallback（创建失败时回退）

### R3: 9-stage FSM 和 8-stage session 共存

**风险**: 已有 v3.0 session 在 'specify' stage，新 session 从 'propose' 开始，progress 计算可能混乱。

**缓解**:
- progress.currentStageIndex 只是显示用途，不影响状态机
- normalizeStage() 只处理旧名称映射（'plan' → 'tasks'），不需要处理 propose
- v3.0 session 自然从 specify 继续，不会回到 propose
- 文档说明 upgrade 路径

### R4: Meeting runtime 增加协调者复杂度

**风险**: 协调者需要理解 meeting protocol（rounds, phases, participants），dispatch meeting action 的格式可能很复杂。

**缓解**:
- meeting 是可选的 — 不是所有 stage 都需要 meeting
- dispatch-watcher hook 检测 meeting action 时生成简化的执行指令
- 协调者只需要按 round 分发 prompt + 收集 response，逻辑是机械的

### R5: Gate 统一可能引入性能问题

**风险**: 每次 advance 都需要合并 knowledge + graph 两个来源的 gate criteria，graph.yaml 可能很大。

**缓解**:
- graph.yaml 已经在内存中（compose 时加载）
- gate 合并在 advance 时做，不在 dispatch 时（advance 频率低）
- 缓存 merged criteria（按 stage 缓存）

## Migration Plan

### 部署顺序

1. **P0 Bugfix (v3.0.1)**: 直接发布，不需要 migration
2. **P1 Planning LLM 化**: 新增 `--fallback` flag，默认行为不变（关键词匹配），可以逐步迁移
3. **P2 改动**: 一起发布，内部协调，不影响外部 API
4. **向后兼容**:
   - 8-stage session 仍然有效（从 specify 继续）
   - dispatch manifest 新字段是 optional 的（isolation 默认 "shared"）
   - meeting 不影响没有 meeting 的 stage

### 回滚策略

- 每个 P-level 独立 PR，可以单独 revert
- worktree isolation 失败 → manifest 回退到 "shared" mode
- meeting runtime 失败 → manifest 不包含 meeting action
- gate 统一失败 → 回退到 knowledge-only gate

## Open Questions

| Question | Decision Needed |
|----------|----------------|
| Q1: Worktree shallow clone 还是 full clone？ | 性能 vs 完整性。倾向 shallow clone + 按需 fetch |
| Q2: Meeting transcript 是否需要 persist 到 session 目录？ | 还是只存 meetings/ 目录。倾向 meetings/ 目录，通过 artifact 链接 |
| Q3: Propose stage 的 agent prompt 从哪里来？ | 从 requirement-analysis 知识迁移到 propose stage，还是新建？ |
| Q4: Plan JSON Schema 验证失败时，重试 prompt 怎么构造？ | 直接把 validation error 注入 prompt 还是更智能的重构？ |
| Q5: 并行 worktree 的 base branch 是 HEAD 还是 session 开始时的 commit？ | 倾向 session 开始时的 commit（可重复性） |
