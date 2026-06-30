---
name: spec-graph-artifact
description: "List, inspect, and update workflow artifacts (PRDs, designs, contracts, plans, implementations, verifications). Lifecycle: pending → in_progress → ready → completed → failed/blocked. Auto-wires traces on completion. spec-graph tracks status — does NOT produce content."
---

# spec-graph artifact

管理工作流中的 artifact — 列表 / 详情 / 状态更新 / 注册。

## Architecture Principle

**spec-graph 是 artifact 状态账本 — 不生产内容。**

- ❌ spec-graph 不会写 PRD / design / plan 内容(那是 sub-agent 的职责)
- ❌ spec-graph 不会自动决定何时 complete(由 agent / dispatch 决定)
- ❌ spec-graph 不会校验 artifact 内容质量(那是 check / gate)
- ✅ spec-graph 跟踪 status:pending → in_progress → ready → completed → failed/blocked
- ✅ spec-graph 在 complete 时自动 wire 匹配的 trace(填充 placeholder)
- ✅ spec-graph 同时管 graph 声明和 machine-state 跟踪两种视图

**Agent 职责**:produce_artifact 写文件 → `artifact complete` 更新状态 → trace 自动 wire → gate 解除阻塞。

## What this does

artifact 是 `graph.yaml` 声明的工作产物。每个 artifact 有:

- `id` — 全局唯一(如 `requirement/prd`)
- `kind` — 七种超类型之一
- `optional` — 是否可选
- `produced_by` / `consumed_by` — 生产者 / 消费者 track
- `status` — 运行时状态

### 7 种 Kind

| Kind | 含义 |
|------|------|
| `requirement` | 要解决什么(PRD / user story) |
| `design` | 怎么解决(架构 / 时序 / 接口) |
| `contract` | 边界契约(producer + consumer) |
| `plan` | 任务分解(story / tasks) |
| `implementation` | 代码 + 配置 + 资源 |
| `verification` | 测试 / review / accept 证据 |
| `change-record` | 变更轨迹(CR / changelog / archive) |

### Status 状态机

```
pending → in_progress → ready → completed
                ↓           ↓
              failed     blocked
```

| Status | 含义 | 触发命令 |
|--------|------|---------|
| `pending` | 未开始 | (初始) |
| `in_progress` | 正在生产 | `update --status in_progress` |
| `ready` | 已生产,等下游 | `ready` 或 `update --status ready` |
| `completed` | 完成,可被 gate 引用 | `complete` 或 `update --status completed` |
| `failed` | 生产失败 | `update --status failed` |
| `blocked` | 被外部阻塞 | `block` 或 `update --status blocked` |

### Auto-wire traces

`artifact complete` 时,会扫描 `.spec-graph/traces/*.yaml`,把 placeholder(`<...>`)的 from/to 替换为真实 artifact id(按 kind 匹配)。无需手动 wire 已声明的 trace。

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | 列出所有 artifacts(默认) |
| `show <id>` | 显示 artifact 详情 |
| `complete <id>` | 标记为 completed(等价 `update --status completed`) |
| `update <id> --status <s>` | 更新状态(通用) |
| `register <id>` | 注册新 artifact(等价 update,用于 tracked-only) |
| `ready <id>` | 标记为 ready |
| `block <id>` | 标记为 blocked |

## Usage

```bash
# 列出所有 artifacts
spec-graph artifact list
spec-graph artifact list --json

# 查看详情
spec-graph artifact show requirement/prd
spec-graph artifact show requirement/prd --json

# 标记完成(最常用)
spec-graph artifact complete requirement/prd
# 内部:auto-wire 匹配的 trace

# 更新为任意状态
spec-graph artifact update design/arch --status in_progress
spec-graph artifact update design/arch --status completed --producer backend

# 标记 ready / blocked
spec-graph artifact ready plan/tasks
spec-graph artifact block plan/tasks

# 注册新(声明外的)tracked artifact
spec-graph artifact register custom/report --producer analytics
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `--status <s>` | update/register | pending / in_progress / ready / completed / failed / blocked |
| `--producer <p>` | update/register | 标记生产者 |
| `--json` | list/show/update | JSON 输出 |

## Execution Rules

### ✅ 应该用 artifact 命令的场景

| 场景 | 推荐操作 |
|------|---------|
| sub-agent 写完 artifact 文件 | `artifact complete <id>`(触发 auto-wire) |
| 查看所有 artifact 状态 | `artifact list` |
| 查看具体 artifact 详情(producer/consumers) | `artifact show <id>` |
| 开始生产但未完成 | `update --status in_progress` |
| 被外部依赖阻塞 | `block <id>` |
| 生产完等下游消费 | `ready <id>` |

### ❌ 不应该用 artifact 命令的场景

| 场景 | 替代做法 |
|------|---------|
| 写 artifact 文件内容 | 通过 dispatch 让 sub-agent 生产 |
| 推 stage transition | `spec-graph machine transition` |
| 跑 check | `spec-graph check` |
| 加新 artifact 到 graph | 改 pack / profile,然后 `compose` |
| 注册契约版本 | `spec-graph contract publish`(contract 类型) |

## Agent Workflow

```
1. dispatch manifest.actions[0] 指向某 artifact
   - suggested_doc_path: .spec-graph/artifacts/<kind>/<file>.md
   - agent_id: spec-author
   ↓
2. sub-agent 读 template + guidance,生产文档
   - 写到 suggested_doc_path
   ↓
3. spec-graph artifact complete <id>
   ↓ (status: * → completed)
   ↓ (auto-wire: 扫描 traces/,替换 placeholder)
4. spec-graph dispatch --json (重新评估,可能 gate 解除阻塞)
   ↓
5. (循环直到所有 artifact 完成)
```

### Auto-wire 细节

```
artifact complete requirement/prd
  ↓
扫描 .spec-graph/traces/*.yaml
  ↓
对每条 trace:
  if from == "<placeholder>" and from_kind == "requirement":
      from = "requirement/prd"  (替换)
  if to == "<placeholder>" and to_kind == "requirement":
      to = "requirement/prd"
  ↓
输出: ↳ auto-wired N trace file(s)
```

## Usage Scenarios

### Scenario 1: 标准生产 → complete

```bash
# sub-agent 写完 PRD(通过 dispatch)
# 文件: .spec-graph/artifacts/requirement/prd.md

spec-graph artifact complete requirement/prd
# ✓ Artifact requirement/prd updated to completed
#   ↳ auto-wired 2 trace file(s)
```

### Scenario 2: 标记 in_progress(开始生产)

```bash
spec-graph artifact update design/arch --status in_progress
# ✓ Artifact design/arch updated to in_progress
```

### Scenario 3: blocked(被外部依赖卡住)

```bash
spec-graph artifact block implementation/api
# ✗ Artifact implementation/api marked as blocked
# gate 看到 blocked 会停止推进
```

### Scenario 4: 查看所有 artifacts

```bash
spec-graph artifact list
# 📦 Artifacts
#   ID              Kind          Status      Optional  Producer
#   requirement/prd requirement   completed   no        spec-author
#   design/arch     design        in_progress no        spec-author
#   plan/tasks      plan          pending     no        -
```

### Scenario 5: 失败 — artifact 不存在

```bash
$ spec-graph artifact show requirement/nonexistent
✗ Artifact not found: requirement/nonexistent
# 修复:spec-graph artifact list 查实际 id
```

### Scenario 6: 失败 — 状态值非法

```bash
$ spec-graph artifact update plan/tasks --status done
✗ Invalid artifact status: done
Available: pending, in_progress, ready, completed, failed, blocked
# 修复:用 completed(不是 done)
```

### Scenario 7: 失败 — 未 compose

```bash
$ spec-graph artifact list
✗ Graph not found. Run `spec-graph compose` first.
# 修复:
spec-graph compose
spec-graph artifact list
```

### Scenario 8: contract 类型 artifact(双边性)

```bash
# contract artifact 有 producer 和 consumer 两边
spec-graph artifact show contract/openapi
# Producer: api-gateway
# Consumers: frontend, mobile-app
# 改 producer 端会触发 ripple,见 spec-graph contract
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Missing artifact ID` | 漏 id 参数 | 加 `<id>` |
| `Artifact not found: <id>` | id 错或未声明 | `artifact list` 查 id |
| `Invalid artifact status: <x>` | status 值错 | 用 pending/in_progress/ready/completed/failed/blocked |
| `Graph not found` | 未 compose | `spec-graph compose` |
| auto-wire 没触发 | trace 文件无 placeholder / kind 不匹配 | 检查 traces/ 文件 |

## 衔接关系

- **前置**: `spec-graph compose`(graph.yaml 必须存在)
- **被读取方**: gate(检查 artifact 是否 completed)/ dispatch(manifest 引用 artifact 状态)
- **auto-wire 触发**: complete 时自动更新 `.spec-graph/traces/*.yaml`
- **与 contract 协同**: contract 类型 artifact 用 `spec-graph contract` 管版本,artifact 命令只管 status
- **与 machine 协同**: `machine update --artifact <id> --status <s>` 是等价底层调用
- **典型链路**: dispatch → produce_artifact → 写文件 → `artifact complete` → auto-wire trace → gate 解除 → 继续 dispatch
