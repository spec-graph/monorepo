---
name: spec-graph-next
description: "Show the next required workflow step. Computes what must happen to advance past the current gate, with a list of blocking items and suggested actions. AI agent uses this as the primary 'what do I do now?' command. Use as a regular checkpoint during development."
---

# spec-graph next

显示下一步要做的事情。

## Architecture Principle

**spec-graph next 只做计算,不做执行。**

- ❌ next 不会自动执行任何 action
- ❌ next 不会替你决定优先做哪个
- ❌ next 不会修改状态
- ✅ next 计算当前阻塞项,列出建议 action
- ✅ next 标注每个 action 是否可自动执行

**Agent 的职责**:基于 next 的输出决定调用哪个命令(`run` / `dispatch` / `trace add`)。

## What this does

**Next 引擎**通过以下步骤计算下一步:

1. 找到工作流中的下一个阶段
2. 找到守护该转换的 gates
3. 评估缺什么(artifacts / checks / traces / forbidden violations)
4. 给出解除阻塞的具体建议 action

### 输出包含

- **Current Stage** / **Next Stage** / **Transition**
- **Blocking Gate** + **Gate Passed** 状态
- **Blocking Items 表格**:
  - missing artifact
  - failed/missing check
  - missing trace
  - contract drift
  - forbidden violation
- **Suggested Actions 表格**:
  - 序号 / Type / ID / Command 或 Description

## Usage

```bash
# 人类可读
spec-graph next

# JSON 输出
spec-graph next --json
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | JSON 输出完整的 NextPlan |

### Suggested action types

| Type | Description | Auto-executable? | 用什么命令 |
|------|-------------|------------------|-----------|
| `produce_artifact` | 创建必需的工作产品 | No (agent 工作) | `spec-graph dispatch` |
| `run_check` | 执行验证 check | Yes (semi-auto+) | `spec-graph run` 或 `spec-graph check --id <id>` |
| `verify_trace` | 确认 traceability 链接 | No (需创建 trace) | `spec-graph trace add ...` |
| `resolve_violation` | 修复 forbidden 不变量 | No (agent 工作) | `spec-graph dispatch` |
| `transition` | 推进到下一阶段 | Yes (semi-auto+) | `spec-graph run` |
| `perform_stage` | 完成下一阶段的工作 | No (agent 工作) | `spec-graph dispatch` |

## Execution Rules

### ✅ When to use

- **"what do I do now?" 的回答**: 不知道下一步时
- **每个工作周期开始**: 确认下一步行动
- **debug 阻塞**: 看清缺什么 artifact / check / trace
- **作为 run / dispatch 的前置检查**: 知道该用哪个

### ❌ When NOT to use

- **想看整体进度**: 用 `spec-graph status`(包含 next 信息 + 更多)
- **想执行 action**: 用 `spec-graph run`(自动)或 `spec-graph dispatch`(LLM 工作)
- **未 compose**: 会报错

## Agent Workflow

### Step 1: 运行 next

```bash
spec-graph next
```

### Step 2: 解读输出

```
🧭 Next Step

  Current Stage: specify
  Next Stage:    design
  Transition:    specify→design
  Gate:          specify→design
  Gate Passed:   no

  Blocking Items:
  Type               ID
  missing artifact   design/architecture
  missing trace      spec→design

  Suggested Actions:
  #  Type              ID                    Command / Description
  1  produce_artifact  design/architecture   Create architecture document
  2  verify_trace      spec→design           Create spec→design trace
```

### Step 3: 选择行动策略

**情况 A: 全是确定性 action (run_check / transition)**
```bash
spec-graph run
```

**情况 B: 有 LLM action (produce_artifact / perform_stage / resolve_violation)**
```bash
spec-graph dispatch --json
# 按 manifest 处理
```

**情况 C: 有 verify_trace**
```bash
# 创建 trace(或等 artifact 完成自动 wire)
spec-graph trace add --from <from_kind> --to <to_kind> --via <via>
```

**情况 D: gate_passed: yes 且只有 transition**
```bash
spec-graph run     # 自动 transition
```

### Step 4: 完成后重新 next

```
spec-graph next  →  Do the work  →  spec-graph next  →  ...  →  Done
```

## Usage Scenarios

### Scenario 1: 不知道下一步做什么

```bash
spec-graph next
# 看清当前阶段、阻塞项、建议 action
# 选 run / dispatch / trace add
```

### Scenario 2: 验证 gate 通过

```bash
spec-graph next
# Gate Passed: yes
# Suggested Actions: transition specify→design
# → spec-graph run(自动 transition)
```

### Scenario 3: 缺多个 artifact

```bash
spec-graph next
# Blocking Items:
#   missing artifact: design/architecture
#   missing artifact: design/adr
# Suggested Actions: 两个 produce_artifact
# → spec-graph dispatch --all(并行)或逐个 dispatch
```

### Scenario 4: 工作流完成

```bash
$ spec-graph next
Workflow is complete.
# → spec-graph change complete <id>
```

### Scenario 5: 失败 — graph 不存在

```bash
$ spec-graph next
✗ Graph not found. Run `spec-graph compose` first.
# 修复: 先 compose
```

### Scenario 6: 失败 — 工作流卡死

```bash
$ spec-graph next
# Gate Passed: no
# 但 Suggested Actions 为空
# 原因: 可能是 forbidden_violation 没有对应 action
# → 检查 Blocking Items 表中的 forbidden violation 项
# → 手动 dispatch sub-agent 修复
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| Empty suggested actions 但 gate blocked | forbidden violation 等无法自动建议 | 手动 `spec-graph dispatch`,触发 resolve_violation |
| Missing artifact references 错误 | graph 内部引用错误 | 重新 compose 或修复 pack template |

## 衔接关系

- **前置**: `spec-graph compose` + `spec-graph prime`
- **后续**: 根据 action 类型 → `spec-graph run` / `spec-graph dispatch` / `spec-graph trace add`
- **替代查看**: `spec-graph status`(更全的 dashboard,next 是其子集)
- **执行入口**:
  - 确定性 → `spec-graph run`
  - LLM 工作 → `spec-graph dispatch`
  - 创建 trace → `spec-graph trace add`
- **完成时**: 进入 `spec-graph change complete`
