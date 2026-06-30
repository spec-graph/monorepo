---
name: spec-graph-migrate
description: "Generate incremental migration plan for brownfield (legacy) projects. Scans codebase for missing linting/TypeScript/tests, detects structure (src/components/lib/api), produces prioritized high/medium/low steps. spec-graph is a neutral analyzer — it does NOT execute migrations. The agent reads the plan and creates changes (one per step)."
---

# spec-graph migrate

存量项目迁移规划工具 — 生成增量迁移步骤清单。

## Architecture Principle

**spec-graph 只生成迁移计划,不执行迁移。**

- ❌ spec-graph 不会替你修复 lint 错误
- ❌ spec-graph 不会替你加 TypeScript 类型
- ❌ spec-graph 不会替你跑测试迁移
- ✅ spec-graph 扫描代码库现状(linting / TS / 测试 / 结构)
- ✅ spec-graph 识别 gaps(缺失的工具链 / 测试覆盖率)
- ✅ spec-graph 产出按优先级排序的步骤清单(high / medium / low)

**Agent 的职责**:读 plan → 为每个步骤创建 change → 通过 dispatch 工作流逐步迁移。

## What this does

针对 brownfield(已存在的、缺乏工程化的)项目,生成迁移到 spec-graph 友好工作流的增量计划:

1. **代码库扫描** — 检测 linting 配置(eslint/biome/ruff)、TypeScript 严格度、测试框架(jest/vitest/pytest)、项目结构(src/components/lib/api)
2. **Gap 识别** — 找出缺失或不完整的工具链
3. **优先级排序** — 标记 high(必须先做)/ medium / low
4. **结构化输出** — 文本表格 + 可选 JSON

## 何时使用 migrate vs init

| 场景 | 命令 |
|------|------|
| 全新空目录 | `spec-graph init` |
| 已有项目但未用 spec-graph | `spec-graph init` + `spec-graph migrate` |
| 已用 spec-graph 但工具链不完整 | `spec-graph migrate` |
| 想看代码库健康度 | `spec-graph doctor` |

## Usage

```bash
# 生成迁移计划(文本格式)
spec-graph migrate

# JSON 输出(供 agent 程序化解析)
spec-graph migrate --json
```

### Options

| Option | Description |
|--------|-------------|
| (无) | 生成迁移计划,文本表格输出 |
| `--json` | JSON 输出 |

## 输出示例

```
Analyzing codebase structure...

Migration Plan
==============

High Priority:
  1. Add ESLint with TypeScript plugin (no linter detected)
  2. Set up Jest test runner (no tests detected)
  3. Enable TypeScript strict mode (currently 'false')

Medium Priority:
  4. Add CI pipeline (no .github/workflows detected)
  5. Configure pre-commit hooks

Low Priority:
  6. Add coverage threshold (currently 0%)
  7. Document contribution guidelines

✓ Migration plan generated
  7 steps (3 high priority)

  Run each step to migrate your project incrementally.
```

## Execution Rules

### ✅ 何时使用

| 情况 | 优先级 |
|------|--------|
| 接手遗留项目,不知道从哪开始 | 第一步 |
| 项目无 linting / 无测试 | high |
| 项目要上 spec-graph 工作流 | 配合 init |
| 健康度检查 | 配合 doctor |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 全新项目 | `spec-graph init` |
| 想检查 spec-graph 自身健康度 | `spec-graph doctor` |
| 想检查当前 change 进度 | `spec-graph status` |
| 想看 graph 状态 | `spec-graph compose` |

## Agent Workflow

### Step 1: 先 init spec-graph

```bash
spec-graph init --stack typescript --build api --description "..."
# 即使是 brownfield,也要先 init 才能用其他命令
```

### Step 2: 生成迁移计划

```bash
spec-graph migrate --json > /tmp/migration-plan.json
# agent 解析 JSON,得到 steps 数组
```

### Step 3: 为每个 high priority step 创建 change

```bash
# Step 1: Add ESLint
spec-graph change create \
  --title "Add ESLint with TypeScript plugin" \
  --type feature \
  --priority high \
  --description "No linter currently detected; add eslint + @typescript-eslint"

# Step 2: Set up Jest
spec-graph change create \
  --title "Set up Jest test runner" \
  --type feature \
  --priority high \
  --description "No tests detected; bootstrap Jest with sample test"

# 然后逐个 apply + dispatch
spec-graph change apply <id-1>
spec-graph dispatch --json
# ...完成第一个 change 后再做第二个
```

### Step 4: 重新 migrate 验证

```bash
# 完成 high priority steps 后,重新跑 migrate
spec-graph migrate
# 验证: high priority 清单应缩短
```

## Usage Scenarios

### Scenario 1: 标准遗留项目迁移

```bash
# 接手一个 5 年的老 Node 项目
spec-graph init --stack javascript --build api --description "Legacy billing API"
spec-graph migrate
# 输出:
#   High: Add ESLint, Set up Jest, Enable strict mode
#   Medium: Add CI, Configure pre-commit hooks
#   Low: Add coverage threshold

# 为每个 high step 创建 change
spec-graph change create --title "Add ESLint" --type feature --priority high
spec-graph change apply <id>
spec-graph dispatch --json
# ...完成...
spec-graph change complete <id>
spec-graph change archive <id>

# 继续下一个 step...
```

### Scenario 2: JSON 输出供脚本消费

```bash
spec-graph migrate --json | jq '.steps[] | select(.priority == "high") | .title'
# "Add ESLint with TypeScript plugin"
# "Set up Jest test runner"
# "Enable TypeScript strict mode"
```

### Scenario 3: 配合 doctor 检查

```bash
# doctor 检查 spec-graph 自身配置
spec-graph doctor
# migrate 检查项目工程化水平
spec-graph migrate
# 两者互补:doctor 治 spec-graph,migrate 治项目
```

### Scenario 4: 渐进式迁移(分批)

```bash
# 第一批:只做 high priority
spec-graph migrate --json | jq '.steps[] | select(.priority == "high")'
# 为每个 high step 创建 change,逐个完成

# 第二批:做 medium
spec-graph migrate  # 重新生成,确认 high 已清空
# 为 medium step 创建 change

# 第三批:low
```

### Scenario 5: 失败 — 未 init 就 migrate

```bash
$ spec-graph migrate
⚠ Graph not found. Run `spec-graph compose` first.
Continuing with codebase analysis only...
# 注意:migrate 会用 minimal graph 继续,但建议先 init + compose
spec-graph init --stack typescript --build api
spec-graph compose
spec-graph migrate
```

### Scenario 6: 失败 — graph 损坏

```bash
$ spec-graph migrate
⚠ Graph not found. Run `spec-graph compose` first.
# 修复:
spec-graph compose
spec-graph migrate
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose`(或 migrate 会用 minimal graph 继续) |
| `Project not initialized` | 未 init | `spec-graph init` |
| 扫描结果异常(漏检) | 不支持的项目结构 | 用 `generic` stack,手动加 change |

## 衔接关系

- **前置**: `spec-graph init`(必须有 `.spec-graph/`)
- **建议先跑**: `spec-graph compose`(migrate 会读 graph.yaml)
- **后继**: 为每个 step 创建 `spec-graph change create`
- **配合**: `spec-graph doctor`(检查 spec-graph 配置健康度)
- **与 sense 的区别**: `sense` 是 22 维度深度扫描生成 profile,migrate 是聚焦工程化 gap 生成步骤清单
- **不参与 dispatch 循环**: migrate 是一次性规划工具,产出由 agent 转化为 change 后才进入工作流
