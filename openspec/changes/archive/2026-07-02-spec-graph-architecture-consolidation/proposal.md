## 最高原则：Brain, Not Hands

```
┌─────────────────────────────────────────────────────────────────────┐
│  这是 spec-graph 存在的全部理由，也是不可妥协的底线                  │
│                                                                     │
│  ✓ 是大脑 — 管理状态、生成 prompt、评估 gate、追踪进度              │
│  ✗ 不是手 — 不能 spawn 进程、不能调用 LLM、不能直接执行 agent      │
│                                                                     │
│  任何违反此原则的实现，无论文档、代码、测试，都必须删除。             │
│  这不是"优化"或"重构"，这是回归设计本意。                             │
│                                                                     │
│  所有 agent 调度必须通过用户环境的 hook 完成:                         │
│  Claude Code / Codex / Gemini CLI 自己 dispatch sub-agents           │
│  spec-graph 只产出 dispatch manifest (JSON)                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 违反此原则的实现 — 必须删除

```
┌─────────────────────────────────────────────────────────────────────┐
│ 文件 / 模块                      │ 违反方式                 │ 处理方式│
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ external-coordination/index.ts  │ spawn `claude -p`        │ 删除    │
│                                 │ createClaudeCodeAdapter │         │
│                                 │ createCodexAdapter       │         │
│                                 │ runProcess()            │         │
│                                 │ invokeAgent()           │         │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ prompt-construction/index.ts    │ 生成 XML prompt 供      │ 删除    │
│                                 │ invokeAgent 消费        │         │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ cli/commands/auto.ts            │ 调用 autoRun(), 触发    │ 删除    │
│                                 │ invokeAgent 路径        │         │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ cli/commands/next-prompt.ts     │ 生成 XML 供 agent 调用  │ 删除    │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ automator.autoRun()             │ 调用 invokeAgent        │ 删除    │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ packages/skills/spec-graph-auto/│ 引用 auto 命令          │ 删除    │
│                                 │ (整个 SKILL)             │         │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ README.md 中的 auto 文档        │ 描述 auto 命令          │ 删除    │
├─────────────────────────────────┼─────────────────────────┼─────────┤
│ spec-graph-v2 提案              │ 承诺 auto 命令          │ 归档    │
│                                 │ 违反 brain-not-hands    │         │
└─────────────────────────────────┴─────────────────────────┴─────────┘

所有 child_process 调用必须被删除:
  - spawn()
  - exec()
  - execSync()
  - spawnSync()
  - 任何 runProcess / invokeAgent / adapter 类代码
```

## 单一流程：Brain → Hook → Hands

```
Phase 0-3: Brain 的准备工作 (spec-graph 直接做)
  - init: 创建目录
  - plan: LLM 生成 capabilities
  - confirm: 锁定 plan
  - compose: 组装 graph.yaml

Phase 4-11: 8 阶段循环

  Brain (spec-graph)            Hook (dispatch-watcher)        Hands (Claude Code)
  ─────────────────            ──────────────────────         ─────────────────
  dispatch --json  ──────────▶  检测 Bash 输出               ─────┐
  (产出 manifest)              注入 system-reminder              │
                               ┌─────────────────────────────────┘
                               ▼
                               主 agent 看到 reminder
                               用 Agent tool 派发 sub-agents
                               主 agent 跑 advance --result ──▶ advance
                                                                  │
                                                                  ▼
                                                                  gate 评估
                                                                  machine-state 更新
                                                                  state 推进
                                                                  │
                                                                  ▼
                                                              重复 8 次
```

## 8 阶段规格

```
┌─────────────┬──────────────┬───────────────────┬──────────────────────────────────┐
│ 阶段         │ agent         │ 产出文件            │ Gate (exit criteria)                │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ specify     │ pm           │ proposal.md        │ 文件存在 + 4 个 section (Why/What/Caps/Impact)│
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ design      │ architect    │ design.md          │ 文件存在 + 4 个 section + traceability      │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ tasks       │ developer    │ tasks.md           │ checkbox 格式 + 至少 3 task + 覆盖 caps    │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ implement   │ developer    │ src/**/*           │ 源文件存在 + tsc pass + tests pass           │
│             │ standard     │                   │ (如果 tsc/test 可用)                          │
│             │ ★ parallel   │                   │                                    │
│             │ (Wave 0)     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ review      │ reviewer     │ review.md          │ 文件存在 + findings + resolutions              │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ test        │ qa           │ test.md            │ 文件存在 + 测试结果 + coverage                │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ accept      │ qa           │ verification.md    │ 文件存在 + 验收条件 + 人工确认                │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ integrate   │ developer    │ pr.md              │ 文件存在 + Summary + Test Plan                │
│             │ standard     │                   │                                    │
└─────────────┴──────────────┴───────────────────┴──────────────────────────────────┘
```

## 完整文件清单

```
spec-graph/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── automator/              # ✓ 状态机核心
│   │   │   ├── planning/               # ✓ LLM 意图分解
│   │   │   ├── gate-enforcement/       # ✓ 5 种规则评估
│   │   │   ├── knowledge-base/         # ✓ 工艺库
│   │   │   ├── recovery/               # ✓ 4 级重试
│   │   │   ├── sense/                  # ✓ 项目特征检测
│   │   │   ├── composer/               # ✓ pack 组装 + $or/$and
│   │   │   ├── machine-state/          # ✓ artifact 状态追踪
│   │   │   ├── dispatch/               # ✓ manifest 生成
│   │   │   ├── dependency-analyzer/    # ✓ 拓扑排序
│   │   │   │
│   │   │   ├── external-coordination/  # ✗ 删除 (spawn child_process)
│   │   │   └── prompt-construction/    # ✗ 删除 (XML 格式)
│   │   │
│   │   ├── knowledge/
│   │   │   └── stages/
│   │   │       ├── specify/
│   │   │       ├── design/
│   │   │       ├── tasks/              # 重命名自 plan/
│   │   │       ├── implement/
│   │   │       ├── review/
│   │   │       ├── test/
│   │   │       ├── accept/
│   │   │       └── integrate/
│   │   │
│   │   └── hooks/
│   │       └── dispatch-watcher.mjs    # ✓ PostToolUse hook
│   │
│   ├── cli/
│   │   └── src/
│   │       └── commands/
│   │           ├── init.ts             # ✓ 真实创建 .spec-graph/
│   │           ├── plan.ts             # ✓
│   │           ├── confirm.ts          # ✓
│   │           ├── compose.ts          # ✓
│   │           ├── dispatch.ts         # ✓
│   │           ├── advance.ts          # ✓
│   │           ├── status.ts           # ✓
│   │           ├── intervene.ts        # ✓
│   │           ├── diagnose.ts         # ✓
│   │           ├── sessions.ts         # ✓
│   │           ├── validate.ts         # ✓
│   │           ├── config.ts           # ✓
│   │           ├── machine.ts          # ✓
│   │           ├── artifact-complete.ts# ✓
│   │           ├── check-run.ts        # ✓
│   │           ├── completion.ts       # ✓
│   │           ├── auto.ts             # ✗ 删除
│   │           └── next-prompt.ts      # ✗ 删除
│   │
│   └── skills/
│       ├── spec-graph-plan/            # ✓
│       ├── spec-graph-dispatch/        # ✓ 新增
│       ├── spec-graph-status/          # ✓
│       ├── spec-graph-intervene/       # ✓
│       ├── spec-graph-diagnose/        # ✓
│       ├── spec-graph-validate/        # ✓
│       ├── spec-graph-init/            # ✓ 新增
│       └── spec-graph-auto/            # ✗ 删除 (整个 SKILL)
│
├── test-project/                       # ✓ E2E 测试项目
│
└── openspec/
    └── changes/
        ├── spec-graph-architecture-consolidation/  # ✓ 当前提案
        ├── production-ready-dispatch/  # ✓ 已完成 (51 tasks)
        └── spec-graph-v2/             # ✗ 归档
```

## 唯一流程

```
Phase 0: spec-graph init
  → 创建 .spec-graph/{config.yaml, sessions/}
  → 如果 pack 目录存在 → spec-graph compose → graph.yaml

Phase 1: spec-graph plan "<intent>"
  → LLM 生成 capabilities (存 state.yaml#plan.capabilities)
  → sessionId 生成
  → state = "paused"

Phase 2: spec-graph confirm <sessionId>
  → state = "running"
  → trace.push(user-force)

Phase 3: spec-graph compose
  → 扫描 packs → applies_when 过滤 (AND + $or + $and)
  → priority 合并 → graph.yaml

Phase 4-11: 8 阶段 FSM 循环

  ┌─────────────────────────────────────────────────────┐
  │ Step 1: spec-graph dispatch --session <id> --json  │
  │                                                     │
  │   读 graph.yaml + state.yaml + machine-state.yaml  │
  │   产出 DispatchManifest:                            │
  │   {                                                 │
  │     current_stage,                                  │
  │     gate_passed,                                    │
  │     actions: [{                                     │
  │       id, agent_id, model_tier,                     │
  │       parallel_group,                               │
  │       prompt (9 段 envelope),                       │
  │       output_spec, file_scope, verification,        │
  │       next_step                                     │
  │     }]                                              │
  │   }                                                 │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step 2: dispatch-watcher hook (在用户环境里触发)     │
  │                                                     │
  │   PostToolUse(Bash) 检测到 "spec-graph dispatch"    │
  │   解析 manifest → 注入 system-reminder 到 Claude Code│
  │   "Wave 0 (PARALLEL): dispatch N sub-agents"         │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step 3: 用户环境 (Claude Code / Codex / ...) 派发   │
  │                                                     │
  │   主 agent 用 Agent tool 同时派发 N 个 sub-agent   │
  │   spec-graph 不参与这个过程                          │
  │   spec-graph 看不到 sub-agent 的调用过程              │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step 4: 用户跑 spec-graph advance --result '<json>'│
  │                                                     │
  │   收集 sub-agent 的 artifacts[]                    │
  │   写 artifact 文件                                   │
  │   评估 gate                                          │
  │                                                     │
  │   If passed:                                        │
  │     - trace.push(gate-pass)                         │
  │     - completedArtifacts.push                       │
  │     - machineState.trackArtifact(completed)         │
  │     - stage → 下一阶段                               │
  │                                                     │
  │   If failed:                                        │
  │     - diagnosis + retry                              │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
              下一个阶段 (重复 8 次)
              直到 state = "completed"
```

## 8 阶段规格

```
┌─────────────┬──────────────┬───────────────────┬──────────────────────────────────┐
│ 阶段         │ agent         │ 产出文件            │ Gate (exit criteria)                │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ specify     │ pm           │ proposal.md        │ 文件存在 + 4 个 section (Why/What/Caps/Impact)│
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ design      │ architect    │ design.md          │ 文件存在 + 4 个 section + traceability      │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ tasks       │ developer    │ tasks.md           │ checkbox 格式 + 至少 3 task + 覆盖 caps    │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ implement   │ developer    │ src/**/*           │ 源文件存在 + tsc pass + tests pass           │
│             │ standard     │                   │ (如果 tsc/test 可用)                          │
│             │ ★ parallel   │                   │                                    │
│             │ (Wave 0)     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ review      │ reviewer     │ review.md          │ 文件存在 + findings + resolutions              │
│             │ capable      │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ test        │ qa           │ test.md            │ 文件存在 + 测试结果 + coverage                │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ accept      │ qa           │ verification.md    │ 文件存在 + 验收条件 + 人工确认                │
│             │ standard     │                   │                                    │
├─────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
│ integrate   │ developer    │ pr.md              │ 文件存在 + Summary + Test Plan                │
│             │ standard     │                   │                                    │
└─────────────┴──────────────┴───────────────────┴──────────────────────────────────┘
```

## 9 段 Envelope 格式

```
1. Identity             → sub-agent 角色声明
2. System Prompt        → 从 pack/agents/*.md 加载的领域知识
3. Task Context         → Stage/Session/Intent/Action/Parallel group
4. Input Artifacts      → 上游产出 (READ-ONLY, 截断到 3000 字)
5. Output Spec (MUST)   → 精确路径 + 模板 + 格式
6. File Scope (MUST)    → read[] / write[] / forbid[] glob 数组
7. Verification (MUST)  → lint/test/typecheck 命令
8. Status Report (MUST) → fenced code block JSON
9. After Completion     → next_step 命令
```

## 完整文件清单

```
spec-graph/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── automator/              # 状态机核心 (保留)
│   │   │   ├── planning/               # LLM 意图分解 (保留)
│   │   │   ├── gate-enforcement/       # 5 种规则评估 (保留)
│   │   │   ├── knowledge-base/         # 工艺库 (保留)
│   │   │   ├── recovery/               # 4 级重试 (保留)
│   │   │   ├── sense/                  # 项目特征检测 (保留)
│   │   │   ├── composer/               # pack 组装 + $or/$and (保留+加强)
│   │   │   ├── machine-state/          # artifact 状态追踪 (保留)
│   │   │   ├── dispatch/               # manifest 生成 (保留)
│   │   │   ├── dependency-analyzer/    # 拓扑排序 (保留)
│   │   │   │
│   │   │   ├── external-coordination/  # ★ 删除 (spawn child_process)
│   │   │   └── prompt-construction/    # ★ 删除 (XML 格式, 被 envelope 替代)
│   │   │
│   │   ├── knowledge/
│   │   │   └── stages/
│   │   │       ├── specify/
│   │   │       ├── design/
│   │   │       ├── tasks/              # ★ 从 plan/ 重命名
│   │   │       ├── implement/
│   │   │       ├── review/
│   │   │       ├── test/
│   │   │       ├── accept/
│   │   │       └── integrate/
│   │   │
│   │   └── hooks/
│   │       └── dispatch-watcher.mjs    # PostToolUse hook (保留)
│   │
│   ├── cli/
│   │   └── src/
│   │       └── commands/
│   │           ├── init.ts             # ★ 重写: 真实创建 .spec-graph/
│   │           ├── plan.ts             # 保留
│   │           ├── confirm.ts          # 保留
│   │           ├── compose.ts          # 保留
│   │           ├── dispatch.ts         # 保留
│   │           ├── advance.ts          # 保留
│   │           ├── status.ts           # 保留
│   │           ├── intervene.ts        # 保留
│   │           ├── diagnose.ts         # 保留
│   │           ├── sessions.ts         # 保留
│   │           ├── validate.ts         # 保留
│   │           ├── config.ts           # 保留
│   │           ├── machine.ts          # 保留
│   │           ├── artifact-complete.ts# 保留
│   │           ├── check-run.ts        # 保留
│   │           ├── completion.ts       # 保留
│   │           ├── auto.ts             # ★ 删除
│   │           └── next-prompt.ts      # ★ 删除
│   │
│   └── skills/                         # SKILL.md 文件
│       ├── spec-graph-plan/
│       ├── spec-graph-dispatch/        # ★ 新增 (dispatch + hook 流程)
│       ├── spec-graph-status/
│       ├── spec-graph-intervene/
│       ├── spec-graph-diagnose/
│       ├── spec-graph-validate/
│       └── spec-graph-init/            # ★ 新增
│
├── test-project/                       # E2E 测试项目
│   ├── .claude/
│   │   └── settings.json              # 注册 dispatch-watcher hook
│   ├── .spec-graph/                   # 工作目录
│   ├── package.json
│   └── src/{math-utils, string-utils, date-utils}/
│
└── openspec/
    └── changes/
        ├── spec-graph-architecture-consolidation/  # ★ 当前提案
        ├── production-ready-dispatch/  # 已完成 (51 tasks)
        └── spec-graph-v2/             # ★ 归档 (承诺被替代)
```

## 关键决策

```
决策 1: 单一调度路径
  ✗ 删除 auto 命令 (spawn child process)
  ✗ 删除 invokeAgent 函数
  ✗ 删除 external-coordination 模块
  ✓ 保留 dispatch + dispatch-watcher.mjs hook

决策 2: 单一 prompt 格式
  ✗ 删除 prompt-construction 模块 (XML)
  ✓ 保留 dispatch 的 9 段 envelope

决策 3: FSM stage 命名
  ✓ plan → tasks (消除与 spec-graph plan 命令的冲突)
  ✓ 保留 Plan TypeScript type 和 state.yaml#plan 字段

决策 4: init 真实实现
  ✓ 创建 .spec-graph/config.yaml, sessions/
  ✓ 可选: 如果 pack 存在 → 自动 compose

决策 5: compose 支持 $or/$and
  ✓ 嵌套操作符解析, 限制 2 层

决策 6: tasks stage 看 capabilities
  ✓ prompt 注入 plan.capabilities
  ✓ gate 验证 tasks 覆盖所有 capabilities

决策 7: implement gate 真实检查
  ✓ 源文件存在
  ✓ tsc --noEmit (如可用)
  ✓ vitest run (如可用)

决策 8: Hook 安装方式
  ✓ spec-graph init 自动注册 hook 到 .claude/settings.json
  ✓ 或提供 spec-graph install --hook dispatch-watcher 命令

决策 9: 分阶段实施
  ✓ 阶段 1: 增量增强 (新功能 + 重命名 + deprecation warnings)
  ✓ 阶段 2: 删除旧功能 (auto/next-prompt/external-coordination)
  ✓ 给用户迁移时间
```

## 不做什么

```
✗ 不 spawn child process (任何形式)
✗ 不直接调用 LLM API
✗ 不直接执行 agent
✗ 不保留 auto 命令的旧实现
✗ 不保留 XML prompt 格式
✗ 不保留 auto 作为"快捷方式"
✗ 不维护 child_process 兼容层
```

## 影响

```
删除:
  - packages/core/src/external-coordination/ 整个目录
  - packages/core/src/prompt-construction/ 整个目录
  - packages/cli/src/commands/auto.ts
  - packages/cli/src/commands/next-prompt.ts
  - automator.autoRun() 函数

重命名:
  - FSM stage 'plan' → 'tasks'
  - knowledge/stages/plan/ → knowledge/stages/tasks/
  - pack agent_bindings.plan → .tasks

加强:
  - init 真实创建目录
  - compose $or/$and 解析
  - tasks stage 看 capabilities
  - implement gate 检查代码

新增:
  - spec-graph-dispatch SKILL.md
  - spec-graph-init SKILL.md
  - hook 自动注册 (在 init 或 install 时)

文档:
  - README.md 全面更新
  - 删除 auto 命令文档
  - 添加 dispatch + hook 详细流程
```
