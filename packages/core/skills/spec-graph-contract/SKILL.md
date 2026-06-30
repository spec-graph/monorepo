---
name: spec-graph-contract
description: "Federated contract registry. Publish producer versions, bind consumers, detect drift (stale/broken), and reverify after producer changes. Triggers ripple effects in dispatch. spec-graph tracks versions — does NOT author contract content."
---

# spec-graph contract

联邦契约管理 — producer 发布版本、consumer 绑定版本、自动检测 drift。

## Architecture Principle

**spec-graph 是契约登记处 — 不写契约内容,只跟踪版本与绑定。**

- ❌ spec-graph 不会替你写 OpenAPI / schema 内容(那是 producer 的 artifact)
- ❌ spec-graph 不会自动判断「该升级到 v2」(由 agent / 人决策)
- ❌ spec-graph 不会自动 reverify consumer(必须显式调用,确认已测试)
- ✅ spec-graph 只在 `contracts/<id>.yaml` 记录版本 + consumer 绑定
- ✅ spec-graph 自动重算 drift(stale / broken),并在 gate / dispatch 中阻塞

**Agent 职责**:producer 改契约 → publish 新版本 → 通知 consumer → consumer 测试后 reverify。

## What this does

每个 contract 是一个 YAML 文件 `.spec-graph/contracts/<id>.yaml`,记录:

- `producer` — 谁生产这个契约(track id)
- `versions[]` — 历史版本列表(version + published_at + notes)
- `current_version` — 当前最新版本
- `consumers[]` — 绑定的 consumer 列表(consumer + bound_version + status)
- `drift` — 自动重算的 drift 报告(stale_consumers / broken_consumers)

### Status 流转

```
current  ←→  stale  ←→  broken
  ↑              ↑           ↑
绑定的版本      producer     consumer 标记
== current    发布新版本     无法兼容
```

- `current` — consumer 绑定版本 == producer current_version
- `stale` — consumer 绑定版本落后(自动检测)
- `broken` — consumer 手动标记不兼容(需 fix 或回滚)

### Ripple Effect

producer `publish` 新版本 → 所有 consumer 自动变 `stale` → gate 阻塞 → consumer 测试 → `reverify` 升级 bound_version → 回到 `current`。

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | 列出所有契约(默认) |
| `publish <id> --version <v>` | producer 发布新版本 |
| `bind <id> --consumer <track> --version <v>` | consumer 绑定到某版本 |
| `unbind <id> --consumer <track>` | 解除 consumer 绑定 |
| `reverify <id> --consumer <track>` | consumer 升级到 current_version |
| `show <id>` | 显示契约详情(versions + consumers) |
| `drift` | 全量重算 drift 报告 |
| `init-from-graph` | 从 graph.yaml 的 contract artifacts 批量 seed |

## Usage

```bash
# 列出所有契约
spec-graph contract list
spec-graph contract list --json

# 从 graph 初始化契约登记(基于 contract/* artifacts)
spec-graph contract init-from-graph

# producer 发布新版本
spec-graph contract publish contract/openapi --version 1.2.0 \
  --producer api-gateway --notes "Added /v2/users endpoint"

# consumer 绑定到某版本
spec-graph contract bind contract/openapi \
  --consumer frontend --version 1.2.0

# consumer 在 producer 升级后重新测试并 reverify
spec-graph contract reverify contract/openapi --consumer frontend

# 查看单个契约
spec-graph contract show contract/openapi

# 全量 drift 报告
spec-graph contract drift
spec-graph contract drift --json

# 解除绑定
spec-graph contract unbind contract/openapi --consumer frontend
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `--id <id>` | publish/bind/unbind/reverify/show | 契约 ID(如 `contract/openapi`) |
| `--version <v>` | publish/bind | semver 版本号 |
| `--consumer <track>` | bind/unbind/reverify | consumer track id |
| `--producer <track>` | publish | producer track id |
| `--notes <text>` | publish/bind | 版本或绑定备注 |
| `--json` | (any) | JSON 输出 |

## Execution Rules

### ✅ 应该用 contract 的场景

| 场景 | 操作 |
|------|------|
| 项目有跨 track 边界(API ↔ 前端、schema ↔ 服务) | `init-from-graph` 初始化 |
| producer 改了 API/schema | `publish --version <new>` |
| consumer 接入新契约 | `bind --consumer <track> --version <v>` |
| producer 升级后 consumer 已测试通过 | `reverify --consumer <track>` |
| 想知道哪些 consumer 落后 | `drift` |
| consumer 永久不再用某契约 | `unbind` |

### ❌ 不应该用 contract 的场景

| 场景 | 替代做法 |
|------|---------|
| 写 OpenAPI / Protobuf / JSON Schema 内容 | 作为 artifact 由 dispatch 生产 |
| 跨项目契约(完全独立 repo) | 用专门契约工具(pact / buf) |
| 单 track 内部依赖 | 不需要 contract,用 trace 即可 |
| 临时实验性接口 | 先不登记,稳定后再 publish |

## Agent Workflow

### Producer 发布新版本

```
1. producer 改 artifact (例: design/contract-openapi)
   ↓
2. agent 判断这是契约变更(影响多 consumer)
   ↓
3. spec-graph contract publish contract/openapi \
     --version <new> --notes "..."
   ↓ (current_version 更新,所有 consumer 自动 stale)
   ↓ (dispatch manifest 会标 stale,相关 gate 阻塞)
4. 通知 consumer agent:需要测试 + reverify
```

### Consumer 测试后 reverify

```
1. consumer agent 看到 drift / dispatch 提示契约 stale
   ↓
2. 拉新版契约 → 跑测试 → 修代码
   ↓
3. 测试通过后:
   spec-graph contract reverify contract/openapi --consumer frontend
   ↓ (bound_version 升到 current_version,status → current)
   ↓ (gate 解除阻塞)
4. spec-graph dispatch --json (继续工作流)
```

### 初始化(seed from graph)

```
1. spec-graph compose (先生成 graph.yaml,含 contract/* artifacts)
   ↓
2. spec-graph contract init-from-graph
   ↓ (为每个 contract/* artifact 创建 seed entry,version=0.0.0)
3. spec-graph contract publish <id> --version 1.0.0 (标定首个正式版本)
4. spec-graph contract bind <id> --consumer <track> --version 1.0.0
```

## Usage Scenarios

### Scenario 1: 标准发布 → reverify 流程

```bash
# API 团队改了 OpenAPI
spec-graph contract publish contract/openapi \
  --version 2.0.0 \
  --producer api \
  --notes "Breaking: rename /users to /accounts"

# frontend 自动变 stale
spec-graph contract drift
# 🌊 Contract Drift Report
#   stale consumers: 1
#     contract/openapi: ⚠ stale: frontend

# frontend agent 拉新版,修代码,跑测试
# 测试通过后:
spec-graph contract reverify contract/openapi --consumer frontend
# ✓ frontend reverified against contract/openapi@2.0.0
#   Bumped bound_version 1.0.0 → 2.0.0

spec-graph contract drift
# ✓ All consumers on current versions.
```

### Scenario 2: 新 consumer 接入

```bash
spec-graph contract bind contract/openapi \
  --consumer mobile-app \
  --version 2.0.0 \
  --notes "v2 mobile client"
# ✓ Bound mobile-app → contract/openapi@2.0.0
```

### Scenario 3: consumer 永久下线

```bash
spec-graph contract unbind contract/openapi --consumer legacy-sdk
# ✓ Unbound legacy-sdk from contract/openapi
```

### Scenario 4: 批量初始化

```bash
spec-graph compose
spec-graph contract init-from-graph
# ✓ Seeded 3 contract(s) from graph

spec-graph contract list
# 📜 Contract Registry
#   contract/openapi   api     0.0.0   2 consumers   0
#   contract/grpc      api     0.0.0   1 consumer    0
```

### Scenario 5: 标记 broken(consumer 无法升级)

```bash
# 直接编辑 .spec-graph/contracts/<id>.yaml
# 把对应 consumer 的 status 改为 "broken"
# 然后:
spec-graph contract drift
# broken consumers: 1
#   contract/openapi: ✗ broken: legacy-sdk
# dispatch 会阻塞直到 broken 解决
```

### Scenario 6: 失败 — 未 init-from-graph 就 publish

```bash
$ spec-graph contract show contract/foo
✗ Contract not found: contract/foo
  Run `spec-graph contract init-from-graph` first, or `publish` to add one.
# 修复:先 init-from-graph 或直接 publish 创建
```

### Scenario 7: 失败 — reverify 未绑定的 consumer

```bash
$ spec-graph contract reverify contract/openapi --consumer mobile
✗ Consumer mobile is not bound to contract/openapi. Run `bind` first.
# 修复:先 bind
spec-graph contract bind contract/openapi --consumer mobile --version 2.0.0
```

### Scenario 8: 失败 — 重复 publish 同版本

```bash
$ spec-graph contract publish contract/openapi --version 2.0.0
⚠ Version 2.0.0 already published at 2026-06-29T...
# 修复:用新版本号(2.0.1 / 2.1.0)
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Contract ID required` | 漏 --id | 加 `--id <id>` 或位置参数 |
| `Version required` | 漏 --version | 加 `--version <v>` |
| `Consumer required` | 漏 --consumer | 加 `--consumer <track>` |
| `Contract not found: <id>` | ID 错或未 seed | `init-from-graph` 或 `publish` 创建 |
| `Consumer <x> is not bound` | reverify 前未 bind | 先 `bind` |
| `Version <v> already published` | 重复 publish | 改用新版本号 |
| `Consumer <x> was not bound` | unbind 不存在的绑定 | 检查 `show` 看实际 consumers |

## 衔接关系

- **前置**: `spec-graph compose`(graph.yaml 必须存在才能 init-from-graph)
- **触发 ripple**: publish 后 dispatch manifest 会标记 stale consumer,gate 阻塞
- **解除阻塞**: consumer 测试后 `reverify` 升级 bound_version
- **与 gate 协同**: gate 的 `require_contracts` 检查会读 drift,有 stale/broken 即 fail
- **与 artifact 关系**: contract artifact(如 `design/contract-openapi`)是契约内容,contract registry 是版本账本
- **与 impact 协同**: `spec-graph impact` 能查 producer 改动影响哪些 consumer
- **归档**: change archive 时 contract 状态保留(跨 change 持续追踪)
