---
name: spec-graph-compose
description: "Compose the workflow graph from profile and packs. Matches packs to profile, generates graph.yaml with artifacts, checks, gates, tracks, agents, and meetings. AI agent is responsible for reviewing pack matches and resolving conflicts. Use after sense, after profile changes, or when changing change-type."
---

# spec-graph compose

从 `profile.yaml` 和 pack 库合成工作流图 `graph.yaml`。

## Architecture Principle

**spec-graph 只做 pack 匹配与图合成,不做需求决策。**

- ❌ spec-graph 不会替你判断"这个 feature 该不该加 plan 阶段"
- ❌ spec-graph 不会替你决定 check 的实际命令内容
- ❌ spec-graph 不会自动修复 pack 冲突
- ✅ spec-graph 只按 `applies_when` 规则机械匹配 packs
- ✅ spec-graph 检测冲突并报告,但需要 agent 决策

**Agent 的职责**:review 匹配到的 packs,处理 warnings/errors,必要时调整 profile 或 pack-overrides,然后才能进入 prime。

## What this does

**Compose 引擎**接收冻结的 profile,执行以下步骤:

1. **匹配 domain packs** — 评估每个 pack 的 `applies_when` 条件对 profile facts
2. **匹配 intent pack** — 选择 change-intent pack (feature/bugfix/refactor/...)
3. **合并 artifacts/checks/gates** — 所有匹配 packs 声明的并集
4. **应用 gate patches** — planning packs 注入 requirements 到 foundation gates
5. **组装 tracks** — 从 domain packs 收集并行执行 tracks
6. **检测冲突** — 报告缺失的 artifact/check 引用

输出: `.spec-graph/graph.yaml` — 工作流的**单一真相源**。

## Usage

```bash
# 标准合成(默认 feature)
spec-graph compose

# 指定 change-type
spec-graph compose --change-type bugfix

# 写到自定义位置
spec-graph compose -o .spec-graph/graph.yaml
```

### Options

| Option | Description |
|--------|-------------|
| `--change-type <type>` | Change 意图: `feature` (default), `bugfix`, `refactor`, `spike`, `performance`, `migration`, `deprecation` |
| `-o, --output <file>` | 输出路径 (default: `.spec-graph/graph.yaml`) |

### Change-type 与 intent pack 对照

| Type | Pack | Pipeline |
|------|------|----------|
| `feature` | feature.pack | propose → specify → design → contract → plan → implement → review → test → accept |
| `bugfix` | bugfix.pack | diagnose → implement → review → test → accept |
| `refactor` | refactor.pack | characterization → refactor → verify → test → accept |
| `spike` | spike.pack | timebox → explore → conclude/discard |
| `performance` | performance.pack | baseline → hotspot → optimize → verify → accept |
| `migration` | migration.pack | inventory → batch → dual-run → cutover → accept |
| `deprecation` | deprecation.pack | mark → wait → zero-consumers → remove → accept |

## Execution Rules

### ✅ When to use

- **sense 之后**: profile 已 review + 冻结
- **修改 profile 之后**: 任何维度变化都要 re-compose
- **change-type 切换**: feature → bugfix 等变更后,pipeline 完全不同
- **添加/修改自定义 packs**: `packs/` 目录下新增 pack 后
- **pack-overrides 调整**: `.spec-graph/pack-overrides.yaml` 改动后

### ❌ When NOT to use

- **机器状态已 prime**: re-compose 不会自动 re-prime,需要手动跑 prime
- **有 in-progress change**: 重新 compose 会让当前 graph 失效,中断工作流(应先 archive 或 discard 当前 change)
- **只想看状态**: 用 `spec-graph show` 或 `spec-graph status`,不需要 re-compose

## Agent Workflow: Review matches → Resolve conflicts → Prime

### Step 1: 检查 Pack Matches

compose 输出会列出匹配到的 packs:

```
📦 Packs used:
  • foundation.pack (always)
  • feature.pack (intent: feature)
  • web-spa.pack (matched: has_ui=web)
  • typescript.pack (matched: hasTypeScript=true)
```

Agent 应确认:
- 是否有**该匹配但没匹配**的 pack?(检查 `applies_when` 条件)
- 是否有**不该匹配但匹配了**的 pack?(profile 维度可能误判)
- pipeline stages 是否符合预期?

### Step 2: 处理 Warnings / Errors

compose 会报告缺失引用:

```
⚠️ Warnings:
  • Artifact 'requirement/prd' referenced by gate but not declared
❌ Errors:
  • Check 'lint' referenced by pack but command missing
```

Agent 修复策略:
- **Missing artifact**: 添加自定义 pack 或修正 profile
- **Missing check command**: 编辑 `commands.yaml` 或 pack template
- **Pack 冲突**: 用 `pack-overrides.yaml` 排除或重排 packs

### Step 3: 检查 Gates 和 Tracks

compose 输出会显示 gates 和 tracks 表格。Agent 确认:
- Gate requirements 是否合理?(artifacts + checks + traces 数量)
- Parallel tracks 是否符合项目结构?
- Track 的 produces/consumes 关系正确?

### Step 4: 运行 prime

```bash
spec-graph prime              # 标准初始化
# 或
spec-graph prime --bootstrap  # 自动 pass 占位 check
```

## Usage Scenarios

### Scenario 1: 标准 feature 流程

```bash
spec-graph sense
# agent review + freeze profile
spec-graph compose --change-type feature
spec-graph prime
spec-graph status
```

### Scenario 2: bugfix 流程(更短 pipeline)

```bash
spec-graph compose --change-type bugfix
# 输出 pipeline: diagnose → implement → review → test → accept
spec-graph prime
```

### Scenario 3: 修改 profile 后 re-compose

```bash
# 把 boundary 从 internal 改成 published-api
vim .spec-graph/profile.yaml
spec-graph compose            # graph 会自动添加 contract 阶段相关 artifacts
spec-graph prime              # 必须!新 artifacts 才能 seed 到机器状态
```

### Scenario 4: 添加自定义 pack 后

```bash
# 在 packs/my-domain.pack/ 加了新 pack
spec-graph compose            # 检查是否被 applies_when 命中
# 如果没命中 → 调整 pack.yaml 的 applies_when 条件
# 如果命中但报错 → 检查 pack 内部 artifact/check 引用
```

### Scenario 5: 失败 — profile 不存在

```bash
$ spec-graph compose
✗ Profile not found. Run `spec-graph init` first.
# 修复: 先 init + sense
```

### Scenario 6: 失败 — 大量 missing references

如果 compose 报几十个 missing artifact/check references:
- 多半是 pack 模板损坏或 pack-overrides 配置错误
- 检查 `.spec-graph/pack-overrides.yaml` 是否排除了不该排除的 pack
- 检查 `packs/<pack>/pack.yaml` 是否完整

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Profile not found` | 未 init 或 sense | `spec-graph init` + `spec-graph sense` |
| `Pack not found: <name>` | pack 引用不存在 | 检查 `packs/` 目录或 pack-overrides |
| Missing artifact references | pack 内部引用错误 | 编辑 pack 模板或加自定义 pack 补齐 |
| Gate requirement conflicts | 多个 pack 注入冲突 requirement | 用 pack-overrides 排除其中一个 |

## 衔接关系

- **前置**: `spec-graph sense`(必须有 profile)
- **后续**: `spec-graph prime`(用 graph 初始化机器状态)
- **修改 profile 后**: 必须 re-compose + re-prime
- **change-type 切换后**: 必须 re-compose
- **dispatch 依赖**: dispatch 从 graph 读取 agents / meetings / tracks,所以 compose 是 dispatch 的前提
- **快速路径**: `spec-graph init --quick` 自动跑 `init → compose → prime --bootstrap`
