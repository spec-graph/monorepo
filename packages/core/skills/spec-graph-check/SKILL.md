---
name: spec-graph-check
description: "Execute validation checks declared in graph.yaml. Runs shell commands (lint, typecheck, test, etc.) per layer (unit/integration/system/deployment). Updates machine state so gates can evaluate. Placeholders like <clarify-scan> are auto-skipped (require LLM analysis). spec-graph is a neutral executor — does NOT interpret test output or decide what to fix, only runs commands and records pass/fail. Use to run all checks, a specific layer, or a single check by ID."
---

# spec-graph check

执行 graph.yaml 中声明的 validation checks。

## Architecture Principle

**spec-graph 不解读输出 — 只跑命令并记录结果。**

- ❌ spec-graph 不会"理解"测试失败的原因
- ❌ spec-graph 不会自动修复 lint 错误
- ❌ spec-graph 不会替你决定是否跳过某个 check
- ❌ spec-graph 不会替你替换 placeholder 命令(如 `<clarify-scan>`)
- ✅ spec-graph 读 graph.yaml 的 check 声明,执行 `command` 字段
- ✅ spec-graph 把每个 check 的 status (passed/failed) + stdout + stderr 写入 machine-state.yaml
- ✅ spec-graph 在 placeholder 命令(如 `<clarify-scan>`)上自动 dry-run(标记 passed,不执行 shell)
- ✅ spec-graph exit code: 任何 check failed = 1,全 passed = 0

**Agent 的职责**:跑 check → 读输出 → 修复代码 → 重跑直到全 passed。如果 check 是 placeholder(LLM-driven analysis),应该通过 sub-agent 实际分析,然后用 `--dry-run` 或 builtin check 替代。

## What this does

执行 graph.yaml 中 `checks` 数组声明的命令,按层级组织:

| Layer | 典型 check | 典型命令 |
|-------|-----------|---------|
| `unit` | lint, typecheck, unit tests | `npm run lint`, `tsc --noEmit`, `jest` |
| `integration` | 组件集成、契约测试 | `npm run test:integration` |
| `system` | 全系统测试、Lighthouse、a11y | `npm run test:e2e`, `lighthouse-ci` |
| `deployment` | E2E browser、HIL 测试 | `playwright test`, manual HIL |

每个 check 执行后:
- 更新 `machine-state.yaml` 的 `checks[<id>].status`(passed/failed)
- 记录 `exit_code`, `duration_ms`, `stdout`(截断 4000 字符), `stderr`(截断 4000 字符), `executed_at`
- 这些状态供 `spec-graph gate` 评估

### Placeholder 命令

形如 `<clarify-scan>` / `<complexity-budget>` 的命令是 **placeholder** — 代表需要 LLM 驱动的分析,无法用 shell 自动化。

行为:
- spec-graph 检测到 `<xxx>` 格式 → 自动 dry-run(标记 passed)
- 如果是 builtin check(在 `engine/checks/builtin.ts` 注册的),会调用 TS 函数执行
- 否则需要 agent 手动 sub-agent 分析,或用 `prime --bootstrap` 全部自动 pass

## Usage

```bash
# 跑所有 check
spec-graph check

# 只跑某个 check
spec-graph check --id lint

# 只跑某个 layer
spec-graph check --layer unit

# dry-run(不执行命令,直接标记 passed)
spec-graph check --dry-run

# 自定义超时
spec-graph check --timeout 60000

# JSON 输出
spec-graph check --json
```

### Options

| Option | Description |
|--------|-------------|
| `--id <id>` | 只跑指定 ID 的 check(如 `lint`, `typecheck`) |
| `--layer <layer>` | 只跑某个 layer:`unit` / `integration` / `system` / `deployment` |
| `--dry-run` | 不执行命令,直接把选中 check 标记为 passed |
| `--timeout <ms>` | 单个 check 的超时(毫秒),默认 120000(2 分钟) |
| `--json` | 输出 JSON 格式(`{results: [...]}`) |

## Output 解读

```
Running lint: npm run lint
Running typecheck: tsc --noEmit
Running unit: jest

🧪 Check Results

┌────────────┬────────┬──────┬───────────┬─────────────────────┐
│ ID         │ Status │ Exit │ Duration  │ Command             │
├────────────┼────────┼──────┼───────────┼─────────────────────┤
│ lint       │ ✓ PASS │ 0    │ 2340ms    │ npm run lint        │
│ typecheck  │ ✗ FAIL │ 1    │ 5600ms    │ tsc --noEmit        │
│ unit       │ ✓ PASS │ 0    │ 12300ms   │ jest                │
└────────────┴────────┴──────┴───────────┴─────────────────────┘

Failure: typecheck
stderr:
  src/auth/login.ts(42,3): error TS2322: Type 'string' is not assignable to type 'User'.
```

**关键字段**:
- `Status`: ✓ PASS = exit 0, ✗ FAIL = 非 0 exit
- `Exit`: 命令的 exit code(null = 超时或未执行)
- `Duration`: 单 check 耗时
- `Command`: 实际执行的命令(便于排查)

## 何时使用 — 判断标准

### ✅ 应该使用 check

| 场景 | 用法 |
|------|------|
| gate 报 missing_checks | `spec-graph check --id <missing-id>` |
| 写完代码后验证 | `spec-graph check --layer unit` |
| change complete 前 | 跑全量 check 确保 gate 通过 |
| CI / pre-commit hook | 跑 `check --layer unit` 作为快速门禁 |
| 调试单个失败 check | `spec-graph check --id <id> --json` 看完整输出 |
| dispatch loop 中 | sub-agent 实现完代码后,主 agent 跑 check 更新状态 |

### ❌ 不应该使用 check

| 场景 | 替代做法 |
|------|---------|
| 查 gate 状态 | `spec-graph gate` |
| 查当前 stage | `spec-graph status` |
| 推进工作流 | `spec-graph dispatch --json` 或 `spec-graph next` |
| 跑 placeholder 检查(LLM 分析) | 直接 sub-agent dispatch(`spec-graph prime --bootstrap` 标记 passed) |
| 看具体某个 artifact 内容 | 直接读 `.spec-graph/artifacts/<type>/<name>.md` |

## Agent Workflow

```
1. spec-graph check --layer unit   (或 --id <specific>)
   ↓
2. 读输出表格,识别 ✗ FAIL 的 check
   ↓
3. 对每个 failed check:
   ├── 读 stderr(代码层面问题)
   ├── 判断修复路径:
   │   ├── lint 错误 → 直接改代码
   │   ├── typecheck 错误 → 修类型
   │   ├── test 失败 → 修实现或修测试
   │   └── placeholder check → sub-agent 实际分析(不能 dry-run 蒙混)
   ├── 分派给 sub-agent 或直接修
   └── 修复后重跑 spec-graph check --id <fixed-id>
   ↓
4. 所有 check passed 后:
   ├── spec-graph gate(确认 gate 通过)
   └── spec-graph dispatch --json(继续工作流)
```

## 与 Agent 的协作关系

- **主 agent**:决定跑哪些 check(全量 / 单层 / 单 ID),读输出,分派修复任务
- **sub-agent**:接收 "fix check X" 任务,读 stderr,改代码
- **coordinator**:dispatch manifest 中可能引用 check status 作为 transition 前提
- **CI**:可直接调用 `spec-graph check` 作为质量门禁
- **permission level**:`full-auto` 自动跑所有允许的 check,`semi-auto` 跑 unit layer,`manual` 需要确认

## Diff-Select 优化(选择性执行)

如果 check 声明了 `touchfiles`,spec-graph 会根据 git diff 只跑相关的 check(避免全量跑测试):

```yaml
checks:
  - id: unit-payment
    command: jest payment/
    touchfiles: ["src/payment/**"]   # 只在这些文件变化时跑
    tier: periodic                    # 周期性跑(不是每次)
```

## Builtin Checks

某些 placeholder 命令在 `engine/checks/builtin.ts` 中有 TS 实现,会真正执行(不 dry-run):

- `<clarify-scan>` — 模糊形容词检测
- `<complexity-budget>` — 圈复杂度检测
- 等等(具体见源码)

如果 builtin 不存在,placeholder 命令会 dry-run(标记 passed,不实际检查)。

## Usage Scenarios

### Scenario 1: 跑全量 check(成功)

```bash
$ spec-graph check
Running lint: npm run lint
Running typecheck: tsc --noEmit
Running unit: jest

🧪 Check Results
┌────────────┬────────┬──────┬───────────┐
│ ID         │ Status │ Exit │ Duration  │
├────────────┼────────┼──────┼───────────┤
│ lint       │ ✓ PASS │ 0    │ 2340ms    │
│ typecheck  │ ✓ PASS │ 0    │ 5600ms    │
│ unit       │ ✓ PASS │ 0    │ 12300ms   │
└────────────┴────────┴──────┴───────────┘

# exit code 0
```

### Scenario 2: 失败 — typecheck 错误

```bash
$ spec-graph check --id typecheck
Running typecheck: tsc --noEmit

Failure: typecheck
stderr:
  src/auth/login.ts(42,3): error TS2322: Type 'string' is not assignable to type 'User'.

# exit code 1
```

**修复流程**:
```bash
# 1. 让 sub-agent 修 src/auth/login.ts
# 2. 重跑
$ spec-graph check --id typecheck
# ✓ PASS
```

### Scenario 3: 失败 — 超时

```bash
$ spec-graph check --id e2e
Running e2e: playwright test

# 命令超过 120s 没退出
# Status: ✗ FAIL, Exit: null, Duration: 120000ms

# 修复:
$ spec-graph check --id e2e --timeout 300000   # 5 分钟
# 或优化测试本身
```

### Scenario 4: Placeholder check(自动 dry-run)

```bash
$ spec-graph check --id clarify-scan
Running clarify-scan: <clarify-scan>
# 检测到 <...> 格式,builtin 存在 → 调用 TS 函数
# 或 builtin 不存在 → dry-run(标记 passed)

🧪 Check Results
┌──────────────┬────────┬──────┬─────────┐
│ ID           │ Status │ Exit │ Duration│
├──────────────┼────────┼──────┼─────────┤
│ clarify-scan │ ✓ PASS │ -    │ 5ms     │
└──────────────┴────────┴──────┴─────────┘
```

**注意**:如果 builtin 不存在,这是"假通过" — 实际没分析。需要 agent 手动 sub-agent 分析。

### Scenario 5: Dry-run(快速标记)

```bash
# 不实际执行,把所有 check 标记为 passed
# 用于:demo、跳过 CI、临时绕过
$ spec-graph check --dry-run
🧪 Check Results
┌────────────┬────────┐
│ ID         │ Status │
├────────────┼────────┤
│ lint       │ ✓ PASS │  ← 没真跑
│ typecheck  │ ✓ PASS │  ← 没真跑
└────────────┴────────┘

# ⚠ 谨慎使用:gate 会"通过"但代码可能有问题
```

### Scenario 6: 失败 — 多个 layer 跑

```bash
$ spec-graph check --layer integration
Running integration-api: npm run test:integration:api
Running integration-db: npm run test:integration:db

Failure: integration-db
stderr:
  Connection refused: localhost:5432

# 修复:启动 postgres 后重跑
```

### Scenario 7: JSON 输出(供脚本消费)

```bash
$ spec-graph check --id lint --json
{
  "results": [
    {
      "id": "lint",
      "status": "passed",
      "exit_code": 0,
      "duration_ms": 2340,
      "command": "npm run lint",
      "stdout": "...",
      "stderr": ""
    }
  ]
}
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found. Run spec-graph compose first.` | 没有 graph.yaml | 先 `spec-graph compose` |
| `No checks matched.` | `--id` 或 `--layer` 没匹配到 | 检查 graph.yaml 中的 check id/layer 拼写 |
| check 超时(Exit=null) | 命令超过 timeout | 加 `--timeout <ms>` 或优化测试 |
| check failed(Exit=非0) | 命令本身报错 | 读 stderr,修代码,重跑 |
| placeholder 误判 passed | builtin 不存在,dry-run | sub-agent 实际分析,或写 builtin |

## 衔接关系

- **前置**:`spec-graph compose`(必须有 graph.yaml)+ `spec-graph prime`(必须有 machine-state.yaml)
- **数据来源**:`graph.yaml`(check 声明)+ `machine-state.yaml`(写入状态)
- **更新数据**:每次执行后写入 `machine-state.yaml` 的 `checks[<id>]`
- **被引用**:
  - `spec-graph gate`(读 check status 评估 gate)
  - `spec-graph run`(根据 permission level 自动跑允许的 check)
  - `spec-graph next`(转换 stage 前内部跑 check)
- **Diff-Select 配合**:check 声明 `touchfiles` 时,`spec-graph run` 只跑相关 check
- **CI 集成**:GitHub Actions / GitLab CI 直接调用作为质量门禁
- **配合诊断**:`spec-graph doctor` 会检查 graph 中的 check 是否都有 command 字段
