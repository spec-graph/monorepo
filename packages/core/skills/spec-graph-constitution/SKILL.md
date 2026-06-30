---
name: spec-graph-constitution
description: "Manage project quality constitution (versioned governance rules): thresholds, articles, trace rules, semver policy, command whitelist, waivers. Subcommands: init / show / validate / diff-packs / bump / diff. spec-graph is a neutral rule store — does NOT decide what thresholds are 'right', only persists and validates them. Constitution overrides pack-declared thresholds at runtime. Use to set quality bars, detect config drift, and version governance changes."
---

# spec-graph constitution

管理项目的质量治理规则(版本化的"宪法")。

## Architecture Principle

**spec-graph 不决定阈值是否合理 — 只持久化和校验声明。**

- ❌ spec-graph 不会替你判断"80% 覆盖率够不够"
- ❌ spec-graph 不会替你写 articles
- ❌ spec-graph 不会替你决定何时 bump major
- ❌ spec-graph 不会替你审批 waiver
- ✅ spec-graph 在 `constitution init` 时生成合理默认值(可覆盖)
- ✅ spec-graph 在 runtime 中, constitution 的阈值**覆盖** pack 声明的阈值
- ✅ spec-graph 提供 6 个 subcommand 管理全生命周期:init / show / validate / diff-packs / bump / diff
- ✅ spec-graph 用 semver 版本化,每次 bump 自动 snapshot 便于 diff

**Agent 的职责**:初始化 constitution → 根据项目需求调整阈值/articles → bump 版本 → 用 diff 追踪变化 → 用 validate 检查内部一致性。

## What this does

Constitution 是 spec-graph 的**治理源真相(source of truth)**。它定义:

### 1. Quality Thresholds(质量阈值)

| Threshold | 默认值 | 含义 |
|-----------|--------|------|
| `test_coverage` | 0.8 (80%) | 测试覆盖率下限 |
| `cyclomatic_complexity` | 15 | 圈复杂度上限 |
| `ambiguity_score` | 0 | 模糊形容词允许数(0 = 不允许) |
| `placeholder_count` | 0 | placeholder 允许数 |
| `non_measurable_count` | 5 | 不可测量 AC 允许数 |
| `lint_warnings` | 0 | lint warning 允许数 |

> **关键**:这些阈值在 runtime **覆盖** pack.yaml 中声明的同名阈值。例如 pack 声明 `cyclomatic=20`,constitution 声明 `cyclomatic=15`,实际执行用 15。

### 2. Required Linters

默认:`["lint", "typecheck"]`。必须通过的 check ID。

### 3. Constitutional Articles(治理条款)

定性不变量,3 种 rule type:

| Rule Type | 含义 | 示例 |
|-----------|------|------|
| `required_section` | 某 artifact kind 必须有指定 section | `plan/story` 必须有 "Acceptance Criteria" section |
| `min_length` | 某 artifact kind 最少 N 字符 | `requirement/prd` ≥ 500 字符 |
| `co_completed` | 如果 from_kind 完成,to_kind 必须完成 | `plan/story` 完成 → `verification/test-report` 必须完成 |

默认 articles:
- `story-has-ac`:每个 story 必须有 AC
- `c4-has-context`:C4 图必须有 Context section

### 4. Traceability Rules(追溯规则)

默认 3 条 trace 规则(每条带 cardinality):

| Name | From → To | Via | Cardinality |
|------|-----------|-----|-------------|
| `story_to_prd` | `plan/story` → `requirement/prd` | `derives` | `every` |
| `ac_to_test` | `plan/story` → `verification/test-report` | `verifies` | `every` |
| `design_to_req` | `design/c4` → `requirement/prd` | `derives` | `every` |

外加:
- `require_ac_test_binding: true` — AC 必须绑定到 test
- `require_commit_story_ref: true` — commit message 必须引用 story ID

### 5. Semver Policy(版本策略)

| Bump Type | 触发条件(默认) |
|-----------|----------------|
| `major` | contract-removed, contract-breaking-change, public-api-removed |
| `minor` | contract-added, feature-added |
| `patch` | bugfix, internal-refactor |
| (grace) | `deprecation_grace_releases: 2` — 废弃后有 2 个版本的宽限期 |

### 6. Security(命令安全)

| 字段 | 默认值 |
|------|--------|
| `command_whitelist` | `npm test`, `npm run`, `npx`, `node`, `jest`, `vitest`, `tsc`, `eslint` |
| `forbidden_patterns` | `&&`, `\|\|`, `;`, `\|`, `$(`, `` ` ``, `>`, `<`, `curl`, `wget`, `sudo`, `su `, `eval`, `rm -rf` |

> Builtin sentinel `<...>` 命令始终安全(分发到 TS 函数,不走 shell),不需要在 whitelist。

### 7. Waivers(豁免)

临时豁免某条规则,带过期时间和审批人:

```yaml
waivers:
  - rule_id: story-has-ac
    reason: "Prototype phase, AC deferred"
    expires_at: "2026-12-31"
    approved_by: ["architect@example.com"]
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `init` | 初始化 constitution(默认值,可 --force 覆盖已存在的) |
| `show` | 显示当前 constitution(支持 --json) |
| `validate` | 校验 schema 一致性 + 检测 pack 阈值 drift |
| `diff-packs` | 对比 constitution 与 pack 声明的阈值 |
| `bump` | bump semver 版本,自动 snapshot 当前状态 |
| `diff` | 显示自上次 snapshot 以来的变化 |

## Usage

```bash
# 初始化
spec-graph constitution init
spec-graph constitution init --force  # 覆盖已存在的

# 查看当前
spec-graph constitution show
spec-graph constitution show --json

# 校验
spec-graph constitution validate

# 对比 pack
spec-graph constitution diff-packs

# bump 版本
spec-graph constitution bump --type patch    # 默认
spec-graph constitution bump --type minor
spec-graph constitution bump --type major

# 看 diff(自上次 bump snapshot)
spec-graph constitution diff
spec-graph constitution diff --json
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `<subcommand>` | (all) | init / show / validate / diff-packs / bump / diff(默认 show) |
| `--type <type>` | bump | `patch`(默认) / `minor` / `major` |
| `--force` | init | 覆盖已存在的 constitution.yaml |
| `--json` | show/validate/diff-packs/diff | JSON 输出 |

## 文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| Constitution | `.spec-graph/constitution.yaml` | 主文件 |
| Snapshot | `.spec-graph/.constitution-snapshot.json` | bump 时自动生成,diff 用 |

## 何时使用 — 判断标准

### ✅ 应该使用 constitution

| 场景 | Subcommand |
|------|-----------|
| 项目刚 init 完成 | `init`(建立基线) |
| 想看当前质量阈值 | `show` |
| 改完 constitution.yaml 后 | `validate`(确认 schema 正确) |
| 怀疑 pack 阈值和 constitution 冲突 | `diff-packs` |
| 调整了阈值/条款 | `bump --type minor` + `diff` |
| 新版本发布前 | `validate` + `diff-packs` 确认无 drift |
| CI 中作为治理门禁 | `validate`(exit 1 = 阻止) |
| 审计需要看历史变更 | `bump` + `diff` 链 |

### ❌ 不应该使用 constitution

| 场景 | 替代做法 |
|------|---------|
| 改单个阈值 | 直接编辑 `.spec-graph/constitution.yaml` |
| 跑测试 | `spec-graph check` |
| 评估 gate | `spec-graph gate` |
| 跨 artifact 一致性 | `spec-graph analyze` |
| 项目诊断 | `spec-graph doctor`(会检查 constitution 是否存在) |

## Agent Workflow

```
1. spec-graph init 完成
   ↓
2. spec-graph constitution init
   ↓ (生成默认 constitution.yaml)
3. agent 根据项目需求调整:
   ├── 改阈值(test_coverage 从 0.8 → 0.9)
   ├── 加 articles(如 "api-must-have-openapi")
   ├── 加 trace rules
   └── 改 semver policy
   ↓
4. spec-graph constitution validate
   ↓ (确认 schema 正确,无 pack drift)
5. spec-graph constitution diff-packs
   ↓ (确认无意外冲突)
6. spec-graph constitution bump --type minor
   ↓ (版本化记录,snapshot 保存)
   ↓
[ 后续工作流中,check/gate 会读 constitution 的阈值 ]
   ↓
[ 需求变化,要调整阈值 ]
   ↓
7. 编辑 constitution.yaml(如降阈值)
   ↓
8. spec-graph constitution validate
   ↓
9. spec-graph constitution diff
   ↓ (看自上次 snapshot 的变化)
10. spec-graph constitution bump --type patch
    ↓ (记录变更)
```

## 与 Agent 的协作关系

- **主 agent**:决定何时 init / bump,根据项目反馈调整阈值
- **sub-agent**:可能被分派"调研合理的阈值"(如查行业标准)
- **coordinator**:dispatch 时可注入 constitution 版本号到 manifest(让 sub-agent 知道当前治理版本)
- **engine**:`check` / `gate` 在 runtime 读 constitution 阈值(覆盖 pack)
- **CI**:`validate` 作为治理门禁

## Constitution 在 runtime 的影响

| 子系统 | 读 constitution 的什么 |
|--------|----------------------|
| `check` (clarify-scan) | `thresholds.ambiguity_score`, `thresholds.placeholder_count`, `thresholds.non_measurable_count` |
| `check` (complexity-budget) | `thresholds.cyclomatic_complexity` |
| `check` (coverage) | `thresholds.test_coverage` |
| `gate` | `traceability.required_traces`(用于 trace query 评估) |
| `artifact complete` | `quality.articles`(检查 required_section / co_completed) |
| commit hook | `traceability.require_commit_story_ref` |
| 命令执行 | `security.command_whitelist`, `security.forbidden_patterns` |
| 版本发布 | `semver.major_bump_on` 等(决定 bump 类型) |

## Usage Scenarios

### Scenario 1: 标准初始化(成功)

```bash
$ spec-graph constitution init
✓ Constitution initialized at .spec-graph/constitution.yaml
  Project: my-app
  Version: 0.1.0
  Effective: 2026-06-30

  Edit .spec-graph/constitution.yaml to customize thresholds, traces, and semver policy.
  Run `spec-graph constitution validate` to check internal consistency.
  Run `spec-graph constitution diff-packs` to find pack thresholds that diverge.
```

### Scenario 2: 失败 — 重复 init

```bash
$ spec-graph constitution init
⚠ Constitution already exists at .spec-graph/constitution.yaml
  Use --force to overwrite, or edit the file directly.
```

**修复**:
```bash
$ spec-graph constitution init --force  # 强制覆盖(谨慎:丢失当前配置)
# 或直接编辑 .spec-graph/constitution.yaml
```

### Scenario 3: 校验失败 — schema 错误

```bash
$ spec-graph constitution validate
🔍 Constitution Validation

  ❌ Errors:
    • quality.thresholds.test_coverage must be 0..1, got 1.5
    • quality.articles[my-article]: invalid rule type (must be one of: required_section, min_length, co_completed)
    • quality.require_review_approvers must be ≥0
```

**修复**:编辑 `.spec-graph/constitution.yaml`:
- `test_coverage: 1.5` → `test_coverage: 0.95`
- 修 article 的 rule type
- 加 `require_review_approvers: 1`

### Scenario 4: 校验警告 — pack drift

```bash
$ spec-graph constitution validate
🔍 Constitution Validation

  ⚠ Warnings:
    • complexity-budget: pack declares threshold.cyclomatic=20, constitution says 15 — constitution wins
    • clarify-scan: pack declares threshold.ambiguity=2, constitution says 0 — constitution wins
```

**含义**:不是错误(constitution 会覆盖 pack),但提示你有不一致。可选:
- 接受(constitution 是 source of truth)
- 对齐(改 pack 或改 constitution)

### Scenario 5: diff-packs(查看冲突)

```bash
$ spec-graph constitution diff-packs
📊 Constitution vs Pack Thresholds

┌────────────────────┬────────────┬────────────────────┬────────────────────┐
│ Check ID           │ Pack Value │ Constitution Value │ Action             │
├────────────────────┼────────────┼────────────────────┼────────────────────┤
│ complexity-budget  │ 20         │ 15                 │ constitution wins  │
│ clarify-scan       │ 2          │ 0                  │ constitution wins  │
└────────────────────┴────────────┴────────────────────┴────────────────────┘

  Constitution is the source of truth at runtime.
  To silence this warning, align pack thresholds with the constitution (or vice versa).
```

### Scenario 6: bump + diff(版本化变更)

```bash
# 当前版本 0.1.0,改了 test_coverage 从 0.8 → 0.9
$ spec-graph constitution bump --type minor
✓ Constitution bumped: 0.1.0 → 0.2.0
  Snapshot saved: .spec-graph/.constitution-snapshot.json

# 查看变更
$ spec-graph constitution diff
📊 Constitution Diff: 0.1.0 → 0.2.0
  Snapshot taken: 2026-06-30T...

  📐 Quality Thresholds:
    ~ test_coverage: 0.8 → 0.9

  ⚠ 1 change(s) detected.
  Run `spec-graph change sync <change-id>` to see which artifacts need re-validation.
```

### Scenario 7: 失败 — bump 类型错误

```bash
$ spec-graph constitution bump --type huge
✗ Invalid bump type: huge. Must be major, minor, or patch.
```

**修复**:用 `major` / `minor` / `patch` 之一。

### Scenario 8: diff 无 snapshot

```bash
$ spec-graph constitution diff
⚠ No constitution snapshot found.
  Run `spec-graph constitution bump` to create a snapshot.
```

**修复**:先 `bump` 一次创建 snapshot,后续 `diff` 才有对比基准。

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Constitution not found. Run constitution init first.` | 没有 constitution.yaml | `spec-graph constitution init` |
| `Constitution already exists` (init) | 重复 init | `--force` 覆盖,或直接编辑文件 |
| `Invalid bump type` | --type 不是 major/minor/patch | 用合法值 |
| `No constitution snapshot found` (diff) | 没跑过 bump | 先 `bump` 一次 |
| validate 报 errors | schema 错误 | 按错误信息修 constitution.yaml |
| validate 报 warnings (pack drift) | pack 和 constitution 阈值不一致 | 接受(constitution wins)或对齐 |
| `graph.yaml not found` (diff-packs) | 没 compose | 先 `spec-graph compose` |

## 衔接关系

- **前置**:`spec-graph init`(项目必须先初始化)
- **可选前置**:`spec-graph compose`(diff-packs 需要 graph.yaml)
- **数据来源**:`.spec-graph/constitution.yaml`(主)+ `.spec-graph/graph.yaml`(diff-packs 用)+ `package.json`(init 时读 project name)
- **影响下游**:
  - `spec-graph check`(runtime 读阈值)
  - `spec-graph gate`(读 traceability rules)
  - `spec-graph artifact complete`(读 articles)
  - `spec-graph doctor`(检查 constitution 是否存在)
  - commit hook(读 require_commit_story_ref)
- **变更追踪**:`bump` + `diff` 链,可配合 `spec-graph change sync` 看哪些 artifact 需要重新验证
- **版本对齐**:constitution 的 semver policy 影响 release 决策(可与 `spec-graph change complete` 联动)
