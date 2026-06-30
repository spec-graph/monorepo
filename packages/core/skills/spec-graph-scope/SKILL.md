---
name: spec-graph-scope
description: "Manage scope locks for parallel isolation units. Declare allowed/protected/forbidden path globs per unit, validate file changes against lock, detect overlaps between units. Prevents scope creep and parallel-worktree collisions. spec-graph is a neutral enforcer — it does NOT decide what paths belong to a unit. The agent declares the scope; spec-graph validates and reports violations."
---

# spec-graph scope

变更作用域锁管理 — 防止 scope 蔓延与并行 worktree 冲突。

## Architecture Principle

**spec-graph 只验证 scope,不定义 scope。**

- ❌ spec-graph 不会替你决定"哪些文件属于这个 unit"
- ❌ spec-graph 不会替你修改违规改动
- ✅ spec-graph 接受 agent 声明的 allowed / protected / forbidden globs
- ✅ spec-graph 验证实际改动文件是否合规(strict 模式违规则 exit 1)
- ✅ spec-graph 检测多个并行 unit 之间的 scope overlap

**Agent 的职责**:为每个 isolation unit 声明合理的 scope,改动前用 `check` 验证。

## What this does

为并行 worktree 隔离单元管理 scope 锁。每个 unit 的 lock 包含三类路径:

| 路径类型 | 含义 | 触发违规 |
|---------|------|---------|
| `allowed_paths` | 允许修改的 globs | (不指定 = 任何路径都允许) |
| `protected_paths` | 受保护(可读不可改)的 globs | 修改 → warning violation |
| `forbidden_paths` | 完全禁止触碰的 globs | 修改 → forbidden-touched violation |

外加 **enforcement_mode**:

- `strict`(默认) — 违规时 exit code 1,阻止合并
- `advisory` — 仅报告,不阻止

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `lock <unit-id>` | 为 unit 创建/覆盖 scope lock |
| `check --unit <id> --files <list>` | 验证文件列表是否合规 |
| `show <unit-id>` | 显示 unit 的 scope lock |
| `list` | 列出所有 active scope locks |
| `unlock <unit-id>` | 删除 unit 的 scope lock |
| `overlap` | 检测所有 unit 之间的 scope overlap |

## Usage

```bash
# 创建 scope lock
spec-graph scope lock auth-refactor \
  --allowed "src/auth/**" \
  --protected "src/db/schema.ts" \
  --forbidden "src/payment/**,secrets/**"

# 验证即将改动的文件是否合规
spec-graph scope check --unit auth-refactor --files "src/auth/login.ts,src/auth/oauth.ts"
# → PASS

spec-graph scope check --unit auth-refactor --files "src/payment/charge.ts"
# → FAIL: forbidden-touched

# 查看具体 lock
spec-graph scope show auth-refactor

# 列出所有 locks
spec-graph scope list

# 检测并行 unit 之间的 scope 冲突
spec-graph scope overlap

# 删除 lock
spec-graph scope unlock auth-refactor
```

### Options

| Option | For | Description |
|--------|------|-------------|
| `--allowed <globs>` | lock | 允许修改的路径 globs(逗号分隔) |
| `--protected <globs>` | lock | 受保护路径(只读) |
| `--forbidden <globs>` | lock | 完全禁止路径 |
| `--mode <mode>` | lock | `strict`(默认) / `advisory` |
| `--unit <id>` | check | 要验证的 unit |
| `--files <list>` | check | 要验证的文件列表(逗号分隔) |
| `--json` | (any) | JSON 输出 |

## Lock 文件结构

```yaml
# .spec-graph/isolation/scope-auth-refactor.yaml
unit_id: auth-refactor
allowed_paths:
  - "src/auth/**"
protected_paths:
  - "src/db/schema.ts"
forbidden_paths:
  - "src/payment/**"
  - "secrets/**"
enforcement_mode: strict
locked_at: 2026-06-30T...
locked_by: cli
```

## Violation 类型

| Kind | Icon | 含义 |
|------|------|------|
| `forbidden-touched` | ✗ | 触碰了 forbidden_paths |
| `protected-modified` | ⚠ | 修改了 protected_paths |
| `out-of-scope` | ○ | 改了 allowed 之外的文件(仅当 allowed 非空时触发) |

## Execution Rules

### ✅ 何时使用

| 情况 | 命令 |
|------|------|
| 创建并行 worktree 前 | `scope lock` 先声明边界 |
| 即将改动文件前 | `scope check` 验证 |
| 多个 unit 同时进行 | `scope overlap` 检测冲突 |
| code review 时 | `scope show` 对照实际改动 |
| 合并前 | `scope check` 最终验证 |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 单一 unit,无并行 | 不需要 scope lock |
| 想检测文件依赖影响 | `spec-graph impact` |
| 想检测 artifact 重复 | `spec-graph check` |
| 想看 worktree 状态 | `spec-graph worktree list` |

## Agent Workflow

### Step 1: 创建 isolation unit 时声明 scope

```bash
# 创建 worktree(由 change apply 触发,或手动)
spec-graph worktree create auth-refactor --track auth

# 立即声明 scope(在改动任何文件前)
spec-graph scope lock auth-refactor \
  --allowed "src/auth/**,tests/auth/**" \
  --protected "src/db/schema.ts" \
  --forbidden "src/payment/**,secrets/**"
```

### Step 2: 每次改动前 check

```bash
# agent 准备改这几个文件
spec-graph scope check --unit auth-refactor \
  --files "src/auth/login.ts,src/auth/oauth.ts,src/db/schema.ts"
# 输出:
#   🔒 Scope Check
#     Unit: auth-refactor
#     Mode: strict
#     Files: 3
#     Result: FAIL
#   ⚠ src/db/schema.ts: protected-modified
```

### Step 3: 根据 check 结果调整

- PASS → 继续改文件
- FAIL → 重新评估,要么改 allowed 范围,要么放弃触碰 protected/forbidden

### Step 4: 完成后 unlock(可选)

```bash
# unit 合并后清理
spec-graph scope unlock auth-refactor
```

## Usage Scenarios

### Scenario 1: 标准并行 worktree 隔离

```bash
# 同时进行两个 change,确保不冲突
spec-graph worktree create auth-refactor --track auth
spec-graph scope lock auth-refactor \
  --allowed "src/auth/**" \
  --forbidden "src/payment/**"

spec-graph worktree create payment-fix --track payment
spec-graph scope lock payment-fix \
  --allowed "src/payment/**" \
  --forbidden "src/auth/**"

# 验证两个 unit 互不重叠
spec-graph scope overlap
# ✓ No scope overlaps detected. 2 active lock(s), all disjoint
```

### Scenario 2: 检测到 overlap

```bash
$ spec-graph scope overlap
⚠ 2 scope overlap(s) detected:

  ⚠ [glob-overlap] auth-refactor ↔ user-api
    path: src/auth/**
  ✗ [exact] payment-fix ↔ billing-refactor
    path: src/payment/charge.ts

# agent 决策:
# - glob-overlap → 协调两个 unit 谁先做
# - exact overlap → 必须分时,不能并行
```

### Scenario 3: scope 违规阻止合并

```bash
$ spec-graph scope check --unit auth-refactor \
    --files "src/payment/charge.ts"
🔒 Scope Check
  Result: FAIL
  ✗ src/payment/charge.ts: forbidden-touched
$ echo $?
1  # strict 模式,exit 1,CI 会失败
```

### Scenario 4: advisory 模式(仅警告)

```bash
spec-graph scope lock spike-experiment \
  --allowed "experiments/**" \
  --mode advisory

spec-graph scope check --unit spike-experiment --files "src/core.ts"
# Result: FAIL
# ○ src/core.ts: out-of-scope
# (但 exit 0,只是警告)
```

### Scenario 5: protected 路径(只读)

```bash
# db schema 不能改,但能读
spec-graph scope lock db-migration \
  --allowed "src/migrations/**" \
  --protected "src/db/schema.ts"

spec-graph scope check --unit db-migration --files "src/db/schema.ts"
# ⚠ protected-modified (warning, not failure in some modes)
```

### Scenario 6: JSON 输出供 CI 集成

```bash
result=$(spec-graph scope check --unit auth-refactor \
  --files "$(git diff --name-only HEAD~1)" \
  --json)
echo "$result" | jq '.passed'
# true / false
```

### Scenario 7: 失败 — 未 lock 就 check

```bash
$ spec-graph scope check --unit nonexistent --files "src/x.ts"
✗ No scope lock found for nonexistent. Run `spec-graph scope lock` first.

# 修复:先 lock
spec-graph scope lock nonexistent --allowed "src/**"
spec-graph scope check --unit nonexistent --files "src/x.ts"
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `No scope lock found for <id>` | 未 lock 就 check | 先 `scope lock <id>` |
| `Unit ID required` | 漏了 unit 参数 | 补上 `<unit-id>` |
| `Files required` | check 漏了 --files | 补 `--files <comma-list>` |
| `Unknown subcommand` | 拼错 | 可用:lock, check, show, list, unlock, overlap |
| Exit code 1(strict 违规) | 触碰了 forbidden / out-of-scope | 改回 allowed 范围,或换 advisory 模式 |

## 衔接关系

- **前置**: `spec-graph init`
- **配合**: `spec-graph worktree create`(每个 worktree 建议配 scope lock)
- **配合**: `spec-graph merge-queue overlaps`(merge queue 也有 overlap 检测,基于 file_list)
- **CI 集成**: PR 检查中跑 `scope check` 防止 scope 蔓延
- **与 impact 的区别**: `impact` 分析"改了 X 会影响谁"(ripple),`scope` 声明"我承诺只改 X"(boundary)
- **生命周期**: lock 在 worktree 创建时,unlock 在合并后
