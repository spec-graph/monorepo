---
name: spec-graph-worktree
description: "Manage git worktree isolation units with enriched lifecycle states. Create per-track worktrees, transition through implementer → submitter → reviewer → merger handoff (self_verified → submitted → accepted/rejected → merged). Supports dry-run merge and purge. spec-graph is a neutral lifecycle manager — it does NOT review code or resolve conflicts. The agent drives state transitions based on actual review outcomes."
---

# spec-graph worktree

git worktree 隔离单元的生命周期管理。

## Architecture Principle

**spec-graph 只管理生命周期状态,不审查代码。**

- ❌ spec-graph 不会替你 review 代码
- ❌ spec-graph 不会替你解决 merge conflict
- ❌ spec-graph 不会替你决定"该不该 accept"
- ✅ spec-graph 创建/列出/删除 worktree
- ✅ spec-graph 执行 git merge(返回 conflict 列表)
- ✅ spec-graph 强制状态转换规则(active → self_verified → submitted → accepted/rejected → merged)

**Agent 的职责**:作为 implementer 完成工作后 self-verify,作为 reviewer 决定 accept/reject,作为 merger 执行合并。

## Lifecycle States(8 态)

```
active → self_verified → submitted → accepted → merged
                              │
                              └──→ rejected → self_verified (rework)
```

| Status | 含义 | 触发命令 |
|--------|------|---------|
| `active` | 刚创建,工作中 | `worktree create` |
| `self_verified` | 实现者完成 + 自测通过 | `worktree self-verify` |
| `submitted` | 提交审查 | `worktree submit` |
| `accepted` | 审查通过 | `worktree accept --reviewed-by <name>` |
| `rejected` | 审查驳回,返工 | `worktree reject --reason "..."` |
| `merged` | 已合并到目标分支 | `worktree merge` |

### 合法状态转换

| From | To | 命令 |
|------|-----|------|
| `active` | `self_verified` | self-verify |
| `rejected` | `self_verified` | self-verify(返工后重新自测) |
| `self_verified` | `submitted` | submit |
| `submitted` | `accepted` | accept |
| `submitted` | `rejected` | reject |
| `accepted` | `merged` | merge |

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `create <unit-id> --track <track>` | 创建 worktree |
| `list` | 列出所有 isolation units |
| `status <unit-id>` | 显示 unit 详情 |
| `self-verify <unit-id>` | 转入 self_verified |
| `submit <unit-id>` | 转入 submitted |
| `accept <unit-id> --reviewed-by <name>` | 转入 accepted |
| `reject <unit-id> --reason <text>` | 转入 rejected |
| `merge <unit-id> --to <branch>` | 合并到目标分支 |
| `remove <unit-id>` | 删除 worktree |

## Usage

```bash
# 创建 worktree(change apply 通常会自动触发)
spec-graph worktree create auth-refactor --track auth
# 可选: --branch <name> --base-branch <name>

# 列出所有 units
spec-graph worktree list

# 查看详情
spec-graph worktree status auth-refactor

# 生命周期推进
spec-graph worktree self-verify auth-refactor
spec-graph worktree submit auth-refactor
spec-graph worktree accept auth-refactor --reviewed-by "claude-opus"
spec-graph worktree reject auth-refactor --reason "missing edge case tests"

# 合并(支持 dry-run)
spec-graph worktree merge auth-refactor --to main
spec-graph worktree merge auth-refactor --to main --dry-run

# 删除(可选 purge 彻底清理)
spec-graph worktree remove auth-refactor
spec-graph worktree remove auth-refactor --purge
```

### Options

| Option | For | Description |
|--------|------|-------------|
| `--track <track-id>` | create | 关联的 track(必填) |
| `--branch <name>` | create | 自定义分支名(否则自动生成) |
| `--base-branch <name>` | create | 基分支(默认当前) |
| `--to <branch>` | merge | 目标分支,默认 `main` |
| `--dry-run` | merge | 模拟合并,不实际执行 |
| `--purge` | remove | 彻底清理(删除分支) |
| `--reviewed-by <name>` | accept / reject | 审查者标识 |
| `--reason <text>` | reject | 驳回原因 |
| `--json` | (any) | JSON 输出 |

## Execution Rules

### ✅ 何时使用

| 情况 | 命令 |
|------|------|
| change apply 后 | 自动 create(通常) |
| 实现完成 + 本地测试通过 | `self-verify` |
| 准备让 reviewer 看 | `submit` |
| review 通过 | `accept` |
| review 不通过 | `reject --reason` |
| 准备合并 | `merge --dry-run` 先试,再正式 merge |
| unit 结束 | `remove`(可选 `--purge`) |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 不需要隔离(小改动) | 直接在主分支改 |
| 想看 change 进度 | `spec-graph status` |
| 想入合并队列 | `spec-graph merge-queue enqueue` |
| 想回滚已合并 | `spec-graph rollback` |

## Agent Workflow(多方协作)

spec-graph worktree 支持 implementer / submitter / reviewer / merger 多角色协作:

### Step 1: 创建(implementer)

```bash
spec-graph change apply auth-refactor
# 内部自动: worktree create auth-refactor --track auth
# status: active
```

### Step 2: 实现 + 自测(implementer)

```bash
# 通过 dispatch 工作流完成实现
spec-graph dispatch --json
# ...直到所有 artifact 完成...

# 本地跑测试
# (agent 运行 commands.yaml 里的 test 命令)

# 自测通过 → self-verify
spec-graph worktree self-verify auth-refactor
# status: active → self_verified
```

### Step 3: 提交审查(submitter)

```bash
spec-graph worktree submit auth-refactor
# status: self_verified → submitted
```

### Step 4: 审查(reviewer)

```bash
# reviewer agent 检查代码质量
# 通过:
spec-graph worktree accept auth-refactor --reviewed-by "claude-opus"
# status: submitted → accepted

# 或不通过:
spec-graph worktree reject auth-refactor --reason "missing edge case in oauth callback"
# status: submitted → rejected
```

### Step 5: 返工(如果 rejected)

```bash
# 回到 active 状态(实际状态机:rejected → self_verified via self-verify)
spec-graph worktree self-verify auth-refactor
# 修复后重新 submit
spec-graph worktree submit auth-refactor
```

### Step 6: 合并(merger)

```bash
# 先 dry-run 检查
spec-graph worktree merge auth-refactor --to main --dry-run
# ✓ (dry-run) Merge auth-refactor → main succeeded

# 正式合并
spec-graph worktree merge auth-refactor --to main
# ✓ Merge auth-refactor → main succeeded
#   Commit: abc12345
# status: accepted → merged

# 清理
spec-graph worktree remove auth-refactor
```

## Usage Scenarios

### Scenario 1: 标准单 agent 全流程

```bash
spec-graph worktree create auth-refactor --track auth
# (实现代码)
spec-graph worktree self-verify auth-refactor
spec-graph worktree submit auth-refactor
spec-graph worktree accept auth-refactor --reviewed-by "self"
spec-graph worktree merge auth-refactor --to main
spec-graph worktree remove auth-refactor
```

### Scenario 2: 多 agent 协作(implementer + reviewer 分离)

```bash
# Implementer agent:
spec-graph worktree self-verify auth-refactor
spec-graph worktree submit auth-refactor

# Reviewer agent(可能是不同模型,如 Codex):
spec-graph worktree status auth-refactor
# 读 code,检查质量
spec-graph worktree accept auth-refactor --reviewed-by "codex"
# 或 reject --reason "..."

# Merger:
spec-graph worktree merge auth-refactor --to main
```

### Scenario 3: dry-run 检查冲突

```bash
$ spec-graph worktree merge auth-refactor --to main --dry-run
✓ (dry-run) Merge auth-refactor → main succeeded
  Commit: abc12345

$ spec-graph worktree merge payment-fix --to main --dry-run
✗ Merge failed
  Conflicts (2):
    • src/payment/charge.ts
    • src/shared/session.ts
# agent 决策: 先解决冲突(可能 rebase 或调整代码)
```

### Scenario 4: rejected 后返工

```bash
$ spec-graph worktree reject auth-refactor --reason "missing tests for edge case"
✓ Unit auth-refactor transitioned to 'rejected'
  Reason: missing tests for edge case
  Reviewed by: codex

# 返工:补测试
# (修改代码)

# 重新自测 + 提交
spec-graph worktree self-verify auth-refactor
spec-graph worktree submit auth-refactor
```

### Scenario 5: JSON 输出供脚本

```bash
spec-graph worktree list --json | jq '.[] | select(.status == "submitted")'
# 列出所有待 review 的 unit
```

### Scenario 6: 失败 — 非法状态转换

```bash
$ spec-graph worktree accept auth-refactor --reviewed-by "x"
✗ Invalid transition: active → accepted. Valid from: submitted
# 修复: 先 submit
spec-graph worktree self-verify auth-refactor
spec-graph worktree submit auth-refactor
spec-graph worktree accept auth-refactor --reviewed-by "x"
```

### Scenario 7: 失败 — 合并 conflict

```bash
$ spec-graph worktree merge auth-refactor --to main
✗ Merge failed
  Conflicts (2):
    • src/auth/login.ts
    • src/shared/session.ts

# agent 决策:
# 1. 手动解决 conflict 后重试
# 2. 或 rebase 到最新 main 后重试
# 3. 或入 merge-queue 等其他 unit 先合
```

### Scenario 8: 失败 — 缺参数

```bash
$ spec-graph worktree create auth-refactor
✗ Track required. Usage: spec-graph worktree create <id> --track <track>

$ spec-graph worktree merge
✗ Unit ID required. Usage: spec-graph worktree merge <id> --to <branch>
```

### Scenario 9: 失败 — unit 不存在

```bash
$ spec-graph worktree status nonexistent
✗ Unit not found: nonexistent
# 修复: 先 list 看正确的 id
spec-graph worktree list
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Unit ID required` | 漏了 unit 参数 | 补上 `<unit-id>` |
| `Track required` | create 漏了 --track | 补 `--track <track-id>` |
| `Invalid transition: X → Y` | 状态机违规 | 按 lifecycle 表先转到正确状态 |
| `Unit not found` | id 错误 | `worktree list` 查正确 id |
| `Merge failed` + conflicts | 文件冲突 | 解决冲突 / rebase / 入 merge-queue |
| `Unknown subcommand` | 拼错 | 可用:create, list, remove, merge, status, self-verify, submit, accept, reject |

## 衔接关系

- **前置**: `spec-graph init` + `spec-graph compose`(需要 graph 里的 track 定义)
- **典型触发**: `spec-graph change apply`(内部自动 `worktree create`)
- **配合**: `spec-graph scope lock`(每个 worktree 建议声明 scope)
- **合并前**: `spec-graph merge-queue enqueue`(入队后由 queue 调度)
- **合并失败**: 手动解决或 `spec-graph rollback`(已合并的回滚)
- **完成后**: `spec-graph change complete` → `spec-graph change archive`
- **与 change 的关系**: 一个 change 通常对应一个 worktree unit(unit_id 常等于 change_id)
