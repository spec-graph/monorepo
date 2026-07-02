## Why

### 核心原则：Brain, Not Hands (不可妥协的底线)

spec-graph 的设计原则是 "大脑，不是手"。它管理状态机、生成 prompt、评估 gate，但**不能**：
- spawn 任何 child process
- 直接调用 LLM API
- 直接执行 agent
- 管理 agent 生命周期

所有 agent 调度必须通过用户环境 (Claude Code / Codex / Gemini CLI) 的 hook 完成。spec-graph 只产出 dispatch manifest。

### 当前状态审计

```
违反 brain-not-hands 的实现:
  external-coordination/   → spawn `claude -p` child_process
  prompt-construction/     → 生成 XML 给 invokeAgent 用
  cli/auto.ts              → 调用 autoRun + invokeAgent
  cli/next-prompt.ts       → 输出 XML 供 agent 调用
  automator.autoRun()      → 内部调用 invokeAgent
  spec-graph-v2 提案       → 承诺 auto 命令功能
```

### 其他问题

```
1. 两套 sub-agent 调度路径并存
   - Path A (auto + invokeAgent + child_process) ← 违反原则
   - Path B (dispatch + hook) ← 正确路径, 未文档化

2. 两套 prompt 格式并存
   - XML 格式 (prompt-construction 模块)
   - 9 段 envelope (dispatch 模块) ← 更完整, 更规范

3. FSM stage 'plan' 与 CLI 命令 'spec-graph plan' 命名冲突
   - 'spec-graph plan' → 战略层规划 (capabilities)
   - FSM 'plan' stage → 战术层拆解 (tasks.md)

4. 'spec-graph init' 是 stub
   - 只打印文字, 不创建 .spec-graph/ 目录

5. compose 不支持 $or/$and 操作符
   - 3 个 pack 用 $or 被错误加载 (backend, api-design, ddd)

6. tasks stage sub-agent 看不到 capabilities
   - plan.capabilities 在 strategic plan 阶段生成
   - FSM plan stage 不知道要规划哪些 capability

7. implement stage gate 总是通过
   - evaluateGateStatus 的 stageArtifacts 字典没有 implement 条目
   - 任何残缺代码都会被接受
```

## What Changes

### 删除 (违反 brain-not-hands)

| 模块 | 违反原因 |
|------|----------|
| `external-coordination/index.ts` | spawn child_process |
| `prompt-construction/index.ts` | XML 格式给 invokeAgent 用 |
| `cli/commands/auto.ts` | 调用 autoRun + invokeAgent |
| `cli/commands/next-prompt.ts` | 输出 XML 供 agent 调用 |
| `automator.autoRun()` | 内部调用 invokeAgent |
| `skills/spec-graph-auto/` | 引用 auto 命令 |

### 修改

| 改动 | 原因 |
|------|------|
| FSM stage `plan` → `tasks` | 消除与 `spec-graph plan` 命令命名冲突 |
| `spec-graph init` 真实创建 `.spec-graph/` | init 是 stub |
| composer 支持 `$or`/`$and` | pack 过滤失效 |
| tasks stage prompt 包含 capabilities | plan stage 看不到 strategic plan |
| implement gate 真实检查代码 | gate 总是通过 |
| 文档全面更新 | 删除 auto, 添加 dispatch + hook 流程 |

### 新增

| 内容 | 用途 |
|------|------|
| hook 自动注册 (init 时) | 用户 init 后直接能用 dispatch |
| spec-graph-dispatch SKILL | dispatch + hook 路径文档 |
| spec-graph-init SKILL | init 命令文档 |
| E2E 测试 (完整 8 阶段) | 验证真实流程 |
| test-project 完整测试项目 | 真实 E2E 测试环境 |

### 归档

| Change | 原因 |
|--------|------|
| `spec-graph-v2` | 核心承诺违反 brain-not-hands |

## Architecture

```
spec-graph 是大脑 (brain), 不是手 (hands)

  Brain (spec-graph)         Hook                   Hands (Claude Code)
  ──────────────────         ─────                  ─────────────────────
  init                       │                      用户操作
  plan                       │                      确认 plan
  confirm                    │                      用户确认
  compose                    │                      自动组装 graph
  dispatch --json ──────────▶│  检测 Bash 输出
  (产出 manifest)            │  注入 system-reminder
                             │         │
                             │         ▼
                             │  主 agent 用 Agent tool 派发 sub-agent
                             │  sub-agent 产出 artifact
                             │  主 agent 跑 advance
                             │         │
                             │         ▼
                             └──── advance ─────────▶ gate 评估
                                                     state 推进
                                                     machine-state 更新

  重复 8 次: dispatch → hook → advance
  直到 state = "completed"
```

### 8 阶段规格

```
┌─────────────┬──────────────┬───────────────────┬──────────────────────────────────┐
│ 阶段         │ agent         │ 产出文件            │ Gate (exit criteria)                │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ specify     │ pm           │ proposal.md        │ 文件存在 + 4 个 section               │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ design      │ architect    │ design.md          │ 文件存在 + 4 个 section + traceability│
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ tasks       │ developer    │ tasks.md           │ checkbox 格式 + 至少 3 task          │
│             │ standard     │                   │ + 覆盖所有 capabilities              │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ implement   │ developer    │ src/**/*           │ 源文件存在 + tsc pass + tests pass    │
│             │ standard     │                   │ (如果可用)                            │
│             │ ★ parallel   │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ review      │ reviewer     │ review.md          │ findings + resolutions              │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ test        │ qa           │ test.md            │ 测试结果 + coverage                 │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ accept      │ qa           │ verification.md    │ 验收条件 + 人工确认                  │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ integrate   │ developer    │ pr.md              │ Summary + Test Plan                │
│             │ standard     │                   │                                    │
└─────────────┴──────────────┴───────────────────┴──────────────────────────────────┘
```

### 9 段 Prompt Envelope

```
1. Identity              → sub-agent 角色声明
2. System Prompt         → 从 pack/agents/*.md 加载的领域知识
3. Task Context          → Stage/Session/Intent/Action/Parallel group
4. Input Artifacts       → 上游产出 (READ-ONLY, 截断到 3000 字)
5. Output Spec (MUST)    → 精确路径 + 模板 + 格式
6. File Scope (MUST)     → read[] / write[] / forbid[] glob 数组
7. Verification (MUST)   → lint/test/typecheck 命令
8. Status Report (MUST)  → fenced code block JSON
9. After Completion      → next_step 命令
```

### 完整文件清单

```
spec-graph/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── automator/              ✓ 状态机核心
│   │   │   ├── planning/               ✓ LLM 意图分解
│   │   │   ├── gate-enforcement/       ✓ 5 种规则评估
│   │   │   ├── knowledge-base/         ✓ 工艺库
│   │   │   ├── recovery/               ✓ 4 级重试
│   │   │   ├── sense/                  ✓ 项目特征检测
│   │   │   ├── composer/               ✓ pack 组装 + $or/$and
│   │   │   ├── machine-state/          ✓ artifact 状态追踪
│   │   │   ├── dispatch/               ✓ manifest 生成
│   │   │   ├── dependency-analyzer/    ✓ 拓扑排序
│   │   │   │
│   │   │   ├── external-coordination/  ✗ 删除
│   │   │   └── prompt-construction/    ✗ 删除
│   │   │
│   │   ├── knowledge/
│   │   │   └── stages/
│   │   │       ├── specify/
│   │   │       ├── design/
│   │   │       ├── tasks/              重命名自 plan/
│   │   │       ├── implement/
│   │   │       ├── review/
│   │   │       ├── test/
│   │   │       ├── accept/
│   │   │       └── integrate/
│   │   │
│   │   └── hooks/
│   │       └── dispatch-watcher.mjs    ✓ PostToolUse hook
│   │
│   ├── cli/
│   │   └── src/commands/
│   │       ├── init.ts                 ✓ 真实创建 .spec-graph/
│   │       ├── plan.ts                 ✓
│   │       ├── confirm.ts              ✓
│   │       ├── compose.ts              ✓
│   │       ├── dispatch.ts             ✓
│   │       ├── advance.ts              ✓
│   │       ├── status.ts               ✓
│   │       ├── intervene.ts            ✓
│   │       ├── diagnose.ts             ✓
│   │       ├── sessions.ts             ✓
│   │       ├── validate.ts             ✓
│   │       ├── config.ts               ✓
│   │       ├── machine.ts              ✓
│   │       ├── artifact-complete.ts    ✓
│   │       ├── check-run.ts            ✓
│   │       ├── completion.ts           ✓
│   │       ├── auto.ts                 ✗ 删除
│   │       └── next-prompt.ts          ✗ 删除
│   │
│   └── skills/
│       ├── spec-graph-plan/            ✓
│       ├── spec-graph-dispatch/        ✓ 新增
│       ├── spec-graph-status/          ✓
│       ├── spec-graph-intervene/       ✓
│       ├── spec-graph-diagnose/        ✓
│       ├── spec-graph-validate/        ✓
│       ├── spec-graph-init/            ✓ 新增
│       └── spec-graph-auto/            ✗ 删除
│
├── test-project/                       ✓ E2E 测试项目
│
└── openspec/changes/
    └── brain-not-hands-unification/    当前提案
```

## Risks / Trade-offs

- **破坏性变更**: 删除 auto 命令会影响依赖它的用户
  → 分阶段实施: 先加新功能 + deprecation warnings, 再删
  → 提供 migration guide
- **重命名 plan → tasks**: 老 session state.yaml 会失效
  → dispatch 自动兼容老 stage 名 (向后兼容)
  → 提供 migration script
- **删除模块**: 可能影响现有测试和外部依赖
  → 先 grep 所有引用, 确认无外部依赖
  → 删除前全量跑测试

## Impact

- **删除**: 6 个模块/文件
- **修改**: 5 个模块
- **新增**: 5 个文件 (2 SKILL + hook 注册 + 2 test)
- **重命名**: 1 个 stage + 1 个 knowledge 目录
- **归档**: 1 个旧 change
