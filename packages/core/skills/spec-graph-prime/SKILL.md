---
name: spec-graph-prime
description: "Seed machine state with graph-declared artifacts and checks. Initializes all artifacts as pending, all checks as pending (or passed if bootstrapping placeholders), and creates trace skeletons. AI agent is responsible for deciding whether to bootstrap placeholders. Use after compose, after profile changes, or when machine state is corrupt."
---

# spec-graph prime

将 graph 声明的 artifacts、checks、traces 注入到机器状态。

## Architecture Principle

**spec-graph 只做状态注入,不做内容生成。**

- ❌ spec-graph 不会生成 PRD / 架构文档内容
- ❌ spec-graph 不会执行真实的 lint / test 命令
- ❌ spec-graph 不会判断 artifact 是否"内容正确"
- ✅ spec-graph 只把 graph 声明的 items 注册为 `pending`
- ✅ spec-graph 可识别 `<placeholder>` 命令并自动 pass(仅 bootstrap 模式)

**Agent 的职责**:决定是否 bootstrap,以及后续在 dispatch 阶段填充真实内容。

## What this does

在 `spec-graph compose` 生成 graph 之后,`prime` 初始化机器状态:

1. **Seed artifacts** — 把所有 graph artifacts 注册为 `pending`
2. **Seed checks** — 把所有 graph checks 注册为 `pending`(或 bootstrap 模式下自动 pass 占位 check)
3. **Create trace skeletons** — 为 gate 要求的 trace 生成骨架文件
4. **Bootstrap placeholders** — 自动 pass 命令为 `<placeholder>` 形式的 check

## Usage

```bash
# 标准 prime:所有 check 为 pending,需要真实执行
spec-graph prime

# Bootstrap 模式:占位 check 自动 pass
spec-graph prime --bootstrap

# JSON 输出(便于脚本集成)
spec-graph prime --json
```

### Options

| Option | Description |
|--------|-------------|
| `--bootstrap` | 自动 pass 命令为 `<placeholder>` 形式的 check |
| `--json` | 输出 JSON 格式 |

### Bootstrap 决策指南

`--bootstrap` 适用于:
- **新项目初始化**: `<clarify-scan>` 等占位 check 还没替换为真实命令,先 pass 让工作流跑起来
- **CI 演练**: 想快速跑通 pipeline 而不实际执行 check
- **Demo / 教学**: 展示工作流而不需要真实测试基础设施

**不要用 bootstrap** 当:
- check 命令已经是真实的 `npm test` / `npx vitest run` 等
- 你需要 check 真实反映代码质量
- 进入 production 前的最终验证

## Execution Rules

### ✅ When to use

- **compose 之后**: graph 刚生成,需要把声明注入机器状态
- **profile 修改后 re-compose**: 新 artifacts/checks 需要 seed
- **机器状态损坏**: `machine-state.yaml` 损坏或丢失,re-prime 可重置
- **新 change apply 后**: change apply 内部会自动 prime(无需手动跑)

### ❌ When NOT to use

- **有 in-progress 工作**: re-prime 会重置 status(已 completed 的 artifact 会被覆盖回 pending?实际不会,prime 是幂等的,但已 passed 的 check 可能被新 check 替换)
- **已经 prime 过且工作正常**: 重复 prime 是 no-op,浪费时间
- **想清除所有状态**: 用 `spec-graph migrate` 或手动删 `machine-state.yaml` 更彻底

### 幂等性说明

prime 是幂等的:
- 已存在的 artifact 不会被重置(保留当前 status)
- 已存在的 check 不会被重置
- 只会**新增** graph 中声明但状态中不存在的 items

所以 re-prime 是安全的,但**不会**撤销任何东西。

## Agent Workflow

### Step 1: 决定是否 bootstrap

```
检查 graph.yaml 中的 checks:
- 有多少 command 是 <placeholder> 形式?
- 如果有 → 用 --bootstrap 让它们 pass,工作流能跑起来
- 如果全是真实命令 → 标准 prime,后续 dispatch 会逐个执行
```

### Step 2: 运行 prime

```bash
spec-graph prime --bootstrap    # 或 spec-graph prime
```

### Step 3: 检查输出

输出会显示:
```
✓ Machine state primed

  Resource       Seeded       Total
  Artifacts      12 added     12
  Checks         8 pending    10
                2 bootstrapped
  Trace files    3 skeletons  -
```

确认:
- Artifacts 总数符合 graph 声明?
- Bootstrapped 数量是否合理?(过多说明太多 placeholder 没替换)
- Trace skeletons 创建数量是否符合 gate 要求?

### Step 4: 替换 placeholder checks(如果 bootstrap 了)

bootstrap 后,agent 应该逐步把 `<placeholder>` 替换为真实命令:

```yaml
# 编辑 graph.yaml 或对应的 pack template
checks:
  - id: clarify-scan
    command: npm run scan   # 而不是 <clarify-scan>
```

替换后:
```bash
spec-graph check --id clarify-scan   # 重新执行
```

### Step 5: 运行 next 或 dispatch

```bash
spec-graph next     # 查看下一步
# 或
spec-graph dispatch --json   # 直接进入工作流循环
```

## Usage Scenarios

### Scenario 1: 标准初始化

```bash
spec-graph init --stack typescript --build spa
spec-graph sense
spec-graph compose
spec-graph prime              # 所有 check pending
spec-graph next               # 查看下一步
```

### Scenario 2: 快速 bootstrap(init 内部就是这样)

```bash
spec-graph init --stack typescript --build spa
# 内部执行: init → compose → prime --bootstrap
# 占位 check 自动 pass,工作流可直接 dispatch
```

### Scenario 3: re-compose 后 re-prime

```bash
# 修改了 profile 或 pack
spec-graph compose
spec-graph prime              # 新 artifacts/checks 被 seed
# 注意: 已 completed 的旧 artifacts 保留状态(幂等)
```

### Scenario 4: 机器状态损坏

```bash
# machine-state.yaml 损坏或丢失
rm .spec-graph/machine-state.yaml
spec-graph prime              # 从 graph 重建
```

### Scenario 5: 失败 — graph 不存在

```bash
$ spec-graph prime
✗ Graph not found. Run `spec-graph compose` first.
# 修复: 先 compose
```

### Scenario 6: 失败 — graph 损坏

```bash
$ spec-graph prime
Error: Invalid graph structure at line X
# 修复: 检查 graph.yaml,或重新 compose
spec-graph compose
spec-graph prime
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| `Invalid graph structure` | graph.yaml 损坏 | 重新 `spec-graph compose` |
| Trace skeleton 创建失败 | traces/ 目录权限问题 | 检查 `.spec-graph/traces/` 写权限 |
| Bootstrap 没生效 | check command 不是 `<placeholder>` 格式 | 检查 graph.yaml 中 check.command 格式 |

## 衔接关系

- **前置**: `spec-graph compose`(必须有 graph)
- **后续**: `spec-graph next` / `spec-graph dispatch`(查看下一步)
- **change apply 内部**: `spec-graph change apply` 会自动调用 prime --bootstrap,无需手动跑
- **快速路径**: `spec-graph init` 自动跑 `init → compose → prime --bootstrap`
- **机器状态损坏恢复**: `rm machine-state.yaml && spec-graph prime`
