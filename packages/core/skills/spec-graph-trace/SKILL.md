---
name: spec-graph-trace
description: "Traceability graph traversal. Forward (requirement → impl) and backward (impl → requirement) BFS, plus trace add (link artifacts via relation). Satisfies gate require_traces queries. spec-graph tracks edges — does NOT verify semantic correctness."
---

# spec-graph trace

追溯图遍历与边管理 — forward / backward / add。

## Architecture Principle

**spec-graph 是追溯边登记处 — 不判断语义对错。**

- ❌ spec-graph 不会判断「这条 trace 是否真有依赖」(只记录边)
- ❌ spec-graph 不会自动生成 trace(由 dispatch verify_trace action 触发或手动 add)
- ❌ spec-graph 不会校验 artifact 内容是否真的实现了 requirement(那是 reviewer)
- ✅ spec-graph 按 graph declaration + trace 文件建索引,跑 BFS
- ✅ spec-graph 在 add 时自动匹配 gate 的 require_traces 查询

**Agent 职责**:artifact 完成后 → 检查是否需要 trace → `trace add` 满足 gate → dispatch 重评估。

## What this does

从三个来源建追溯索引:

1. **Graph declarations** — artifact 的 producer/consumer 关系
2. **Gate requirements** — gate 的 `require_traces` 查询(声明需要哪些 trace)
3. **Trace files** — `.spec-graph/traces/*.yaml` 显式声明的边

### 支持的操作

| 操作 | 说明 |
|------|------|
| **forward trace** | 从 requirement 出发,找它派生 / 实现了什么 |
| **backward trace** | 从 artifact 出发,找它依赖 / 派生自什么(默认) |
| **add** | 添加新边(自动匹配 gate 查询) |
| **list nodes** | 列出所有可追溯节点 |

### Node 类型

| Type | 颜色 | 来源 |
|------|------|------|
| `requirement` | 蓝 | requirement artifacts |
| `artifact` | 绿 | 所有 artifacts |
| `check` | 黄 | graph checks |
| `gate` | 紫 | graph gates |
| `track` | 青 | graph tracks |

### Relations(常见)

| Relation | 含义 |
|----------|------|
| `derives` | A 派生自 B(plan derives from requirement) |
| `refines` | A 细化 B(design refines requirement) |
| `implements` | A 实现 B(implementation implements design) |
| `verifies` | A 验证 B(test verifies implementation) |
| `depends-on` | A 依赖 B(通用) |
| `satisfies` | 默认关系(未指定时) |

### Gate 查询基数(cardinality)

gate 的 `require_traces` 可声明:

- `exists` — 至少一条路径
- `single` — 恰好一条
- `every` — 每个 source node 都要到 target

## Subcommands & Usage

```bash
# 列出所有可追溯节点(默认)
spec-graph trace

# 从某节点 backward(默认方向)
spec-graph trace <node-id>
spec-graph trace requirement/prd --direction backward

# 从某节点 forward
spec-graph trace requirement/prd --direction forward

# 过滤节点类型
spec-graph trace --type requirement

# 添加 trace 边
spec-graph trace add \
  --from requirement/prd \
  --to design/arch \
  --via derives

# 用 --relation(--via 的别名,优先级更高)
spec-graph trace add \
  --from plan/tasks \
  --to requirement/prd \
  --relation derives \
  --json
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `<node-id>` (位置参数) | trace view | 起始节点 id |
| `--direction <d>` | trace view | `backward`(默认)/ `forward` |
| `--type <t>` | list | 过滤节点类型 |
| `--from <id>` | add | 源 artifact id |
| `--to <id>` | add | 目标 artifact id |
| `--via <relation>` | add | 关系(derives/refines/implements/verifies/depends-on) |
| `--relation <name>` | add | --via 别名,优先级更高 |
| `--json` | add | JSON 输出 |

## Execution Rules

### ✅ 应该用 trace 的场景

| 场景 | 操作 |
|------|------|
| gate 报「missing traces」 | `trace add` 补边 |
| 想知道某 requirement 派生了什么 | `trace <id> --direction forward` |
| 想知道某 implementation 依赖什么 | `trace <id>`(默认 backward) |
| 想确认 PRD → 实现的完整链路 | forward trace |
| dispatch verify_trace action | 调用 `trace add` 满足查询 |

### ❌ 不应该用 trace 的场景

| 场景 | 替代做法 |
|------|---------|
| 改 artifact 状态 | `spec-graph artifact complete` |
| 推 transition | `spec-graph machine transition` |
| 跨项目契约追溯 | `spec-graph contract`(版本绑定) |
| 影响范围分析(ripple) | `spec-graph impact` |
| 加新 artifact 到图 | 改 pack,然后 `compose` |

## Agent Workflow

### 添加新 trace 边

```
1. dispatch manifest 提示:gate 缺 trace
   - 例: design→plan 需要 derives 关系
   ↓
2. spec-graph trace add \
     --from plan/tasks \
     --to design/arch \
     --via derives
   ↓
   - 检查 from/to 在 graph 中存在
   - 找匹配的 gate require_traces 查询
   - 写到 .spec-graph/traces/<query-name>.yaml
   - 若匹配 gate 查询:输出 "Satisfies gate query: <name>"
   ↓
3. spec-graph dispatch --json (重评估,gate 可能通过)
```

### 遍历追溯链

```
1. 想知道 implementation/api 的完整依赖链
   ↓
2. spec-graph trace implementation/api
   ↓ (默认 backward BFS)
3. 输出:
   [artifact] implementation/api
     ↓
   [artifact] design/arch
     ↓
   [requirement] requirement/prd
   Total nodes in path: 3
```

### Auto-wire(无需手动 add)

`artifact complete` 时,会扫描 traces/ 中的 placeholder(`<...>`),按 kind 自动替换为真实 id。所以**很多 trace 不需要手动 add**,只需在 trace 文件里声明 placeholder + kind。

## Usage Scenarios

### Scenario 1: gate 报缺 trace,补上

```bash
# dispatch 提示:
# "missing traces: requirement→design (derives)"

spec-graph trace add \
  --from design/arch \
  --to requirement/prd \
  --via derives
# ✓ Trace entry added: design/arch → requirement/prd (derives)
#   File: .spec-graph/traces/requirement-to-design.yaml
#   Satisfies gate query: req-to-design

spec-graph dispatch --json   # gate 现在通过
```

### Scenario 2: backward trace(我依赖什么)

```bash
spec-graph trace implementation/api
# [artifact] implementation/api
#     ↓
# [artifact] design/arch
#     ↓
# [requirement] requirement/prd
```

### Scenario 3: forward trace(我派生了什么)

```bash
spec-graph trace requirement/prd --direction forward
# [requirement] requirement/prd
#     ↓
# [artifact] design/arch
#     ↓
# [artifact] implementation/api
#     ↓
# [check] verify-api-contract
```

### Scenario 4: JSON 输出(程序化)

```bash
spec-graph trace add --from A --to B --via derives --json
{
  "added": true,
  "trace_file": ".spec-graph/traces/requirement-to-design.yaml",
  "trace_name": "requirement-to-design",
  "from": "design/arch",
  "to": "requirement/prd",
  "relation": "derives",
  "matching_gate_query": "req-to-design"
}
```

### Scenario 5: 重复 trace(自动跳过)

```bash
$ spec-graph trace add --from A --to B --via derives
↳ Trace entry already exists: A → B (derives)
  File: .spec-graph/traces/xxx.yaml
# 不报错,只是提示已存在
```

### Scenario 6: 失败 — artifact 不在 graph

```bash
$ spec-graph trace add --from requirement/foo --to design/bar --via derives
✗ --from artifact not found in graph: requirement/foo
Available artifacts: requirement/prd, design/arch, ...
# 修复:用 graph 中实际存在的 id(看 spec-graph artifact list)
```

### Scenario 7: 失败 — 缺参数

```bash
$ spec-graph trace add --from requirement/prd
✗ --from and --to are required.
Usage: spec-graph trace add --from <id> --to <id> [--via <relation>] [--relation <name>] [--json]
```

### Scenario 8: 失败 — 未 compose

```bash
$ spec-graph trace
✗ Graph not found. Run `spec-graph compose` first.
# 修复:spec-graph compose
```

### Scenario 9: 节点无 trace

```bash
$ spec-graph trace design/arch
✗ Node not found: design/arch
Run `spec-graph trace` to see available nodes.
# 修复:先 spec-graph trace 看所有可用节点
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| `Profile not found` | 未 init | `spec-graph init` |
| `--from and --to are required` | add 缺参数 | 补全两个 id |
| `--from artifact not found in graph` | id 错 | `artifact list` 查 id |
| `Node not found: <id>` | trace 时 id 错 | `spec-graph trace` 列所有节点 |
| `Trace entry already exists` | 重复 add | 不报错,信息提示 |

## 衔接关系

- **前置**: `compose` + `init`(graph + profile 必须存在)
- **触发 add**: dispatch 的 verify_trace action / 手动 / `artifact complete` 的 auto-wire
- **被消费方**: gate 的 `require_traces` 查询(检查边是否存在)
- **与 contract 区别**: trace 是单项目内追溯,contract 是跨 track 版本契约
- **与 impact 协同**: `impact` 用 trace 索引计算 ripple 范围
- **auto-wire**: artifact complete 时,trace 文件里的 placeholder 会按 kind 自动填充
- **典型链路**: produce_artifact → artifact complete(auto-wire 触发)→ gate 评估 traces → (缺则) trace add → dispatch 重评估
