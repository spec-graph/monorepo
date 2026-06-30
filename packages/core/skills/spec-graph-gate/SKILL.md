---
name: spec-graph-gate
description: "Evaluate workflow gates and show what blocks progression. Checks required artifacts (completed?), required checks (passed?), required traces (satisfied?), and forbidden invariants (violated?). spec-graph is a neutral enforcement engine — does NOT decide whether a transition SHOULD happen, only whether declared requirements are met. Use when a transition is blocked, before/after a transition, or as a pre-commit/pre-merge quality gate."
---

# spec-graph gate

评估 workflow 中的所有 gate,报告哪些通过、哪些被阻塞,以及具体缺少什么。

## Architecture Principle

**spec-graph 不判断是否应推进 — 只检查声明的条件是否满足。**

- ❌ spec-graph 不会"建议"你是否应该过 gate
- ❌ spec-graph 不会替你补全缺失的 artifact
- ❌ spec-graph 不会替你重跑失败的 check
- ❌ spec-graph 不会替你修复 trace 链接
- ✅ spec-graph 只读 graph.yaml 的 gate 声明,对照 machine-state.yaml,得出 pass/fail
- ✅ spec-graph 报告 `missing_artifacts` / `missing_checks` / `missing_traces` / `violated_forbids` 的精确清单
- ✅ spec-graph 在 `blocking_gates` 非空时以 exit code 1 退出(供 CI / hook 使用)

**Agent 的职责**:读 gate 输出 → 判断每个缺失项的修复路径 → 调用对应命令(`artifact complete` / `check` / `trace`)→ 重新 `gate` 直到通过。

参考 `CLAUDE.md`:
> 7 gates 守护状态转换。A transition is blocked until all required artifacts are completed, all required checks pass, and all required traces are verified.

## What this does

**Enforce engine** 评估每个 enabled gate,逐项检查:

1. **required artifacts** — 是否在 machine state 中标记为 `completed`?
2. **required checks** — 是否在 machine state 中标记为 `passed`?
3. **required traces** — trace 文件是否满足声明的 query + cardinality?
4. **forbidden invariants** — 是否存在声明的违规(如 `duplicate_implementation`)?

输出:
- 每个 gate 的 pass/fail 状态
- 缺失项计数(N artifacts, M checks, K traces, J invariants)
- `blocking_gates` 列表(导致工作流无法推进的 gate)
- exit code: 全部通过 = 0,有 blocking = 1

## Usage

```bash
# 评估所有 gate
spec-graph gate

# 只评估某个 gate
spec-graph gate --phase entry-phase4
```

### Options

| Option | Description |
|--------|-------------|
| `--phase <gate-id>` | 只评估指定的 gate(如 `entry-phase4`、`requirements-clarified`) |

> 注意:命令没有 `--json` 选项。需要结构化输出请用 `spec-graph status --json` 或直接读 `machine-state.yaml`。

## Output 解读

```
🚧 Gate Evaluation

┌──────────────────────────┬──────────┬──────────────────────────┐
│ Gate ID                  │ Status   │ Missing                  │
├──────────────────────────┼──────────┼──────────────────────────┤
│ requirements-clarified   │ ✓ PASS   │ -                        │
│ architecture-ready       │ ✗ FAIL   │ 2 artifacts, 1 trace     │
│ contract-frozen          │ ✗ FAIL   │ 1 check                  │
└──────────────────────────┴──────────┴──────────────────────────┘

  Summary: 1/3 gates passed

  ❌ BLOCKED by gates:
    • architecture-ready
    • contract-frozen
```

**读法**:
- `Missing: -` = 此 gate 所有要求都满足
- `N artifacts` = N 个 artifact 未标记 `completed`(去看 `missing_artifacts` 详细列表,通过 `spec-graph status` 查)
- `N checks` = N 个 check 未标记 `passed`(去跑 `spec-graph check`)
- `N traces` = trace query 未满足(去补 trace 文件或 `artifact complete` 自动 wire)
- `N invariants` = 触发了禁止的 invariant(去看 graph.yaml 的 `forbids` 列表)

## Gate 声明格式(graph.yaml)

```yaml
gates:
  - id: entry-phase4
    requires:
      artifacts: [plan/story, plan/tasks]    # 必须是 completed
      checks: [lint, typecheck]               # 必须是 passed
      traces:                                 # trace query + cardinality
        - query: "requirement→plan"
          cardinality: every                  # every | exists | single
    forbids:                                  # 禁止的 invariant
      - duplicate_implementation
```

### Cardinality 含义

| Cardinality | 含义 |
|-------------|------|
| `every` | 每个 from 节点都必须有对应的 to 节点(全量覆盖) |
| `exists` | 至少存在一条 from→to 的链接 |
| `single` | 必须有且仅有一条链接 |

## 常见 gate

| Gate ID | 守护的转换 |
|---------|-----------|
| `entry-phase4` | plan → implement |
| `exit-merged` | accept → integrate |
| `requirements-clarified` | specify → design |
| `architecture-ready` | design → plan |
| `contract-frozen` | contract → implement |

具体 gate 由 pack 决定(feature.pack、bugfix.pack 等声明各自的 gate)。

## 何时使用 — 判断标准

### ✅ 应该使用 gate

| 场景 | 用法 |
|------|------|
| dispatch 前 | 确认当前 stage 的 gate 是否已通过(决定是否还能继续) |
| 转换 stage 前 | 验证目标 gate 通过,才执行 transition |
| `change complete` 前 | 这是 soft-gate,但提前跑可避免 warn |
| CI / pre-commit hook | 作为质量门禁,失败则阻止合并 |
| sub-agent BLOCKED 时 | 查 gate 找出阻塞点 |
| 修复后验证 | 补完 artifact / 跑完 check 后再跑一次 gate 确认 |

### ❌ 不应该使用 gate

| 场景 | 替代做法 |
|------|---------|
| 查当前进度 | `spec-graph status` |
| 查下一步该做什么 | `spec-graph dispatch --json` |
| 跑测试 | `spec-graph check` |
| 查 trace 链接 | `spec-graph trace` |
| 查 change 状态 | `spec-graph change show <id>` |

## Agent Workflow

```
1. spec-graph gate
   ↓
2. 读输出,识别 blocking_gates
   ↓
3. 对每个 blocking gate:
   ├── missing_artifacts → spec-graph artifact complete <id>(标记 completed)
   ├── missing_checks    → spec-graph check --id <check-id>(跑命令)
   ├── missing_traces    → 编辑 trace 文件 或 spec-graph artifact complete 自动 wire
   └── violated_forbids  → 人工排查 invariant 违规(通常是设计问题)
   ↓
4. 重新 spec-graph gate
   ↓
5. 重复 3-4 直到 Summary: N/N gates passed
   ↓
6. 继续工作流:spec-graph dispatch --json 或 spec-graph next
```

## 与 Agent 的协作关系

- **主 agent**:跑 gate,读输出,决定修复路径,分派 sub-agent
- **sub-agent**:接收 fix 任务(如"补全 architecture doc"),写文档,标记 artifact completed
- **coordinator**:dispatch manifest 的 `gate_status` 字段会引用最近一次 gate 结果
- **hook**:pre-commit 可调用 `spec-graph gate`,失败则阻止 commit

## Usage Scenarios

### Scenario 1: 标准 — 转换前检查(成功)

```bash
# 当前在 specify stage,想转到 design
$ spec-graph gate
🚧 Gate Evaluation

┌──────────────────────────┬────────┬─────────┐
│ Gate ID                  │ Status │ Missing │
├──────────────────────────┼────────┼─────────┤
│ requirements-clarified   │ ✓ PASS │ -       │
└──────────────────────────┴────────┴─────────┘

  Summary: 1/1 gates passed
  ✅ All gates passed!

# 可以推进
$ spec-graph next
```

### Scenario 2: 转换前检查(失败 — 缺 artifact)

```bash
$ spec-graph gate
┌────────────────────┬────────┬─────────────────────────┐
│ Gate ID            │ Status │ Missing                 │
├────────────────────┼────────┼─────────────────────────┤
│ architecture-ready │ ✗ FAIL │ 2 artifacts, 1 trace    │
└────────────────────┴────────┴─────────────────────────┘

  ❌ BLOCKED by gates:
    • architecture-ready

# exit code 1
```

**修复流程**:
```bash
# 1. 查具体缺哪些 artifact
$ spec-graph status
# 输出:design/c4 - pending, design/addrs - missing

# 2. 让 sub-agent 生产文档,然后标记 completed
$ spec-graph artifact complete design/c4
$ spec-graph artifact complete design/addrs

# 3. 重新跑 gate
$ spec-graph gate
# 输出: ✓ PASS
```

### Scenario 3: 失败 — 缺 check

```bash
$ spec-graph gate
┌─────────────────┬────────┬──────────┐
│ Gate ID         │ Status │ Missing  │
├─────────────────┼────────┼──────────┤
│ contract-frozen │ ✗ FAIL │ 1 check  │
└─────────────────┴────────┴──────────┘
```

**修复流程**:
```bash
# 跑那个 check
$ spec-graph check --id typecheck
# ✓ PASS,自动更新 machine state

# 重新跑 gate
$ spec-graph gate
# ✓ PASS
```

### Scenario 4: 失败 — trace 不满足(every)

```bash
$ spec-graph gate
┌──────────────────────┬────────┬──────────┐
│ Gate ID              │ Status │ Missing  │
├──────────────────────┼────────┼──────────┤
│ requirement-coverage │ ✗ FAIL │ 3 traces │
└──────────────────────┴────────┴──────────┘
# 意味着:有 3 个 requirement 没有 plan/story derives 到它

# 修复:让 sub-agent 为这些 requirement 创建 story
# trace 通过 artifact complete 自动 wire,或手动编辑 .spec-graph/traces/*.yaml
```

### Scenario 5: 失败 — invariant 违规

```bash
$ spec-graph gate
┌─────────────────────────┬────────┬───────────────┐
│ Gate ID                 │ Status │ Missing       │
├─────────────────────────┼────────┼───────────────┤
│ no-duplicate-impl       │ ✗ FAIL │ 1 invariants  │
└─────────────────────────┴────────┴───────────────┘
# 触发 duplicate_implementation invariant
# 通常意味着两个 artifact 实现了同一个 contract

# 修复:人工审查 graph,合并或拆分 artifact(无法自动修复)
```

### Scenario 6: CI 中作为质量门禁

```bash
# .github/workflows/quality.yml
- name: Gate check
  run: spec-graph gate
  # exit 1 → CI 失败 → 阻止合并
```

### Scenario 7: 失败 — 只评估某个 gate

```bash
$ spec-graph gate --phase entry-phase4
🚧 Gate Evaluation (phase: entry-phase4)

┌────────────────┬────────┬─────────┐
│ Gate ID        │ Status │ Missing │
├────────────────┼────────┼─────────┤
│ entry-phase4   │ ✓ PASS │ -       │
└────────────────┴────────┴─────────┘
# 只看这一个 gate,不评估其他
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found. Run spec-graph compose first.` | 没有 graph.yaml | 先跑 `spec-graph compose` |
| `No gates defined in graph.` | graph 中没有 gate 声明 | 检查 pack 是否声明了 gate,或 profile 不匹配 |
| exit code 1(无错误信息) | 有 blocking_gates | 看输出的 BLOCKED 列表,按上述流程修复 |
| `missing_traces` 始终不减少 | trace 文件结构错误 | 检查 `.spec-graph/traces/*.yaml` 格式,或重跑 `spec-graph prime` 重建 skeleton |

## 衔接关系

- **前置**:`spec-graph compose`(必须有 graph.yaml)
- **数据来源**:`graph.yaml`(gate 声明)+ `machine-state.yaml`(当前状态)+ `.spec-graph/traces/*.yaml`(trace 数据)
- **修复路径**:
  - missing artifacts → `spec-graph artifact complete <id>`
  - missing checks → `spec-graph check --id <id>`
  - missing traces → 编辑 trace 文件 / `spec-graph artifact complete` 自动 wire
- **被引用**:
  - `spec-graph next`(转换前自动评估 gate)
  - `spec-graph change complete`(soft-gate,失败 warn 但可 --force)
  - `spec-graph run`(每 stage 转换前内部跑 gate)
  - pre-commit hook(可选配置)
- **配合诊断**:`spec-graph doctor` 会检查 graph 中 gate 是否引用了不存在的 stage
