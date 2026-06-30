---
name: spec-graph-machine
description: "Direct state machine control: init, status, transition, history, update artifact/check status, restart-stage. The core FSM engine. spec-graph enforces transition rules — does NOT decide when to advance (dispatch / agent decides)."
---

# spec-graph machine

直接操作工作流状态机 — init / status / transition / history / update / restart-stage。

## Architecture Principle

**spec-graph 是状态机执行器 — 不替你决定何时推进。**

- ❌ spec-graph 不会自动判断「该 transition 了」(由 dispatch / agent 决定)
- ❌ spec-graph 不会绕过 gate(transition 失败时 state 不更新)
- ❌ spec-graph 不会自动重试 transition(失败需修复后重跑)
- ✅ spec-graph 强制 transition 规则:current stage + graph 声明 + gate 通过
- ✅ spec-graph 记录完整 transition history(审计)
- ✅ spec-graph 支持 restart-stage(保 completed,重置 pending)

**Agent 职责**:基于 dispatch 决定 transition → 验证 gate → 失败时修复 → 重试。

## What this does

状态机是工作流的核心引擎,持久化在 `.spec-graph/machine-state.yaml`:

- **current_stage** — 当前在哪个 stage(specify/design/plan/implement/review/accept)
- **stage_history[]** — transition 历史(审计)
- **artifacts{}** — artifact 运行时状态(pending/in_progress/ready/completed/failed/blocked)
- **checks{}** — check 运行时状态(pending/running/passed/failed)

### Transition 规则(强制)

transition 必须满足:

1. **from_stage == current_stage** — 不能从非当前 stage 跳
2. **graph 声明的合法跳转** — 必须是 pipeline 中的相邻 stage(或 graph 允许的跳转)
3. **gate 通过** — 所有 require_artifacts / require_checks / require_traces / forbid / require_contracts 都满足

**gate 不通过时,state 不更新**(原子性)。

### restart-stage 语义

`restart-stage` 把当前 stage 中 **未完成** 的 artifact/check 重置为 pending,**保留** 已 completed 的。用于:

- gate 失败后想重做当前 stage(不丢失已完成工作)
- 想从当前 stage 重新 dispatch(不回退到上一 stage)

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `init --stage <s>` | 初始化状态机(指定起始 stage) |
| `status` | 显示当前状态(stage + artifacts + checks) |
| `transition --from <a> --to <b>` | 推进 stage(过 gate) |
| `history` | 查看 transition 历史 |
| `artifacts` | 列出 tracked artifacts |
| `update --artifact/--check <id> --status <s>` | 更新单个 artifact/check 状态 |
| `restart-stage` | 重置当前 stage 未完成项 |

## Usage

```bash
# 初始化(通常由 prime 完成,不需要手动)
spec-graph machine init --stage implement

# 看当前状态
spec-graph machine status

# 推进 stage
spec-graph machine transition \
  --from plan \
  --to implement \
  --action "completed planning"

# 查看历史
spec-graph machine history

# 更新 artifact 状态(底层调用,等价 artifact update)
spec-graph machine update --artifact plan/tasks --status completed

# 更新 check 状态
spec-graph machine update --check lint --status passed

# 重启当前 stage(保 completed,重置 pending)
spec-graph machine restart-stage
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `--stage <s>` | init | 初始 stage |
| `--from <s>` | transition | 源 stage(必须 == current) |
| `--to <s>` | transition | 目标 stage |
| `--action <text>` | transition | 触发者 / 动作描述(记入 history) |
| `--artifact <id>` | update | 更新 artifact |
| `--check <id>` | update | 更新 check |
| `--status <s>` | update | artifact(pending/in_progress/ready/completed/failed/blocked)或 check(pending/running/passed/failed) |

## Execution Rules

### ✅ 应该用 machine 的场景

| 场景 | 操作 |
|------|------|
| 手动推进 stage(不通过 dispatch) | `transition --from X --to Y` |
| 查看 transition 历史(审计) | `history` |
| 查看完整状态(artifacts + checks 表) | `status` |
| gate 失败,想重做当前 stage | `restart-stage` |
| 底层更新 check 状态(等价 check pass) | `update --check <id> --status passed` |

### ❌ 不应该用 machine 的场景

| 场景 | 替代做法 |
|------|---------|
| 推进工作流(常规) | `spec-graph dispatch --json`(走 dispatch 自动 transition) |
| 更新 artifact 状态 | `spec-graph artifact complete`(更高级 API) |
| 跑 check | `spec-graph check <id>` |
| 看 dashboard | `spec-graph dashboard` |
| 修复 gate 失败 | 看 `gate` 输出,补 artifact/check/trace |

> **注**: dispatch 内部会调 transition,日常用 dispatch 即可。machine 命令主要用于**手动调试 / 审计 / 边界情况**。

## Agent Workflow

### 标准 transition(手动)

```
1. 确认当前 stage
   spec-graph machine status
   ↓
2. 确认 gate 已通过
   spec-graph gate <transition-id>
   ↓ (passed)
3. 推进
   spec-graph machine transition \
     --from <current> --to <next> \
     --action "manual transition by agent"
   ↓
   - 触发 pre/post hooks
   - 跑 gate 评估
   - 通过:state 更新,history 追加
   - 失败:state 不变,列出 missing items
```

### restart-stage(gate 卡住时)

```
1. gate 失败,有些 artifact 需要重做
   spec-graph gate <transition>
   ↓ (failed: missing artifacts)
2. 选择:重做当前 stage,但保留已完成
   spec-graph machine restart-stage
   ↓
   - 当前 stage 的 in_progress/pending artifact → pending
   - completed 的保留
   - history 追加 "restart-stage"
3. 重新 dispatch 生产缺失的 artifact
```

## Usage Scenarios

### Scenario 1: 手动 transition(过 gate)

```bash
spec-graph machine status
# Current Stage: plan

spec-graph gate plan-to-implement
# ✓ Gate passed

spec-graph machine transition \
  --from plan \
  --to implement \
  --action "planning done, starting impl"
# ✓ Transition successful: plan → implement
#   Gate: plan-to-implement
#   Passed: true
```

### Scenario 2: transition 失败(gate 阻塞)

```bash
$ spec-graph machine transition --from plan --to implement
✗ Transition failed: gate check failed
  Gate: plan-to-implement
  Missing artifacts:
    • plan/tasks
  Failed checks:
    • validate-plan
# state 没变,修复后重试:
spec-graph artifact complete plan/tasks
spec-graph check validate-plan --status passed
spec-graph machine transition --from plan --to implement
```

### Scenario 3: restart-stage(重做当前)

```bash
spec-graph machine restart-stage
# ⚠ Stage restarted (incomplete items reset to pending)
#   Current stage: implement
#   Added to history: restart-stage

# 已完成的 implementation/api 保留
# 未完成的 implementation/db 重置为 pending
spec-graph dispatch --json   # 重新生产缺失项
```

### Scenario 4: 查看历史(审计)

```bash
spec-graph machine history
# 📜 Transition History
#   #  From       To         When          Triggered By     Gate
#   1  specify    design     2026-06-28    dispatch         ✓
#   2  design     plan       2026-06-29    dispatch         ✓
#   3  plan       implement  2026-06-30    manual           ✓
```

### Scenario 5: 更新 check 状态(底层)

```bash
spec-graph machine update --check lint --status passed
# ✓ Check lint updated to passed
# 等价于 spec-graph check pass lint(如果有该命令)
```

### Scenario 6: 失败 — from != current

```bash
$ spec-graph machine transition --from specify --to design
# 当前是 implement,但 from 写了 specify
✗ Transition failed: ...
# state 不变,修复:用当前 stage 作 from
spec-graph machine status   # 看 current_stage
spec-graph machine transition --from implement --to review
```

### Scenario 7: 失败 — 未 compose

```bash
$ spec-graph machine status
✗ Graph not found. Run `spec-graph compose` first.
# 修复:
spec-graph compose
spec-graph prime   # 通常 prime 会自动 init machine
```

### Scenario 8: 失败 — update 缺参数

```bash
$ spec-graph machine update --status completed
✗ Missing required option: --artifact or --check
# 修复:指定 --artifact 或 --check
spec-graph machine update --artifact plan/tasks --status completed
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| `Missing required options: --from and --to` | transition 缺参数 | 补全 |
| `Transition failed: gate check failed` | gate 未通过 | 修 artifact/check/trace,或 `restart-stage` |
| `Missing required option: --artifact or --check` | update 缺目标 | 加 `--artifact <id>` 或 `--check <id>` |
| `Invalid artifact status` | status 值错 | 用枚举值 |
| transition from != current | from 写错 | `status` 看 current,再用对的 from |

## 衔接关系

- **前置**: `compose`(graph) + `init`/`prime`(machine-state.yaml)
- **核心引擎**: 所有 transition / artifact 状态都通过 StateMachineEngine
- **与 dispatch 协同**: dispatch 内部调 transition,日常走 dispatch 即可;machine 命令用于手动 / 调试
- **与 artifact/check 协同**: `machine update` 是底层 API,`artifact complete` / `check pass` 是高层封装
- **与 gate 协同**: transition 时自动跑 gate 评估,失败 state 不变
- **与 restart-stage**: gate 卡住时的「原地重试」,不回退 stage
- **审计**: stage_history 是 transition 完整记录,可用于 retro / 复盘
- **持久化**: `.spec-graph/machine-state.yaml`(每次操作原子写入)
