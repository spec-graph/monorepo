---
name: spec-graph-show
description: "Display a summary of the composed graph (artifacts, checks, gates, tracks, pipeline stages, scope policy). Read-only structural overview. Use to verify compose output and inspect what packs contributed."
---

# spec-graph show

显示已 compose 的 graph 结构摘要 — 表格 + JSON 两种格式。

## Architecture Principle

**spec-graph show 是只读结构视图 — 不改 graph,不显示运行时状态。**

- ❌ show 不会改 graph 结构
- ❌ show 不会显示运行时进度(那是 dashboard)
- ❌ show 不会渲染拓扑图(那是 visualize)
- ✅ show 读 graph.yaml,以表格展示声明内容
- ✅ show 校验 graph 有效性(渲染时若结构 OK 输出 "Graph is valid")

**Agent 职责**:compose 后跑 show 确认结构正确;debug 时用 show 查 gates / tracks 声明。

## What this does

读 `.spec-graph/graph.yaml`,展示:

### 展示内容

| Section | 内容 |
|---------|------|
| **Meta** | composed_at / change_type / packs_used 数 |
| **Statistics** | artifacts / actions / checks / gates / tracks 计数 |
| **Pipeline Stages** | 有序 stage 列表(specify → design → ... → accept) |
| **Gates 表格** | id / on_transition / 需求数 / fail_mode / enabled |
| **Tracks 表格** | id / scope / actions 数 / produces / consumes |
| **Scope Policy** | derive_from / forbid_widen |

### 与其他命令的区别

| 命令 | 视角 |
|------|------|
| `show` | graph **结构**(声明,无运行时状态) |
| `dashboard` | **运行时状态**(进度 / 完成率 / 阻塞) |
| `visualize` | **拓扑图**(DOT / Mermaid / JSON) |
| `status` | 当前工作流位置 + next action |

## Usage

```bash
# 默认表格输出
spec-graph show

# JSON 输出(完整 graph.yaml 内容)
spec-graph show --format json
```

### Options

| Option | Description |
|--------|-------------|
| `--format <type>` | `table`(默认)/ `json` |

## Execution Rules

### ✅ 应该用 show 的场景

| 场景 | 操作 |
|------|------|
| compose 后校验 graph 正确 | `show` 看统计 + gates + tracks |
| 想知道哪些 pack 贡献了 artifacts | `show` 看 meta.packs_used |
| debug gate / track 声明 | `show` 看表格 |
| 程序化解析 graph 结构 | `show --format json` |
| 确认 scope policy | `show` 末尾 |

### ❌ 不应该用 show 的场景

| 场景 | 替代做法 |
|------|---------|
| 看运行时进度 | `spec-graph dashboard` |
| 看拓扑图 | `spec-graph visualize` |
| 看具体 artifact 状态 | `spec-graph artifact list` |
| 看当前 stage / next action | `spec-graph status` |
| 改 graph 结构 | 改 pack / profile,然后 `compose` |

## Agent Workflow

```
1. spec-graph compose (生成 / 更新 graph.yaml)
   ↓
2. spec-graph show (校验结构)
   - artifact / check / gate 数量符合预期?
   - pipeline stages 顺序对?
   - gates 都 enabled?
   - tracks 的 produces/consumes 正确?
   ↓
3. (有问题) → 改 pack / profile → re-compose
   (没问题) → spec-graph prime → dispatch
```

## Usage Scenarios

### Scenario 1: compose 后校验

```bash
spec-graph compose
spec-graph show
# 📊 Spec-Graph Summary
#   Composed: 2026-06-30T...
#   Change Type: feature
#   Packs Used: 3
#
#   Graph Statistics:
#     • Artifacts: 15
#     • Actions: 23
#     • Checks: 8
#     • Gates: 7
#     • Tracks: 3
#
#   Pipeline Stages:
#     specify → design → plan → implement → review → accept
#
#   Gates: (表格)
#   Tracks: (表格)
#
#   ✓ Graph is valid and ready
```

### Scenario 2: JSON 程序化解析

```bash
spec-graph show --format json | jq '.gates | length'
# 7

spec-graph show --format json | jq '.pipeline_skeleton.stages'
# ["specify", "design", "plan", "implement", "review", "accept"]

spec-graph show --format json | jq '.tracks[] | .id'
# "frontend"
# "backend"
# "shared"
```

### Scenario 3: debug gate 声明

```bash
spec-graph show
# 看 Gates 表格:
#   ID                On Transition    Requirements  Fail Mode   Enabled
#   specify-to-design design           3             hard        ✓
#   ...
# 发现某 gate enabled=✗ → 检查 pack 配置
```

### Scenario 4: 检查 scope policy

```bash
spec-graph show
# Scope Policy:
#   • Derived from: profile.yaml
#   • Forbid widen: Yes
# 确认 scope 不允许扩大(forbid_widen=true)
```

### Scenario 5: 失败 — 未 compose

```bash
$ spec-graph show
✗ Graph not found. Run `spec-graph compose` first.
# 修复:
spec-graph compose
spec-graph show
```

### Scenario 6: 失败 — graph 损坏

```bash
$ spec-graph show
Error: ... (YAML parse error / schema mismatch)
# 修复:
# 1. 检查 .spec-graph/graph.yaml 是否手动改坏
# 2. 重新 compose
spec-graph compose --force   # 若 compose 支持强制
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| YAML parse error | graph.yaml 损坏 | 重新 `compose` |
| 部分字段缺失 | pack 不完整 | 检查 `packs/<pack>/pack.yaml` |

## 衔接关系

- **前置**: `spec-graph compose`(graph.yaml 必须存在)
- **只读**: show 不修改 graph
- **互补视图**:
  - `show` = 结构(声明)
  - `dashboard` = 状态(运行时)
  - `visualize` = 拓扑(图)
  - `status` = 当前位置 + next action
- **下游**: 校验后通常跑 `prime` → `dispatch`
- **重新生成**: 改 pack / profile 后必须 `compose`,show 自动反映新结构
