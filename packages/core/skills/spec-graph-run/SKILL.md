---
name: spec-graph-run
description: "Run the deterministic workflow loop with diff-select, retry, and periodic tier support. Auto-executes allowed actions (checks, transitions) until blocked or complete. spec-graph run cannot produce artifacts or resolve violations — those yield to the coordinator with full dispatch instructions. Use for automated progression through deterministic steps."
---

# spec-graph run

运行确定性工作流循环,直到 blocked 或 complete。

## Architecture Principle

**spec-graph run 是确定性执行器 — 不能做 LLM 工作。**

- ❌ run 不会生成 PRD / 架构文档内容
- ❌ run 不会修复 forbidden violations
- ❌ run 不会替你决策"该写什么"
- ✅ run 只执行确定性 action: `run_check` / `transition` / `verify_trace`
- ✅ run 遇到 `produce_artifact` / `perform_stage` / `resolve_violation` 时 yield 给 coordinator
- ✅ yield 时返回完整 dispatch_instructions,coordinator 拿来 dispatch sub-agent

**Agent (coordinator) 的职责**:当 run 被 blocked 时,读 `dispatch_instructions`,dispatch sub-agent 完成工作,然后重新 run。

## What this does

**Run loop** 是核心自动化引擎:

1. 计算下一步 plan (`spec-graph next`)
2. 检查 action 是否被 permissions 允许
3. 执行 action(run check / advance transition)
4. 重复,直到 done / blocked / max steps

### Key features

- **Diff-select** — 只对自上次 green build 以来变化的文件运行 check(`--diff`,基于 touchfiles)
- **Retry with backoff** — 失败的 check 按策略重试(`--retries`, `--backoff`)
- **Periodic tier** — 标记 `tier: periodic` 的 check 默认跳过;`--include-periodic` 显式启用
- **Permission aware** — 遵守 permission level

### Permission level 行为

| Level | 自动执行范围 |
|-------|------------|
| `full-auto` | 全部(check + transition + 所有) |
| `semi-auto` (default) | check + gated transition |
| `manual` | 什么都不自动执行(每个 action 都 blocked) |

## Usage

```bash
# 默认运行(10 max steps,120s timeout)
spec-graph run

# 限制步数
spec-graph run --max-steps 5

# Dry-run(模拟执行 check,不真跑命令)
spec-graph run --dry-run

# 自定义 check timeout
spec-graph run --timeout 60000

# 只对变化文件运行 check
spec-graph run --diff

# 失败重试 3 次,指数退避
spec-graph run --retries 3 --backoff exponential

# 包含 periodic tier check
spec-graph run --include-periodic
```

### Options

| Option | Description |
|--------|-------------|
| `--max-steps <n>` | 最大执行步数 (default: 10) |
| `--timeout <ms>` | 每个 check 的 timeout (ms, default: 120000) |
| `--dry-run` | Dry-run checks(不实际执行命令) |
| `--diff` | 只对自上次 green build 变化的文件运行 check |
| `--no-diff-select` | 禁用 diff-select,跑全部 touchfile 匹配的 check |
| `--base-ref <ref>` | Diff-select 的 base ref (default: HEAD) |
| `--retries <n>` | 失败 check 重试次数 (default: 0) |
| `--backoff <strategy>` | 退避策略: `fixed` (default), `linear`, `exponential` |
| `--include-periodic` | 包含 `tier: periodic` 的 check |
| `--json` | JSON 输出 |

## Run results

| Status | Meaning | Coordinator 行为 |
|--------|---------|-----------------|
| Complete | 工作流完成 | 停止 loop,可能进入 change complete |
| Blocked | 需要 agent 工作或手动操作 | 读 `dispatch_instructions`,dispatch sub-agent |
| Failed | check 失败或 transition 阻塞 | 检查失败原因,修复后重跑 |

## Execution Rules

### ✅ When to use

- **确定性 step 居多时**: 大量 check / transition 需要跑
- **CI / 自动化**: 配合 `--diff` 只跑变化部分
- **快速验证 pipeline**: `--dry-run` 看哪些 check 会被触发
- **配合 dispatch 交替使用**: run 跑确定性,dispatch 处理 LLM 工作

### ❌ When NOT to use

- **需要 LLM 工作**: 用 `spec-graph dispatch`(run 也会 yield,但 dispatch 更直接)
- **想看整体状态**: 用 `spec-graph status`
- **想看下一步具体阻塞**: 用 `spec-graph next`
- **manual permission level**: 每个动作都 blocked,run 没意义

## Agent Workflow: Run → Yield → Dispatch → Re-run

### Step 1: 运行 run

```bash
spec-graph run
```

观察输出表格中的 status 列。

### Step 2: 处理 blocked 状态

如果 blocked 且有 `dispatch_instructions`:

```
Run is blocked — sub-agent dispatch required.

Dispatch Instructions:
  Agent:          spec-author (standard)
  System prompt:  packs/.../spec-author.md
  Template:       prd
  Doc path:       .spec-graph/artifacts/prd/PRD-001.md
  Guidance:       Product Requirements Document: ...
  Input artifacts:
    - requirement/proposal → .spec-graph/artifacts/.../proposal.md
  Next step (after sub-agent completes):
    spec-graph artifact complete requirement/prd && spec-graph run
```

### Step 3: Dispatch sub-agent

按 `dispatch_instructions` 调度 sub-agent:

```bash
# 1. 加载 system prompt
Read packs/.../spec-author.md

# 2. 读 input artifacts
Read .spec-graph/artifacts/.../proposal.md

# 3. dispatch via Agent tool
# (用 Claude Code 的 Agent tool 或等价机制)

# 4. sub-agent 生成文档并写入 suggested path
# (.spec-graph/artifacts/prd/PRD-001.md)

# 5. sub-agent 返回 status-report
```

### Step 4: 完成后 next_step

```bash
spec-graph artifact complete requirement/prd --producer agent
```

### Step 5: 重新 run

```bash
spec-graph run
# 继续执行下一个确定性 action
```

## Usage Scenarios

### Scenario 1: 标准确定性循环

```bash
spec-graph run
# Step 1: run_check 'lint' → completed
# Step 2: run_check 'typecheck' → completed
# Step 3: transition 'specify→design' → completed
# Step 4: produce_artifact 'design/architecture' → BLOCKED (yield)
# → coordinator dispatch sub-agent
# → 重新 run
```

### Scenario 2: CI diff-select

```bash
# CI 中只跑受影响文件的 check
spec-graph run --diff --base-ref origin/main --json
# 只跑 touchfiles 匹配变化文件的 check
```

### Scenario 3: 失败重试

```bash
spec-graph run --retries 3 --backoff exponential
# Check 失败 → 等 1s → retry → 失败 → 等 2s → retry → 失败 → 等 4s → retry → 最终失败
```

### Scenario 4: Dry-run 验证

```bash
spec-graph run --dry-run
# 模拟执行所有 check,不真跑命令
# 用于验证 pipeline 配置是否正确
```

### Scenario 5: 失败 — graph 不存在

```bash
$ spec-graph run
✗ Graph not found. Run `spec-graph compose` first.
# 修复: 先 compose + prime
```

### Scenario 6: 失败 — check 命令缺失

```bash
$ spec-graph run
# Step 1: run_check 'lint' → failed
# Message: Check is required by gate but not declared in graph: lint
# 修复: 编辑 graph 或 pack template,补齐 check.command
```

### Scenario 7: blocked 但无 dispatch_instructions

```bash
$ spec-graph run
# Status: blocked
# Message: Manual or agent work required
# Next action: Produce and mark artifact 'plan/story' as completed
# Suggested dispatch: spec-graph dispatch
# → 切换到 dispatch 模式
spec-graph dispatch --json
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| Check not declared in graph | graph 缺 check 定义 | 编辑 graph 或 pack template |
| Check command timeout | check 执行超时 | `--timeout` 调大,或优化 check 命令 |
| Transition failed | gate 未通过 | 检查 `missing_artifacts` / `failed_checks`,先修复 |
| Max steps reached | 步数限制 | `--max-steps` 调大,或检查是否有死循环 |

## 衔接关系

- **前置**: `spec-graph prime`(必须有机器状态)
- **后续**: blocked 时 → `spec-graph dispatch`(LLM 工作)→ 重新 run
- **替代方案**: `spec-graph dispatch` + 手动执行(更细粒度控制)
- **配套查看**: `spec-graph status`(整体进度)、`spec-graph next`(下一步聚焦)
- **change 完成**: 当 run 显示 complete 时,可以 `spec-graph change complete <id>`
