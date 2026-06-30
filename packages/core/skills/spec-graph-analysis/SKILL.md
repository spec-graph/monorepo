---
name: spec-graph-analysis
description: "Persist per-phase analysis: decisions, key findings, summary, linked tasks/artifacts, document paths, templates used. Stored at .spec-graph/analysis/<phase>.yaml. spec-graph tracks metadata only — does NOT write the actual analysis content, only persists what agent provides. Use to record phase outcomes for audit, handoff, and cross-phase traceability."
---

# spec-graph analysis

按 phase 持久化分析结果(决策、关键发现、关联任务/文档)。

## Architecture Principle

**spec-graph 不写分析内容 — 只持久化 agent 提供的元数据。**

- ❌ spec-graph 不会替你做 phase 分析
- ❌ spec-graph 不会替你总结关键发现
- ❌ spec-graph 不会替你决定有哪些 decisions
- ❌ spec-graph 不会存储实际文档内容(只存路径)
- ✅ spec-graph 接收 agent 提供的字段,写入 `.spec-graph/analysis/<phase>.yaml`
- ✅ spec-graph 提供 list / show / write 三个 subcommand
- ✅ spec-graph 把 analysis 与 tasks / artifacts / templates 关联起来

**Agent 的职责**:在每个 phase 完成时,做实际分析,把结果通过 `spec-graph analysis write` 持久化。

参考 `CLAUDE.md`:
> spec-graph 追踪状态, **不存储文档内容**。AI agent 生成文档并写入 `.spec-graph/artifacts/<type>/`。

## What this does

为每个 workflow phase 持久化一份 analysis 文档,记录:

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | string | `analysis-<phase>`(自动生成) |
| `phase` | string | phase 名(propose / specify / design / plan / implement / review / test / accept) |
| `status` | `draft` / `final` | 分析状态 |
| `created_at` / `updated_at` | ISO date | 时间戳(自动) |
| `author` | string (可选) | 作者 |
| `summary` | string | 一句话总结 |
| `key_findings` | string[] | 关键发现列表 |
| `decisions` | string[] | 决策列表(为什么选 X 而非 Y) |
| `linked_tasks` | string[] | 关联的 task ID |
| `linked_artifacts` | string[] | 关联的 artifact ID |
| `document_paths` | string[] | 此 phase 产出的文档路径(spec-graph 不存内容,只存路径) |
| `templates_used` | string[] | 使用的模板引用(指向 packs templates) |
| `content` | string | 详细内容(完整分析文本) |

## Subcommands

通过 `--phase` 参数区分:

| 用法 | Subcommand | Description |
|------|-----------|-------------|
| `--phase list` | list | 列出所有 phase 的 analysis |
| `--phase <name>` (不带其他参数) | show | 显示某 phase 的 analysis 详情 |
| `--phase <name> --content "..."` | write | 写入/更新某 phase 的 analysis |

> 注意:list / show / write 都通过 `--phase` 参数区分,不是独立的子命令位置参数。

## Usage

```bash
# 列出所有 phase 的 analysis
spec-graph analysis --phase list
spec-graph analysis --phase list --json

# 显示某 phase 的 analysis
spec-graph analysis --phase propose
spec-graph analysis --phase propose --json

# 写入(覆盖单个字段)
spec-graph analysis --phase propose --content "We analyzed 3 options..."
spec-graph analysis --phase propose --summary "Decided to use OAuth2"
spec-graph analysis --phase propose --tasks "T-1,T-2,T-3"
spec-graph analysis --phase propose --artifacts "requirement/prd/auth,design/c4/auth"
spec-graph analysis --phase propose --docs ".spec-graph/artifacts/meta/auth-proposal.md"
spec-graph analysis --phase propose --templates "feature.pack/templates/prd.md"

# 组合写入
spec-graph analysis --phase design \
  --content "C4 model chosen because..." \
  --tasks "T-1,T-2" \
  --artifacts "design/c4/auth" \
  --docs ".spec-graph/artifacts/design/auth-c4.md" \
  --templates "feature.pack/templates/c4.md"
```

### Options

| Option | Description |
|--------|-------------|
| `--phase <name>` | phase 名,或 `list`(必填) |
| `--content <text>` | 写入 content 字段 |
| `--summary <text>` | (字段名 summary,但实际通过 --content 覆盖)— 注:源码中只有 --content,无独立 --summary |
| `--tasks <csv>` | linked_tasks,逗号分隔 |
| `--artifacts <csv>` | linked_artifacts,逗号分隔 |
| `--docs <csv>` | document_paths,逗号分隔 |
| `--templates <csv>` | templates_used,逗号分隔 |
| `--json` | JSON 输出 |

> **注意**:源码中实际只有 `--content` 一个内容写入选项,`summary` 没有独立 flag(包含在 content 中)。

## 文件位置

`.spec-graph/analysis/<phase>.yaml`

```yaml
id: analysis-propose
phase: propose
status: draft
created_at: 2026-06-30T10:00:00.000Z
updated_at: 2026-06-30T11:30:00.000Z
summary: ""
key_findings: []
decisions: []
linked_tasks: []
linked_artifacts: []
document_paths: []
templates_used: []
content: "We analyzed 3 options for authentication..."
```

## Output 解读(list)

```
┌────────────┬────────┬──────────────┬──────────────┬────────────────────┐
│ Phase      │ Status │ Updated      │ Linked Tasks │ Linked Artifacts   │
├────────────┼────────┼──────────────┼──────────────┼────────────────────┤
│ propose    │ final  │ 2026-06-30   │ 3            │ 2                  │
│ design     │ draft  │ 2026-06-29   │ 5            │ 1                  │
│ plan       │ draft  │ 2026-06-28   │ 0            │ 0                  │
└────────────┴────────┴──────────────┴──────────────┴────────────────────┘
```

## Output 解读(show)

```
Phase Analysis: propose

Status: final
Updated: 6/30/2026, 11:30:00 AM

Summary:
Decided to use OAuth2 for authentication.

Key Findings:
  • Users prefer social login (survey: 78%)
  • Existing session system is incompatible with OAuth

Decisions:
  • Use OAuth2 (Google + GitHub) instead of custom auth
  • Migrate session storage to Redis

Linked Tasks:
  • T-1
  • T-2
  • T-3

Linked Artifacts:
  • requirement/prd/auth
  • design/c4/auth

Document Paths:
  • .spec-graph/artifacts/meta/auth-proposal.md

Templates Used:
  • feature.pack/templates/prd.md

Detailed Content:
We analyzed 3 options for authentication: (1) custom auth, (2) OAuth2,
(3) SAML. Given our user base prefers social login and we need to ship
in 4 weeks, OAuth2 is the best fit...
```

## 何时使用 — 判断标准

### ✅ 应该使用 analysis

| 场景 | 时机 |
|------|------|
| 每个 phase 完成时 | 记录决策和关键发现 |
| 团队 handoff | 让接手的人快速了解 phase 结论 |
| 审计需要 | 留下"为什么这样决定"的记录 |
| 跨 phase 关联 | 把 design 引用的 requirement 串起来 |
| 后续 retro 时 | 提供 decisions 上下文 |
| 中断恢复 | 读 phase analysis 快速恢复上下文 |
| 多人协作 | 避免口头知识流失 |

### ❌ 不应该使用 analysis

| 场景 | 替代做法 |
|------|---------|
| 写实际 artifact 文档 | 直接写到 `.spec-graph/artifacts/<type>/<name>.md`(通过 dispatch) |
| 记 change 计划 | `spec-graph change create`(用 plan MD) |
| 查项目状态 | `spec-graph status` |
| 跨 artifact 一致性 | `spec-graph analyze` |
| 讨论方案 | `spec-graph meeting init` |

## Agent Workflow

```
1. 进入某 phase(如 design)
   ↓
2. sub-agent 做实际分析(读 requirement、查技术方案、做决策)
   ↓
3. sub-agent 把分析结果通过 dispatch manifest 写到 suggested_doc_path
   ↓
4. 主 agent 跑 spec-graph analysis 写元数据:
   spec-graph analysis --phase design \
     --content "<详细分析文本>" \
     --tasks "T-1,T-2" \
     --artifacts "design/c4/auth" \
     --docs ".spec-graph/artifacts/design/auth-c4.md" \
     --templates "feature.pack/templates/c4.md"
   ↓
5. 后续 phase(如 plan)可读 design 的 analysis:
   spec-graph analysis --phase design
   ↓ (获取决策上下文,基于此制定 plan)
6. plan phase 完成后同样写自己的 analysis
   ↓
7. 全部完成后,spec-graph analysis --phase list 可看所有 phase 的分析
   ↓
8. retro 时读各 phase 的 decisions,捕获经验教训
```

## 与 Agent 的协作关系

- **主 agent**:在每个 phase 转换点,跑 `analysis write` 持久化元数据
- **sub-agent**:做实际分析,产出 content(通过 dispatch)
- **后续 sub-agent**:读前序 phase 的 analysis 获取上下文
- **coordinator**:dispatch 时可注入前序 phase 的 summary 到 manifest 的 `distilled_context`
- **retro agent**:读所有 phase analysis 提取 lessons learned

## 与其他追踪系统的区别

| 系统 | 存什么 | 谁写 |
|------|--------|------|
| `machine-state.yaml` | artifact 状态(pending/in_progress/completed) | spec-graph 自动 |
| `dispatch manifest` | 下一步 action + 引用 | spec-graph 自动 |
| `trace 文件` | artifact 之间的链接 | spec-graph 自动 + agent 手动 |
| `change plan MD` | change 的需求/范围/AC | agent 手动填 |
| **`analysis/<phase>.yaml`** | phase 的决策和发现 | **agent 手动写** |
| `artifacts/<type>/*.md` | 实际文档内容 | sub-agent 通过 dispatch 写 |

**关键**:analysis 是介于"自动状态"和"文档内容"之间的一层 — 记录 phase 的思考过程和决策,但不存文档全文。

## Usage Scenarios

### Scenario 1: 标准记录 phase 分析(成功)

```bash
# design phase 完成,主 agent 记录
$ spec-graph analysis --phase design \
    --content "We chose C4 model because the system has 5+ components and needs clear boundaries. Key decision: use event-driven architecture for async operations." \
    --tasks "T-1,T-2,T-3" \
    --artifacts "design/c4/auth,design/addrs" \
    --docs ".spec-graph/artifacts/design/auth-c4.md,.spec-graph/artifacts/design/auth-addrs.md" \
    --templates "feature.pack/templates/c4.md"

✓ Analysis for phase 'design' saved

# 后续 plan phase 读 design analysis
$ spec-graph analysis --phase design
Phase Analysis: design
Status: draft
...
Detailed Content:
We chose C4 model because...
```

### Scenario 2: 列出所有 phase 的 analysis

```bash
$ spec-graph analysis --phase list
┌────────────┬────────┬────────────┬──────────────┬────────────────────┐
│ Phase      │ Status │ Updated    │ Linked Tasks │ Linked Artifacts   │
├────────────┼────────┼────────────┼──────────────┼────────────────────┤
│ propose    │ final  │ 2026-06-30 │ 3            │ 2                  │
│ specify    │ final  │ 2026-06-29 │ 5            │ 3                  │
│ design     │ draft  │ 2026-06-29 │ 5            │ 1                  │
│ plan       │ draft  │ 2026-06-28 │ 0            │ 0                  │
└────────────┴────────┴────────────┴──────────────┴────────────────────┘
```

### Scenario 3: 失败 — phase 不存在

```bash
$ spec-graph analysis --phase nonexistent
Error: Analysis for phase 'nonexistent' not found
```

**修复**:
- 先用 `write` 创建:`spec-graph analysis --phase nonexistent --content "..."`
- 或检查 phase 名拼写(常见:propose / specify / design / plan / implement / review / test / accept)

### Scenario 4: 增量更新(只改一个字段)

```bash
# 只更新 linked_tasks,其他字段保留
$ spec-graph analysis --phase propose --tasks "T-1,T-2,T-3,T-4"
✓ Analysis for phase 'propose' saved
# content / artifacts / docs 等字段不变
```

### Scenario 5: 失败 — 缺 --phase

```bash
$ spec-graph analysis --content "..."
Error: --phase is required
```

**修复**:加 `--phase <name>`。

### Scenario 6: 中断恢复(读 analysis 获取上下文)

```bash
# 项目中断一周后恢复
$ spec-graph status   # 看当前在哪个 phase
# 输出:current_stage: design

$ spec-graph analysis --phase design   # 读这个 phase 的分析
Phase Analysis: design
...
Detailed Content:
We chose C4 model because...

# 快速恢复上下文,继续工作
$ spec-graph dispatch --json
```

### Scenario 7: JSON 输出(供脚本消费)

```bash
$ spec-graph analysis --phase propose --json
{
  "id": "analysis-propose",
  "phase": "propose",
  "status": "draft",
  "summary": "",
  "key_findings": [],
  "decisions": [],
  "linked_tasks": ["T-1", "T-2"],
  "linked_artifacts": ["requirement/prd/auth"],
  "document_paths": [".spec-graph/artifacts/meta/auth-proposal.md"],
  "templates_used": ["feature.pack/templates/prd.md"],
  "content": "..."
}
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Error: --phase is required` | 没传 --phase | 加 `--phase <name>` |
| `Analysis for phase '<name>' not found` (show) | 该 phase 没 write 过 | 先 `write` 创建 |
| `No analysis documents found` (list) | 一个 phase 都没记录 | 进入 phase 后跑 `write` |
| 字段没更新 | 选项拼错 | 确认 `--content` / `--tasks` / `--artifacts` / `--docs` / `--templates` 拼写 |

## 衔接关系

- **前置**:无(可在任何阶段写,只要有 .spec-graph/ 目录)
- **数据来源**:agent 提供的所有字段
- **输出**:`.spec-graph/analysis/<phase>.yaml`
- **被引用**:
  - 后续 phase 的 sub-agent 读前序 analysis 获取上下文
  - `spec-graph retro` 读所有 phase 的 decisions
  - 中断恢复时快速了解 phase 结论
  - 审计追溯
- **配合**:
  - `spec-graph status`(查当前 phase)
  - `spec-graph dispatch`(manifest 可能引用 phase analysis)
  - `spec-graph artifact complete`(analysis.linked_artifacts 关联)
  - `spec-graph change show`(change 的 plan MD 是更详细的版本)
  - `spec-graph retro`(从各 phase analysis 提取 lessons)
