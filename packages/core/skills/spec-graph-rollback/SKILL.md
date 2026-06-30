---
name: spec-graph-rollback
description: "Safely rollback a change to its pre-change state using snapshots captured during `change archive`. spec-graph restores tracked config files (profile.yaml / graph.yaml / machine-state.yaml) from the snapshot directory. AI agent is responsible for verifying dry-run output, handling source-code rollback (via git), and deciding whether machine-state should be reset. Use when a change needs to be undone after archive."
---

# spec-graph rollback

基于 safety-net snapshot 安全回滚已归档的 change。

## Architecture Principle

**spec-graph 只回滚它管理的文件 — 不管你的源码。**

- ❌ spec-graph 不会 `git revert` 你的代码
- ❌ spec-graph 不会撤销 worktree / merge-queue 状态
- ❌ spec-graph 不会自动重置 `machine-state.yaml`(留给 coordinator 决定)
- ✅ spec-graph 从 snapshot 目录恢复 `profile.yaml` / `graph.yaml` / `machine-state.yaml`(注:当前实现把所有快照文件回写到 `.spec-graph/`)
- ✅ spec-graph 提供 `--dry-run` 预览要恢复的文件
- ✅ spec-graph 检测 git 存在与否(用于将来集成 git revert,当前仅打印提示)

**Agent 的职责**:决定是否需要回滚源码(用 git),决定是否重置 machine-state,验证回滚结果。

## What this does

`rollback` 命令基于 `change archive` 时创建的 snapshot 进行回滚:

1. 在 `.spec-graph/snapshots/<change-id>-<timestamp>/` 找 snapshot 目录
2. 读取 `manifest.json` 获取元信息(change_id / title / archived_at)
3. 列出 snapshot 中的非 .json / 非 .md 文件(profile.yaml / graph.yaml / machine-state.yaml)
4. (非 dry-run 时)将文件 copy 回 `.spec-graph/` 根目录
5. 打印 git 提示(若 git 存在)

### Snapshot 包含的文件

`change archive` 时 snapshot 以下文件(若存在):

| 文件 | 用途 |
|------|------|
| `profile.yaml` | 项目维度(stacks / build / criticality 等) |
| `graph.yaml` | 工件依赖图(artifacts / checks / gates) |
| `machine-state.yaml` | 8 态生命周期状态 |
| `<change-id>-<timestamp>-plan.md` | Plan MD(archive 时已移走) |
| `manifest.json` | snapshot 元信息 |

## Usage

```bash
spec-graph rollback <change-id>                # 实际回滚
spec-graph rollback <change-id> --dry-run      # 仅预览
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<change-id>` | ✅ Required | Change ID(支持前缀匹配 snapshot 目录) |

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | 仅列出将要恢复的文件,不实际写入 |

## Execution Rules

### ✅ 何时使用

| 情况 | 是否运行 rollback |
|------|------------------|
| archive 后发现 change 引入严重 bug | ✅ 用 rollback 恢复 .spec-graph/ 配置 |
| profile_patch 导致 graph 错乱 | ✅ rollback 恢复旧 profile / graph |
| migration 失败,需要回到迁移前状态 | ✅ rollback + git revert |
| 演示 / 实验后想恢复干净状态 | ✅ 用 --dry-run 先看 |
| 同一 change 多次 archive(理论上不会发生) | ✅ 找最新 snapshot |

### ❌ 何时不使用

| 情况 | 替代做法 |
|------|---------|
| change 还在 in_progress(未 archive) | 没有 snapshot,无法 rollback;手动 `change discard` |
| 想"重做" change | 创建新 change,不要 rollback |
| 仅想撤销某个 artifact | 直接编辑该 artifact 文件,无需 rollback |
| 想 reset machine-state | 显式说明(spec-graph 默认不恢复 machine-state) |
| 源码回滚 | 用 `git revert` / `git reset`,spec-graph 不管源码 |

### 判断流程

```
发现需要回滚
    ↓
change 已 archive 吗?
    ├── 是 → snapshot 存在吗?
    │       ├── 是 → spec-graph rollback <id> --dry-run (先预览)
    │       │       ↓
    │       │       文件列表合理?
    │       │       ├── 是 → spec-graph rollback <id> (实际执行)
    │       │       │       ↓
    │       │       │       需要回滚源码吗?
    │       │       │       ├── 是 → git revert <commit> (agent 操作)
    │       │       │       └── 否 → 完成
    │       │       └── 否 → 检查 snapshot 目录
    │       └── 否 → snapshot 丢失,无法 rollback
    └── 否(未 archive)
            ↓
            手动 change discard / 直接编辑
```

## Agent Workflow

### Step 1: 确认 snapshot 存在

```bash
# 检查 snapshot 目录
ls .spec-graph/snapshots/ | grep <change-id>

# 查看 manifest
cat .spec-graph/snapshots/<change-id>-<timestamp>/manifest.json
```

如果 snapshot 不存在 → change 未 archive,或 archive 时 snapshot 失败。rollback 无法继续。

### Step 2: 先 dry-run 预览

```bash
spec-graph rollback <change-id> --dry-run

# 输出:
# 🔙 Rolling back: <change-id>
#   Snapshot: .spec-graph/snapshots/<change-id>-<timestamp>
#   Archived at: <timestamp>
#
#   [DRY RUN] Would restore:
#     - profile.yaml
#     - graph.yaml
#     - machine-state.yaml
#
#   [DRY RUN] No files actually restored.
```

### Step 3: Agent 验证 dry-run 输出

确认:

- 文件列表合理(profile + graph + machine-state)
- snapshot 的 archived_at 时间是预期的归档时间(不是更早的错误版本)
- 当前 `.spec-graph/` 的状态是否允许覆盖(是否有未保存的工作)

### Step 4: 执行实际回滚

```bash
spec-graph rollback <change-id>

# 输出:
# 🔙 Rolling back: <change-id>
#   Snapshot: .spec-graph/snapshots/...
#   Archived at: ...
#   Using git revert...  (或 "Restoring from snapshot files...")
# ✓ Rolled back 3 file(s)
#   machine-state.yaml was NOT restored (coordinator decides).
```

### Step 5: (可选) 源码回滚

spec-graph 只管 `.spec-graph/` 内的配置文件。如果 change 也改了源码:

```bash
# 找到 change 对应的 commit
git log --oneline | grep <change-id>

# 选择回滚方式
git revert <commit>          # 推荐:创建反向 commit
# 或
git reset --hard <commit>^   # 慎用:丢弃历史
```

### Step 6: 验证回滚结果

```bash
# 确认 profile / graph 恢复
spec-graph profile show
spec-graph compose --json | jq '.artifacts | length'

# 确认 machine-state(注意:spec-graph 不会自动恢复,需手动)
cat .spec-graph/machine-state.yaml

# 如果需要恢复 machine-state:
cp .spec-graph/snapshots/<change-id>-<timestamp>/machine-state.yaml \
   .spec-graph/machine-state.yaml

# 重新跑 doctor 确认状态一致
spec-graph doctor
```

### Step 7: (可选) 创建新 change 记录此次回滚

```bash
spec-graph change create \
  --title "Rollback <original-change-id>" \
  --type bugfix \
  --priority high \
  --description "Revert <original> due to <reason>"
```

## Usage Scenarios

### Scenario 1: 成功 — profile_patch 引发问题后回滚

```bash
# change "Add PCI-DSS compliance" archive 时改了 profile.yaml
# 结果 criticality: compliance 触发了不存在的 gate
spec-graph rollback add-pci-dss-20260620-p1q2 --dry-run
# 输出 3 个文件将恢复:profile.yaml, graph.yaml, machine-state.yaml

spec-graph rollback add-pci-dss-20260620-p1q2
# ✓ Rolled back 3 file(s)

# 验证
spec-graph profile show
# criticality 已回到原值
```

### Scenario 2: 成功 — 用 dry-run 评估回滚范围

```bash
# 不确定 archive 改了什么,先预览
spec-graph rollback migrate-api-v2-20260615-m1n2 --dry-run

# 看到 3 个文件,确认范围
# 然后决定是否真的回滚
spec-graph rollback migrate-api-v2-20260615-m1n2
```

### Scenario 3: 成功 — 配合 git revert 完整回滚

```bash
# 1. spec-graph 回滚配置
spec-graph rollback add-auth-20260630-a1b2

# 2. agent 手动 git revert 源码
git log --oneline | grep add-auth-20260630
# 找到 abc1234 commit
git revert abc1234

# 3. 验证整体一致性
spec-graph doctor
spec-graph status
```

### Scenario 4: 失败 — snapshot 不存在

```bash
$ spec-graph rollback some-id
✗ No snapshot found for change: some-id
  Snapshots are in: .spec-graph/snapshots/

# 原因:
#   1. change 未 archive(snapshot 在 archive 时创建)
#   2. snapshot 目录被误删
#   3. ID 错误

# 修复:
ls .spec-graph/snapshots/
spec-graph change list   # 确认 ID
spec-graph change archive <id>   # 若未 archive
```

### Scenario 5: 失败 — change 未 archive

```bash
$ spec-graph rollback add-auth-20260630-a1b2
✗ No snapshot found for change: add-auth-20260630-a1b2

# 原因:change 还在 in_progress
spec-graph change show add-auth-20260630-a1b2
# status: in_progress

# 修复选项:
# A. 完成 + 归档(若工作已完成)
spec-graph change complete add-auth-20260630-a1b2
spec-graph change archive add-auth-20260630-a1b2
spec-graph rollback add-auth-20260630-a1b2

# B. 直接 discard(若想废弃)
spec-graph change discard add-auth-20260630-a1b2 --reason "Need to undo"
```

### Scenario 6: 失败 — 未 init

```bash
$ spec-graph rollback some-id
✗ No snapshot found for change: some-id
  Snapshots are in: .spec-graph/snapshots/

# 实际原因:无 .spec-graph/ 目录
spec-graph init --stack <stack> --build <build> --description "..."
```

### Scenario 7: 半成功 — 配置回滚但忘记源码

```bash
spec-graph rollback <id>
# ✓ Rolled back 3 file(s)
# 但源码改动还在!

# 后果:profile 与源码不一致,后续 gate 可能诡异失败
# 修复:必须同时 git revert 源码,然后跑 doctor 验证
git log --oneline | grep <id>
git revert <commit>
spec-graph doctor
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `✗ Change ID required` | 没传 ID | `spec-graph rollback <id>` |
| `✗ No snapshot found for change: <id>` | 未 archive / snapshot 被删 / ID 错 / 未 init | 先 `change archive`;查 snapshot 目录;`change list`;先 init |
| dry-run 后实际回滚失败 | 文件权限 / 路径冲突 | 检查 `.spec-graph/` 写权限;手动 copy |
| 配置回滚但源码未回滚 | spec-graph 不管源码 | 用 `git revert` 单独处理 |
| machine-state 不一致 | spec-graph 默认不恢复 machine-state | 手动从 snapshot copy machine-state.yaml |

## 衔接关系

- **前置**: `spec-graph change archive <id>`(snapshot 在 archive 时创建)
- **依赖文件**: `.spec-graph/snapshots/<change-id>-<timestamp>/`
- **回滚写入**: `.spec-graph/profile.yaml` / `graph.yaml` / `machine-state.yaml`
- **配合使用**:
  - 源码回滚 → `git revert` / `git reset`(agent 操作)
  - 整体一致性 → `spec-graph doctor`
  - 状态查询 → `spec-graph status`
  - 配置预览 → `spec-graph profile show` / `spec-graph compose --json`
- **后续**:
  - 创建新 change 记录回滚原因
  - 重新 compose + prime(若 profile 改动大)
  - `spec-graph retro <original-id>` 反思为何需要回滚
- **协作**: spec-graph 负责配置文件回滚,git 负责源码回滚,agent 是协调者决定两边是否都需要。

## 注意事项

- **machine-state 不自动恢复**: 当前实现明确不恢复 machine-state(留给 coordinator 决定),如需恢复手动 copy。
- **不可逆警告**: rollback 会覆盖 `.spec-graph/` 配置,执行前务必先 `--dry-run`。
- **不撤销归档**: rollback 不会把 change 从 `archived/` 移回 `changes/`。change 仍是归档状态。
- **多次 rollback**: 同一 snapshot 可多次 rollback(每次都从 snapshot copy),不会损坏 snapshot 本身。
- **git 检测**: 命令会检测 git 存在与否并打印提示,但当前版本不实际调用 git revert(注释里写 "TODO: Integrate with git merge-queue atomic merge")。
