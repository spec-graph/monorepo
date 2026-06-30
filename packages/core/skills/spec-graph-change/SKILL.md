---
name: spec-graph-change
description: "Manage change units (feature, bugfix, refactor, etc.). Full lifecycle: create → apply → complete → archive. Each change auto-generates a plan MD for audit and recovery. spec-graph is a neutral tracker — does NOT analyze requirements, only records descriptors. AI agent is responsible for filling plan MD content and driving the lifecycle."
---

# spec-graph change

管理 change 单元 — 驱动工作流的原子工作项。

## Architecture Principle

**spec-graph 是变更追踪器 — 不分析需求。**

- ❌ spec-graph 不会替你判断"这算不算新需求"
- ❌ spec-graph 不会替你写 plan MD 的内容(background / scope / AC)
- ❌ spec-graph 不会替你决定 change type / priority
- ✅ spec-graph 只创建空壳 plan MD + JSON descriptor,等 agent 填内容
- ✅ spec-graph 强制生命周期:proposed → in_progress → completed → archived
- ✅ spec-graph 自动记录 audit log + 归档 snapshot

**Agent 的职责**:判断是否需要创建 change,填 plan MD 内容,驱动生命周期。

参考 `CLAUDE.md` 的工作协议:
> 每一条实质性用户输入,先分流判断再行动:
> 1. 新需求 / 变更 → spec-graph change create
> 2. 澄清 / 推进既有工作 → 直接进行

## Change 生命周期

```
proposed → in_progress → completed → archived
   │           │             │
   │           │             └─→ discarded → archived
   │           │
   │           └─→ suspended (临时挂起)
   │
   └─→ discarded (直接废弃)
```

### 状态详解

| Status | 含义 | 触发命令 |
|--------|------|---------|
| `proposed` | 已创建,未开始执行 | `change create` |
| `in_progress` | 已 apply,正在执行 | `change apply` |
| `suspended` | 临时挂起(可恢复) | 手动编辑 JSON |
| `completed` | 工作完成,等待归档 | `change complete` |
| `discarded` | 废弃(可归档) | `change discard --reason "..."` |
| `escalated` | 升级给用户决策 | 手动编辑 JSON |

### 状态转换规则

- `proposed` → `in_progress` (via apply)
- `in_progress` → `completed` (via complete,需要 gate 通过或 --force)
- `in_progress` → `discarded` (via discard)
- `proposed` → `discarded` (via discard)
- `completed` / `discarded` → `archived` (via archive,不可逆)

## What this does

Changes 是 spec-graph 的迭代单元(灵感来自 OpenSpec)。每个 change:

- 有 type (feature / bugfix / refactor / spike / performance / migration / deprecation)
- 自动生成 **plan MD** (`<title>-<timestamp>-plan.md`) 用于审计和恢复
- 通过 JSON descriptor (`<title>-<timestamp>.json`) 跟踪状态,引用 plan MD 路径
- 定义 scope (tracks / files / contracts 受影响)
- 跟踪 risk level 和 priority
- 记录执行状态和 audit trail
- 归档时 plan MD 一起移到 archived/

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | 列出所有活跃 changes |
| `create` | 创建新 change(生成 plan MD + JSON) |
| `show <id>` | 显示 change 详情 |
| `apply <id>` | 开始执行(patch profile + compose + prime + worktree) |
| `complete <id>` | 标记完成(soft-gate 检查 + 自动入 merge queue) |
| `discard <id>` | 废弃(记录原因) |
| `sync <id>` | 计算 profile_patch 的 sync-impact |
| `archive <id>` | 归档(snapshot + 移到 archived/) |

## Usage

```bash
# 列出所有 changes
spec-graph change list

# 创建新 change
spec-graph change create \
  --title "Add user authentication" \
  --type feature \
  --priority high \
  --description "OAuth2 login with Google/GitHub"

# 显示详情
spec-graph change show <change-id>

# 开始执行(自动 compose + prime + worktree)
spec-graph change apply <change-id>

# 完成(soft-gate 检查)
spec-graph change complete <change-id>

# 强制完成(忽略 gate 失败)
spec-graph change complete <change-id> --force

# 废弃
spec-graph change discard <change-id> --reason "Requirements changed"

# 归档
spec-graph change archive <change-id>
```

### Options

| Option | For | Description |
|--------|------|-------------|
| `--title <title>` | create | Change 标题(slugified 用于文件名,保留中文) |
| `--type <type>` | create | feature / bugfix / refactor / spike / performance / migration / deprecation |
| `--priority <priority>` | create | low / medium (default) / high / critical |
| `--description <desc>` | create | Change 描述 |
| `--reason <text>` | discard | 废弃原因 |
| `--force` | complete | 忽略 gate 失败,强制完成 |
| `--no-worktree` | apply | 不创建 worktree |
| `--no-queue` | complete | 不入 merge queue |
| `--json` | (any) | JSON 输出 |

## Plan MD 填写规范

每次 `change create` 会生成空壳 plan MD,位于 `.spec-graph/changes/<title-slug>-<timestamp>-plan.md`。

**Agent 必须填充以下章节**:

```markdown
# <Change Title>

> Change ID: <id>
> Type: feature | Priority: high
> Created: 2026-06-30T...

## Background

(问题陈述 / 业务背景 / 为什么要做这个 change)

## Scope

### IN
- (要做的事情 1)
- (要做的事情 2)

### OUT
- (明确不做的事情 1)
- (明确不做的事情 2)

## Acceptance Criteria

- [ ] (可验证的验收标准 1)
- [ ] (可验证的验收标准 2)
- [ ] (可验证的验收标准 3)

## Affected Artifacts
- requirement/prd (修改)
- design/architecture (新增)

## Affected Files
- src/auth/login.ts
- src/auth/oauth.ts

## Decisions
- (关键决策 1: 选 OAuth2 而非自建)
- (关键决策 2: ...)

## Risks
- (风险 1): 缓解措施
- (风险 2): 缓解措施

## Open Questions
? (待确认问题 1)
? (待确认问题 2)

## Progress

### Completed
- ✓ (已完成项 1)
- ✓ (已完成项 2)

### Remaining
- ○ (待完成项 1)
- ○ (待完成项 2)

### Blockers
- ! (阻塞项 1)
```

### Plan MD 的重要性

- **审计**: 归档时 snapshot,留作历史记录
- **恢复**: 中断后读 plan MD 恢复完整上下文(比读 JSON 强)
- **协作**: 其他 agent / 用户读 plan MD 快速理解 change
- **drift 检测**: scope / AC 变化时记录到 drift_log

## 何时创建 change — 判断标准

参考 `CLAUDE.md`:
> 每一条实质性用户输入,先分流判断再行动

### ✅ 应该创建 change 的情况

| 情况 | change type |
|------|-------------|
| 用户说"我要加一个 X 功能" | feature |
| 用户说"修复 bug Y" | bugfix |
| 用户说"重构 Z 模块" | refactor |
| 用户说"探索技术 W 是否可行" | spike |
| 用户说"优化性能,数据库太慢" | performance |
| 用户说"从 v1 迁移到 v2" | migration |
| 用户说"废弃旧 API" | deprecation |
| 实质性新需求 / 范围变化 | (按类型) |

### ❌ 不应该创建 change 的情况

| 情况 | 替代做法 |
|------|---------|
| 澄清既有 change 的细节 | 直接进行 |
| 推进当前 in_progress 的工作 | `spec-graph dispatch` |
| 修复 typo / 小调整 | 直接编辑 |
| 查询状态 / 进度 | `spec-graph status` |
| 讨论方案(未决定做) | `spec-graph meeting init` |

### 判断流程

```
用户输入
    ↓
是实质性新需求 / 变更?
    ├── 是 → spec-graph change create
    │       ↓
    │       填 plan MD
    │       ↓
    │       spec-graph change apply
    │       ↓
    │       spec-graph dispatch --json (开始工作流)
    │
    └── 否(澄清 / 推进既有工作)
            ↓
            直接进行(可能用 dispatch / status / next)
```

## Change types 与 intent packs

| Type | Pack | Pipeline |
|------|------|----------|
| `feature` | feature.pack | propose → specify → design → contract → plan → implement → review → test → accept |
| `bugfix` | bugfix.pack | diagnose → implement → review → test → accept |
| `refactor` | refactor.pack | characterization → refactor → verify → test → accept |
| `spike` | spike.pack | timebox → explore → conclude/discard |
| `performance` | performance.pack | baseline → hotspot → optimize → verify → accept |
| `migration` | migration.pack | inventory → batch → dual-run → cutover → accept |
| `deprecation` | deprecation.pack | mark → wait → zero-consumers → remove → accept |

## 与 dispatch / workflow 的衔接

```
用户请求 → 判断是否新需求
    ↓
是 → spec-graph change create --title "..." --type feature --description "..."
    ↓ (生成 JSON + 空 plan MD)
agent 填写 plan MD 内容(background / scope / AC / ...)
    ↓
spec-graph change apply <id>
    ↓ (内部: profile patch + compose + prime + worktree)
    ↓ (change.status: proposed → in_progress)
spec-graph dispatch --json
    ↓ (读 manifest,执行 actions)
sub-agent 生产文档 → 写入 suggested_doc_path
    ↓
spec-graph artifact complete <artifact-id>
    ↓
spec-graph dispatch --json (循环直到 done)
    ↓
spec-graph change complete <id>
    ↓ (soft-gate 检查,自动入 merge queue)
    ↓ (change.status: in_progress → completed)
spec-graph change archive <id>
    ↓ (snapshot profile/graph/state + plan MD,移到 archived/)
    ↓ (更新 CHANGELOG.md)
spec-graph retro <id>  (可选,捕获经验教训)
```

### 关键点

- **change apply 内部自动 prime**: 不需要手动跑 prime
- **change apply 可能改 profile**: 如果 change 声明了 `profile_patch`,apply 时会写入 profile.yaml
- **change complete 是 soft-gate**: gate 失败会 warn 但可 `--force` 跳过
- **change archive 不可逆**: 归档后无法恢复,但 snapshot 保留所有历史

## Usage Scenarios

### Scenario 1: 标准 feature 全流程

```bash
# 用户:"我要加用户认证功能"
spec-graph change create \
  --title "Add user authentication" \
  --type feature \
  --priority high \
  --description "OAuth2 login with Google/GitHub"

# 输出:
# ✓ Change created: add-user-authentication-<timestamp>
#   📋 JSON: add-user-authentication-<timestamp>.json
#   📋 Plan: add-user-authentication-<timestamp>-plan.md

# agent 填写 plan MD(background / scope / AC)

spec-graph change apply add-user-authentication-<timestamp>
# 内部: compose + prime + worktree
# change.status: proposed → in_progress

spec-graph dispatch --json
# 开始工作流循环

# ... 经过多个 dispatch 循环 ...

spec-graph change complete add-user-authentication-<timestamp>
spec-graph change archive add-user-authentication-<timestamp>
```

### Scenario 2: bugfix 短流程

```bash
spec-graph change create \
  --title "Fix login redirect loop" \
  --type bugfix \
  --priority critical \
  --description "Users get redirected to login repeatedly"

# agent 填 plan MD(简短,bugfix 流程更短)
spec-graph change apply <id>
spec-graph dispatch --json
# ... diagnose → implement → review → test → accept ...
spec-graph change complete <id>
spec-graph change archive <id>
```

### Scenario 3: spike(探索性,可能 discard)

```bash
spec-graph change create \
  --title "Evaluate WebAssembly for image processing" \
  --type spike \
  --priority medium \
  --description "Timebox 2 days, explore WASM feasibility"

spec-graph change apply <id>
spec-graph dispatch --json
# ... timebox → explore ...

# 如果结论是不可行:
spec-graph change discard <id> --reason "WASM bundle size too large for our use case"
spec-graph change archive <id>

# 如果结论是可行:
spec-graph change complete <id>
spec-graph change archive <id>
# 然后创建 feature change 推进实现
```

### Scenario 4: 中断后恢复

```bash
# 读 plan MD 恢复上下文
cat .spec-graph/changes/<id>-plan.md

# 检查状态
spec-graph change show <id>
spec-graph status

# 继续 dispatch
spec-graph dispatch --json
```

### Scenario 5: scope 变化(profile_patch)

```bash
# 创建时声明 profile_patch
spec-graph change create \
  --title "Add PCI-DSS compliance" \
  --type feature \
  --description "Payment module needs compliance"

# 手动编辑 JSON 加 profile_patch:
# "profile_patch": { "criticality": "compliance" }

# sync 查看 impact(不实际应用)
spec-graph change sync <id>
# 输出: +artifacts, +checks, +gates 的 diff

# apply 时实际应用 patch
spec-graph change apply <id>
# profile.yaml 更新,graph 重新 compose
```

### Scenario 6: 失败 — 多个 in_progress change

```bash
$ spec-graph dispatch --json
# Warning: multiple in_progress changes,ambiguous
# 修复: 先 complete/archive 其中一些,保持单一 in_progress
spec-graph change complete <id1>
spec-graph change archive <id1>
spec-graph dispatch --json   # 现在只剩一个 in_progress
```

### Scenario 7: 失败 — 未完成就 complete

```bash
$ spec-graph change complete <id>
⚠ 2 blocking gate(s) still failing:
  • specify→design
  • design→plan
Complete anyway? Re-run with --force to ignore.
# 修复: 先 dispatch 修复 gate 失败,或 --force 强制完成(不推荐)
```

### Scenario 8: 失败 — 状态错误转换

```bash
$ spec-graph change complete <id>
✗ Change status is 'proposed'. Only in_progress changes can be completed.
# 修复: 先 apply
spec-graph change apply <id>
spec-graph change complete <id>
```

### Scenario 9: 失败 — 未 init

```bash
$ spec-graph change create --title "..." --type feature
✗ Project not initialized. Run `spec-graph init` first.
# 修复: 先 init
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Project not initialized` | 未 init | `spec-graph init` |
| `Change not found: <id>` | ID 错误或已归档 | `spec-graph change list` 查正确 ID |
| `Change already completed/discarded` | 试图重复操作 | 创建新 change |
| `Only in_progress changes can be completed` | 状态错误 | 先 `change apply` |
| `Only completed/discarded changes can be archived` | 状态错误 | 先 complete / discard |
| Blocking gates failing | gate 未通过 | 修复 gate 或 `--force` |
| Multiple in_progress changes | dispatch 歧义 | complete/archive 多余的 |

## 衔接关系

- **前置**: `spec-graph init`(必须有 .spec-graph/)
- **创建后**: agent 填 plan MD → `spec-graph change apply`
- **apply 内部**: 自动跑 `compose` + `prime --bootstrap` + 创建 worktree
- **apply 后**: `spec-graph dispatch --json`(开始工作流循环)
- **工作流循环中**: dispatch + artifact complete + check + transition
- **完成后**: `spec-graph change complete` → `spec-graph change archive`
- **归档后**: `spec-graph retro <id>`(捕获经验教训,可选)
- **审计追踪**: 每次 dispatch 自动写入 change 的 `audit_log`
- **协作**: `spec-graph meeting init`(讨论方案,可能产生新 change)
