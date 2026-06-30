---
name: spec-graph-status
description: "Show the unified workflow dashboard — pipeline progress, current stage, artifact statuses, check statuses, gate evaluations, and next required action. Use as the primary status check during development. AI agent should consult this before answering any 'where are we' question."
---

# spec-graph status

显示统一的工作流 dashboard。

## Architecture Principle

**spec-graph status 是只读快照 — 不修改任何状态。**

- ❌ status 不会推进工作流
- ❌ status 不会执行任何 check
- ❌ status 不会替你决策下一步
- ✅ status 只读取 graph + machine state,渲染 dashboard
- ✅ status 同时计算 next plan,显示当前阻塞项

**Agent 的职责**:基于 status 的真实状态回答用户问题,不要凭记忆回答。

参考 `CLAUDE.md`:
> 禁止直接回答问题而不检查状态
> ❌ 错误:用户问"当前进度",agent 凭记忆回答
> ✅ 正确:先运行 `spec-graph status`,基于实际状态回答

## What this does

整合 graph 和 machine state 的信息,展示:

- **Pipeline 进度条** — 用 ✓ / ▶ / · 标记每个阶段状态
- **当前阶段** — 工作流当前位置
- **Quick stats** — Artifacts X/Y completed,Checks X/Y passed
- **Artifact 状态表** — 每个 artifact 的 status + producer
- **Check 状态表** — 每个 check 的 status
- **Gate 状态** — 当前阻塞 gate + 缺失项
- **Next action** — 下一步该做什么(并提示用 `run` 还是 `dispatch`)

## Usage

```bash
# 人类可读 dashboard
spec-graph status

# JSON 输出(脚本集成用)
spec-graph status --json
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | JSON 输出,包含完整状态(plan / artifacts / checks / permissions) |

### JSON 输出结构

```json
{
  "current_stage": "specify",
  "pipeline": ["propose", "specify", "design", "..."],
  "artifacts": { "requirement/prd": { "status": "completed", "produced_by": "agent" } },
  "checks": { "lint": { "status": "passed" } },
  "plan": {
    "next_stage": "design",
    "gate_passed": false,
    "blocking_gate": "specify→design",
    "missing_artifacts": [],
    "failed_checks": [],
    "missing_traces": ["spec→design"],
    "suggested_actions": [...]
  },
  "permissions": { "level": "semi-auto" }
}
```

## Execution Rules

### ✅ When to use

- **回答用户"进度如何"之前**: 必查
- **每个工作周期开始时**: 确认当前状态
- **完成一个 action 之后**: 验证状态已更新
- **debug 工作流卡住时**: 看哪个 gate 阻塞
- **定期 checkpoint**: 开发中周期性查看

### ❌ When NOT to use

- **想看具体下一步**: 用 `spec-graph next`(更聚焦)
- **想看完整 dispatch manifest**: 用 `spec-graph dispatch --json`
- **未 compose**: 会报错,先 compose

## Agent Workflow

### Step 1: 运行 status

```bash
spec-graph status
```

### Step 2: 解读 dashboard

**Pipeline 进度条**:
```
✓ propose  →  ▶ specify  →  · design  →  · ...
```
- ✓ = 已完成
- ▶ = 当前阶段
- · = 未开始

**Quick stats**:
```
Stage: specify    Artifacts: 3/8    Checks: 5/10
```
确认进度比例是否合理。

**Gate Status**:
```
Gate:  specify→design
State: BLOCKED
  Missing traces: spec→design
```
→ 需要先创建 trace 才能进入下一阶段。

**Next Action**:
```
Next Action: Create trace 'spec→design'
Auto: spec-graph run         (确定性 → 用 run)
# 或
Manual: spec-graph dispatch  (需要 LLM → 用 dispatch)
```

### Step 3: 基于状态行动

- 状态显示"Auto: spec-graph run" → 跑 run
- 状态显示"Manual: spec-graph dispatch" → 跑 dispatch
- 工作流完成 (`✓ Workflow complete`) → 跑 `change complete`

## Usage Scenarios

### Scenario 1: 用户问"现在进度如何"

```bash
spec-graph status
# 基于输出回答:"当前在 specify 阶段,3/8 artifacts 完成,blocked 在 spec→design gate(缺 trace)"
# 不要凭记忆回答
```

### Scenario 2: 工作周期开始

```bash
spec-graph status
# 看清当前阶段、阻塞项、下一步
# 决定是 run 还是 dispatch
```

### Scenario 3: 完成 artifact 后验证

```bash
spec-graph artifact complete requirement/prd --producer agent
spec-graph status
# 确认 requirement/prd 显示 completed
# 确认 quick stats 更新
```

### Scenario 4: 调试工作流卡住

```bash
spec-graph status
# Gate Status 显示 BLOCKED
# Missing artifacts: ['design/architecture']
# → dispatch sub-agent 生成 architecture
```

### Scenario 5: 失败 — 未 compose

```bash
$ spec-graph status
✗ Not composed. Run `spec-graph compose` first.
# 修复: 先 init → sense → compose → prime
```

### Scenario 6: 工作流完成

```bash
$ spec-graph status
✓ Workflow complete
# → spec-graph change complete <id>
# → spec-graph change archive <id>
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Not composed` | 未 compose | `spec-graph compose` |
| Empty artifacts/checks | 未 prime | `spec-graph prime` |
| Permissions 显示 manual | 配置为 manual level | 改 `permissions.yaml` 为 semi-auto / full-auto |

## 衔接关系

- **前置**: `spec-graph compose` + `spec-graph prime`
- **后续**: 根据 Next Action 提示,跑 `spec-graph run` 或 `spec-graph dispatch`
- **替代查看**: `spec-graph next`(聚焦下一步)、`spec-graph show`(graph 概览)、`spec-graph dashboard`(更丰富的 HTML/terminal 视图)
- **完成时**: 进入 `spec-graph change complete`
