---
name: spec-graph-merge-queue
description: "Sequential merge queue with atomic commit-or-abort protection. Enqueue isolation units with their file lists, detect overlapping file changes between queued items, merge one at a time. If a merge fails (conflicts), the unit is marked failed and the queue continues with the next. spec-graph is a neutral queue manager — it does NOT resolve conflicts or decide merge order. The agent interprets failures and decides to retry, rebase, or abandon."
---

# spec-graph merge-queue

原子合并队列 — commit-or-abort 顺序合并。

## Architecture Principle

**spec-graph 只管队列与检测,不解决冲突。**

- ❌ spec-graph 不会替你解决 merge conflict
- ❌ spec-graph 不会替你决定合并顺序
- ❌ spec-graph 不会自动 rebase
- ✅ spec-graph 接受 unit 入队(带 file_list)
- ✅ spec-graph 检测队列内 unit 之间的文件 overlap
- ✅ spec-graph 标记 unit 状态(queued / checking / merging / merged / failed)
- ✅ spec-graph 支持 atomic commit-or-abort(失败则该 unit 标记 failed,队列继续)

**Agent 的职责**:决定入队时机、处理 failed unit(rebase / 解决冲突 / 放弃)。

## What this does

顺序合并队列,确保多个 isolation unit 按队列顺序原子化合并到目标分支(默认 main):

1. **enqueue** — unit 带 file_list 入队,获得 position
2. **overlaps** — 检测队列内 unit 之间的共享文件
3. **dequeue** — 取出队首 unit 进入 checking / merging
4. **mark-merged / mark-failed** — 标记结果,推进队列

## Queue 状态

| Status | 含义 |
|--------|------|
| `queued` | 已入队,等待 |
| `checking` | 正在检查 overlap / scope |
| `merging` | 正在合并 |
| `merged` | 合并成功 |
| `failed` | 合并失败(conflict / 其他错误) |

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `enqueue <unit-id> --files <list>` | 入队 |
| `dequeue` | 取出队首 |
| `list` | 列出所有队列项 |
| `overlaps` | 检测队列内文件 overlap |
| `mark-merged <unit-id>` | 标记合并成功 |
| `mark-failed <unit-id> --reason <text>` | 标记合并失败 |
| `remove <unit-id>` | 从队列移除 |

## Usage

```bash
# 入队(通常由 change complete 自动触发)
spec-graph merge-queue enqueue auth-refactor --files "src/auth/login.ts,src/auth/oauth.ts"

# 查看队列
spec-graph merge-queue list

# 检测 overlap
spec-graph merge-queue overlaps

# 取出队首进入合并
spec-graph merge-queue dequeue

# 标记结果
spec-graph merge-queue mark-merged auth-refactor
spec-graph merge-queue mark-failed auth-refactor --reason "conflict in src/auth/login.ts"

# 移除(放弃合并)
spec-graph merge-queue remove auth-refactor
```

### Options

| Option | For | Description |
|--------|------|-------------|
| `--files <list>` | enqueue | 该 unit 涉及的文件(逗号分隔),用于 overlap 检测 |
| `--target <branch>` | (top-level) | 目标分支,默认 `main` |
| `--reason <text>` | mark-failed | 失败原因 |
| `--json` | (any) | JSON 输出 |

## Execution Rules

### ✅ 何时使用

| 情况 | 命令 |
|------|------|
| change complete 后 | 自动入队(由 change complete 触发) |
| 多个 unit 准备合并 | `enqueue` 每个,再 `list` 看顺序 |
| 合并前检查冲突风险 | `overlaps` |
| 手动驱动合并流程 | `dequeue` → `mark-merged` / `mark-failed` |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 单个 worktree 直接合并 | `spec-graph worktree merge` |
| 想检测 scope(allowed/forbidden) | `spec-graph scope overlap` |
| 想看 worktree 生命周期 | `spec-graph worktree list` |
| 想回滚已合并的 | `spec-graph rollback` |

## Agent Workflow

### Step 1: change complete 自动入队

```bash
spec-graph change complete auth-refactor
# 内部: 自动 enqueue 到 merge queue
# 输出: ✓ Enqueued auth-refactor at position 1
```

### Step 2: 检查 overlap

```bash
spec-graph merge-queue overlaps
# 如果有 overlap,agent 需要决策:
#   - 协调顺序(谁先合)
#   - 或拆分 unit 让文件不重叠
```

### Step 3: 顺序合并

```bash
# 取队首
spec-graph merge-queue dequeue
# 输出: ✓ Dequeued auth-refactor (status=checking)

# 实际合并(由 worktree merge 或 CI 完成)
spec-graph worktree merge auth-refactor --to main

# 标记结果
spec-graph merge-queue mark-merged auth-refactor
# 或
spec-graph merge-queue mark-failed auth-refactor --reason "conflict in X"
```

### Step 4: 处理 failed unit

```bash
# failed 后,agent 决策:
# 1. rebase 后重新入队
spec-graph worktree merge auth-refactor --to main  # 解决冲突后
spec-graph merge-queue enqueue auth-refactor --files "..."

# 2. 或放弃
spec-graph merge-queue remove auth-refactor
```

## Usage Scenarios

### Scenario 1: 标准多 change 顺序合并

```bash
# 完成 3 个 change,各自进入队列
spec-graph change complete auth-refactor      # → position 1
spec-graph change complete payment-fix        # → position 2
spec-graph change complete user-profile       # → position 3

spec-graph merge-queue list
# 🔀 Merge Queue (target: main)
#   1. auth-refactor [queued] files=5
#   2. payment-fix [queued] files=3
#   3. user-profile [queued] files=8

# 检查 overlap
spec-graph merge-queue overlaps
# ✓ No overlaps detected

# 顺序合并
spec-graph merge-queue dequeue
spec-graph worktree merge auth-refactor --to main
spec-graph merge-queue mark-merged auth-refactor

spec-graph merge-queue dequeue
spec-graph worktree merge payment-fix --to main
spec-graph merge-queue mark-merged payment-fix
# ...
```

### Scenario 2: 检测到 overlap

```bash
$ spec-graph merge-queue overlaps
⚠ 1 overlap(s) detected:

  auth-refactor overlaps with user-profile
    • src/shared/session.ts

# agent 决策:
#   - 让 auth-refactor 先合(它"拥有" session.ts)
#   - user-profile rebase 后再合
```

### Scenario 3: 合并失败(atomic abort)

```bash
spec-graph merge-queue dequeue
# → payment-fix (status=checking)

spec-graph worktree merge payment-fix --to main
# ✗ Merge failed
#   Conflicts (2):
#     • src/payment/charge.ts
#     • src/payment/refund.ts

spec-graph merge-queue mark-failed payment-fix --reason "conflict with auth-refactor"
# ✗ Marked payment-fix as failed: conflict with auth-refactor

# 队列继续推进下一个(atomic: payment-fix 不会阻塞队列)
spec-graph merge-queue dequeue
# → user-profile
```

### Scenario 4: JSON 输出供 CI

```bash
spec-graph merge-queue list --json | jq '.items[] | select(.status == "failed")'
# 列出所有 failed unit,触发通知
```

### Scenario 5: 自定义目标分支

```bash
# 合并到 release 分支而非 main
spec-graph merge-queue --target release-v2 enqueue hotfix-1 --files "..."
spec-graph merge-queue --target release-v2 list
```

### Scenario 6: 放弃某个 unit

```bash
# unit 不再需要合并
spec-graph merge-queue remove obsolete-experiment
# ✓ Removed obsolete-experiment from queue
```

### Scenario 7: 失败 — 队列为空时 dequeue

```bash
$ spec-graph merge-queue dequeue
Queue empty — nothing to dequeue.
# 这是正常情况,不是错误
```

### Scenario 8: 失败 — 未提供 unit id

```bash
$ spec-graph merge-queue enqueue
✗ Unit ID required. Usage: spec-graph merge-queue enqueue <id> --files <list>

$ spec-graph merge-queue mark-merged
✗ Unit ID required.
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Unit ID required` | 漏了 unit 参数 | 补上 `<unit-id>` |
| `Unknown subcommand` | 拼错 | 可用:enqueue, dequeue, list, overlaps, mark-merged, mark-failed, remove |
| Merge conflict | 文件冲突 | 解决冲突后重新 enqueue,或 `remove` 放弃 |
| Queue empty | 队列空时 dequeue | 正常,等待新 unit 入队 |

## 衔接关系

- **前置**: `spec-graph worktree create`(unit 必须存在)
- **典型触发**: `spec-graph change complete`(自动 enqueue,除非 `--no-queue`)
- **配合**: `spec-graph worktree merge`(实际执行 git 合并)
- **配合**: `spec-graph scope overlap`(scope 层面的冲突检测,基于 allowed/forbidden globs)
- **区别**: merge-queue 检测 file_list overlap,scope 检测 glob overlap — 两者互补
- **失败后**: `spec-graph rollback`(已合并的需要回滚)或 rebase 重试
- **归档**: 合并成功后 `spec-graph change archive`
