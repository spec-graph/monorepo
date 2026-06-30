---
name: spec-graph-retro
description: "Generate a structured retrospective document for a completed/archived change. Captures what worked / what didn't / lessons / action items / improvements. spec-graph only generates an empty Chinese template — the AI agent is responsible for filling in real reflections based on the change's audit log, plan MD, and dispatch traces. Use after `spec-graph change archive`."
---

# spec-graph retro

为已归档的 change 生成结构化回顾文档(回顾会模板)。

## Architecture Principle

**spec-graph 只生成空壳模板 — 不替你反思。**

- ❌ spec-graph 不会替你总结"什么有效"
- ❌ spec-graph 不会自动从 audit log 提取教训
- ❌ spec-graph 不会替你决定下一步改进
- ✅ spec-graph 生成标准 5 段式模板(概述 / 什么有效 / 什么无效 / 学到的教训 / 下次改进 / 行动项)
- ✅ spec-graph 自动从 change JSON 注入元信息(title / type / priority / created_at)

**Agent 的职责**:读取 change 的 plan MD、audit_log、dispatch traces,提取真实经验,填写模板。

## What this does

`retro` 命令基于 change JSON 元信息生成 Markdown 回顾模板:

- 自动注入 change title / id / type / priority / created_at
- 自动填入 archived_at 时间戳
- 把 change.description 复制到"概述"段
- 提供 5 个空白章节(中文标题)等 agent 填充
- 提供"行动项"表格(行动项 / 负责人 / 截止日期 / 状态)

输出路径: `.spec-graph/retros/<change-id>-retro.md`

## Usage

```bash
spec-graph retro <change-id>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<change-id>` | ✅ Required | Change ID(支持前缀匹配,如 `add-auth-2026...`) |

### Options

`retro` 命令**没有**额外 options。所有内容(agent 想用的样式、深度、附加章节)由 agent 直接在生成的 MD 文件中编辑。

## 生成的模板结构

```markdown
# Retrospective: <change title>

> Change ID: <id>
> Type: feature | Priority: high
> Created: <created_at>
> Archived: <archived_at>

## 概述

<change.description>

## 什么有效
- (列出做得好的方面)

## 什么无效
- (列出遇到的问题)

## 学到的教训
- (列出关键教训)

## 下次改进
- (列出下次改进的具体行动)

## 行动项

| 行动项 | 负责人 | 截止日期 | 状态 |
|--------|--------|----------|------|
|        |        |          | TODO |
```

## Execution Rules

### ✅ 何时使用

| 情况 | 是否运行 retro |
|------|---------------|
| change 刚 archive,需要捕获经验 | ✅ 立即运行 |
| 重要 / 高风险 change(hotfix / migration) | ✅ 强烈推荐 |
| 失败 / discarded 的 change | ✅ 推荐(失败教训更宝贵) |
| 团队希望沉淀方法论的迭代 | ✅ 推荐 |
| spike 探索完毕(无论成功失败) | ✅ 推荐 |

### ❌ 何时不使用

| 情况 | 替代做法 |
|------|---------|
| 简单 typo 修复 / 琐碎 change | 跳过 retro,直接进 archive |
| change 还没 archive | 先 `spec-graph change archive <id>` |
| 已 archive 很久的 change | 意义不大(上下文已丢失) |
| 想实时分析当前进度 | 用 `spec-graph status` / `spec-graph dashboard` |

### 判断流程

```
change archive 完成
    ↓
是有意义的迭代吗?(feature / 复杂 bugfix / spike / migration)
    ├── 是 → spec-graph retro <id>
    │       ↓
    │       agent 读 plan MD + audit_log + dispatch traces
    │       ↓
    │       agent 填模板(真实反思,非空话)
    │       ↓
    │       (可选)提交 meeting 讨论行动项
    │
    └── 否(trivial change)
            ↓
            跳过 retro
```

## Agent Workflow

### Step 1: 确认 change 已 archive

```bash
spec-graph change show <change-id>
# 确认 status 包含 archived,archive.snapshot_dir 存在
```

如果未 archive,先 `spec-graph change archive <id>`。

### Step 2: 生成 retro 模板

```bash
spec-graph retro <change-id>
# 输出: ✓ Retrospective generated: .spec-graph/retros/<id>-retro.md
```

### Step 3: Agent 收集反思素材

读取以下源材料,提取真实经验(不要凭空写):

```bash
# 1. 读 plan MD(在 archived/ 目录)
cat .spec-graph/changes/archived/<id>-plan.md

# 2. 读 change JSON 的 audit_log(完整生命周期事件)
spec-graph change show <id> --json | jq '.audit_log'

# 3. 读 dispatch traces(看哪些步骤出错 / 重试)
ls .spec-graph/traces/

# 4. 读 machine-state(看哪些 artifact 反复 stale)
cat .spec-graph/machine-state.yaml
```

### Step 4: Agent 填写模板章节

针对每一段,基于素材填具体内容(避免空话):

**"什么有效"段**:
- 哪些 dispatch step 一次通过?
- 哪些 gate 检查无 warn?
- 哪些 sub-agent 协作顺畅?

**"什么无效"段**:
- 哪些 gate 反复失败?根因是什么?
- 哪些 sub-agent BLOCKED?为什么?
- 哪些 plan AC 不清晰导致返工?

**"学到的教训"段**:
- 抽象出可复用的方法论(不是单点问题)
- 例:"profile_patch 在 apply 前应先用 sync 预览 impact"

**"下次改进"段**:
- 可操作的具体行动(不是"做得更好")
- 例:"所有 feature change 创建后,必须 24h 内填完 Background + AC"

**"行动项"表格**:
- 每项有 owner / due date / status
- 跟踪到完成(可加入下次 change 的 checklist)

### Step 5: (可选)召开 retro meeting

如果教训复杂或涉及多人,用 `spec-graph meeting init` 讨论:

```bash
spec-graph meeting init retro-<change-id> \
  --purpose "Retrospective on <change title>" \
  --participants "agent:facilitator,user:decision-maker"
```

### Step 6: 沉淀行动项到未来 change

如果有"下次改进"是普适规则,考虑:

- 加入项目的 `constitution.md`(约束所有未来 change)
- 加入 pack 的 `checklist.yaml`(机械检查)
- 创建新的 `change`(改进工作流本身)

## Usage Scenarios

### Scenario 1: 成功 — 标准 feature 归档后 retro

```bash
# 前提:add-user-authentication 已 archive
spec-graph retro add-user-authentication-20260630-a1b2

# 输出:
# ✓ Retrospective generated: .spec-graph/retros/add-user-authentication-20260630-a1b2-retro.md
#   Edit this file to capture lessons learned.

# agent 读 plan MD + audit_log,填模板:
# - 什么有效:OAuth 集成一次通过,sub-agent 协作顺畅
# - 什么无效:scope 中漏掉 token 刷新逻辑,design 阶段返工
# - 教训:feature change 的 Scope.OUT 必须显式声明边界
# - 改进:更新 feature.pack 的 plan template,强制 OUT 段
```

### Scenario 2: 成功 — 失败的 spike(更有价值)

```bash
# spike:评估 WASM 处理图像,结论不可行,discarded
spec-graph change archive evaluate-wasm-20260628-x9y8

# retro 同样适用(失败教训更宝贵)
spec-graph retro evaluate-wasm-20260628-x9y8

# agent 填写:
# - 什么有效:timebox 严格 2 天内得出结论
# - 什么无效:未提前测 bundle size,design 阶段才发现 800KB 超限
# - 教训:spike 的探索清单必须包含"kill criteria"
# - 改进:spike.pack 的 timebox template 加 "exit criteria" 段
```

### Scenario 3: 成功 — migration 类 retro(高复杂度)

```bash
# migration:从 v1 API 迁移到 v2
spec-graph retro migrate-api-v2-20260615-m1n2

# agent 填写:
# - 什么有效:dual-run 阶段提前发现 3 处 backward-incompat
# - 什么无效:cutover 时间窗预估过短(实际 4h,预估 2h)
# - 教训:migration 的 cutover 必须留 2x buffer
# - 行动项:更新 migration.pack 的 cutover checklist
```

### Scenario 4: 失败 — 未 archive 就 retro

```bash
$ spec-graph retro add-auth-20260630-a1b2
✗ Change not found: add-auth-20260630-a1b2

# 原因:retro 只在 changes/ 找,不在 archived/ 找
# 修复:先 archive
spec-graph change archive add-auth-20260630-a1b2
spec-graph retro add-auth-20260630-a1b2
```

### Scenario 5: 失败 — change ID 错误

```bash
$ spec-graph retro nonexistent-id
✗ Change not found: nonexistent-id

# 修复:列出所有 changes 找正确 ID
spec-graph change list
# 或在 archived/ 目录找
ls .spec-graph/changes/archived/
```

### Scenario 6: 失败 — 未 init

```bash
$ spec-graph retro some-id
✗ Change not found: some-id

# 实际原因:项目未 init,无 .spec-graph/changes/ 目录
# 修复:
spec-graph init --stack <stack> --build <build> --description "..."
```

### Scenario 7: 半成功 — 生成了模板但 agent 不填

```bash
spec-graph retro <id>
# 模板生成,但 agent 没读 audit_log 就草率填空话
# 结果:retro MD 是"通用废话",无价值

# 修复:agent 必须读 plan MD + audit_log + traces 才能写出有价值的 retro
# 如果 agent 没时间深入,宁可不写,留给下次
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `✗ Change ID required` | 没传 `<change-id>` | 加参数:`spec-graph retro <id>` |
| `✗ Change not found: <id>` | ID 错误 / 未 archive / 项目未 init | `spec-graph change list` 查正确 ID;先 archive;先 init |
| 模板生成但内容空 | agent 未填 | agent 必须读 audit_log + plan MD 再填 |
| retro MD 重复生成 | 多次运行 retro 命令 | 默认会覆盖;若想保留旧版,先备份 |

## 衔接关系

- **前置**: `spec-graph change archive <id>`(必须先归档)
- **依赖文件**:
  - `.spec-graph/changes/<id>.json`(active 目录,archive 前存在)
  - archive 后变为 `.spec-graph/changes/archived/<id>.json`
- **生成文件**: `.spec-graph/retros/<id>-retro.md`
- **后续**:
  - 沉淀普适教训 → 更新 `constitution.md` / pack checklist
  - 改进工作流 → 创建新 `change` 类型为 `refactor` 或 `migration`
  - 行动项跟踪 → 加入下次 change 的 plan MD
- **可选**: `spec-graph meeting init retro-<id>`(团队讨论 retro)
- **协作**: retro 模板由 spec-graph 生成,内容由 agent(或 user)填,经验可沉淀到 pack 模板供未来 change 复用

## 注意事项

- **archive 时机**: retro 命令在 active `changes/` 找 JSON,因此必须在 archive **之前** 运行,或在 archive 之后用 archived 路径手动调整。推荐流程:`complete` → `retro` → `archive`(retro 先于 archive)。
- **不可逆**: retro MD 是普通文件,可随时编辑 / 删除 / 重生成。
- **不强制**: retro 是可选环节,简单 change 可跳过。
