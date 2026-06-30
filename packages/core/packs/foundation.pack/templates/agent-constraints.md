# spec-graph Agent 约束规则

> 由 spec-graph init 自动生成。所有 AI agent 必须遵守这些规则。违反规则 = 产出无效。

---

## 铁律：所有状态与规划文件必须在 `.spec-graph/` 内且可跟踪

**适用范围**：所有状态文件、规划文档、分析报告、设计文档、需求文档、变更记录——只要是描述项目"是什么"、"怎么做"、"做到哪了"的文件。

**两条底线**：
1. **位置**：必须在 `.spec-graph/` 目录树内
2. **可跟踪**：必须能被 spec-graph 命令追溯（有 artifact ID、有 change 关联、有状态）

---

## ⛔ 禁止行为清单

### 1. 禁止在 `.spec-graph/` 之外创建状态/规划文件

**判断标准只有一个：文件在不在 `.spec-graph/` 内。**

| 场景 | ❌ 禁止 | ✅ 正确 |
|------|--------|--------|
| 需求文档 | `docs/prd.md`、`prd.md`、`src/docs/prd.md` | `.spec-graph/artifacts/requirements/prd.md` |
| 设计文档 | `docs/arch.md`、`design.md` | `.spec-graph/artifacts/design/arch.md` |
| 计划/Task | `plan.md`、`tasks.md` | `.spec-graph/artifacts/plan/tasks.md` |
| 分析报告 | `analysis.md`、`docs/analysis.md` | `.spec-graph/artifacts/meta/analysis.md` |
| 决策记录 | `docs/adr-001.md` | `.spec-graph/artifacts/change-record/adr.md` |
| 变更日志 | `CHANGELOG.md` | `.spec-graph/artifacts/change-record/changelog.md` |
| 回顾文档 | `retro.md`、`docs/retro.md` | `.spec-graph/retros/<change-id>-retro.md` |
| 计划 MD | `change-plan.md` | `.spec-graph/changes/<title>-<timestamp>-plan.md` |

**不管文件在根目录、`docs/`、`src/` 还是其他任何地方——只要在 `.spec-graph/` 之外，就是错误的。**

### 2. 禁止创建无 change 关联的文档

```
❌ 用户说"写个分析"，agent 直接创建 .md 文件
✅ 必须先 spec-graph change create，文档作为 change 的 artifact 产出
```

**任何 .md 文件如果无法回答"属于哪个 change"，就不应该被创建。**

### 3. 禁止在 `.spec-graph/` 外修改状态

```
❌ 手动编辑 machine-state.yaml（不在 .spec-graph/changes/ 中）
❌ 直接写 .spec-graph/graph.yaml（不通过 compose）
❌ 在 .spec-graph/ 外创建 .yaml 状态文件
✅ 状态变更必须通过 spec-graph 命令：
   spec-graph machine update --artifact <id> --status completed
   spec-graph artifact complete <id>
   spec-graph compose
```

### 4. 禁止跳过 dispatch manifest 生产文档

```
 agent 自己决定文档内容和路径
✅ 文档路径由 manifest.suggested_doc_path 指定
✅ 文档内容由 manifest.document_guidance 指导
✅ 文档产出后必须 machine update 标记完成
```

### 5. 禁止凭记忆回答状态问题

```
❌ 用户问"进度如何"，agent 凭上次对话记忆回答
✅ 必须先运行 spec-graph status / spec-graph next / spec-graph gate
✅ 基于命令实际输出回答
```

---

## 完整文档生产流程（强制）

```
用户请求
    ↓
判断：是否涉及新文档/新状态变更？
    ↓
是 → spec-graph change create --title "..." --type <type>
    ↓
spec-graph change apply <change-id>
    ↓
spec-graph dispatch --json
    ↓
读取 manifest:
  - actions[0].suggested_doc_path  ← 文档写到这里
  - actions[0].document_guidance   ← 按这个指导写
  - actions[0].distilled_context   ← 只注入这些 context
    ↓
Agent 生产文档 → 写入 suggested_doc_path
    ↓
spec-graph machine update --artifact <id> --status completed
    ↓
spec-graph dispatch --json → 循环直到 done=true
    ↓
spec-graph change complete <change-id>
    ↓
spec-graph change archive <change-id>
```

---

## 文件放置速查表

| 文件 | 必须放在 | 关联命令 |
|------|---------|---------|
| 需求/PRD | `.spec-graph/artifacts/requirements/` | `compose` + `dispatch` |
| 设计文档 | `.spec-graph/artifacts/design/` | `compose` + `dispatch` |
| 计划/Tasks | `.spec-graph/artifacts/plan/` | `compose` + `dispatch` |
| 实现文档 | `.spec-graph/artifacts/implementation/` | `compose` + `dispatch` |
| 验证报告 | `.spec-graph/artifacts/verification/` | `compose` + `dispatch` |
| 分析报告 | `.spec-graph/artifacts/meta/` | `compose` + `dispatch` |
| Change 描述符 | `.spec-graph/changes/<id>.json` | `change create` |
| Change 计划 MD | `.spec-graph/changes/<id>-plan.md` | `change create` |
| 回顾文档 | `.spec-graph/retros/` | `retro` |
| 蒸馏文档 | `.spec-graph/distilled/` | `distill --save` |
| Review prompts | `.spec-graph/reviews/` | `review --save` |
| 归档变更 | `.spec-graph/archived/` | `change archive` |

**不在此表中的位置 = 错误位置。**

---

## 违规自检

每次准备写文件前，问自己三个问题：

1. **这个文件描述项目状态或规划吗？** → 是 → 必须在 `.spec-graph/` 内
2. **这个文件属于哪个 change？** → 答不上来 → 先创建 change
3. **spec-graph 能跟踪这个文件吗？** → 不能 → 不能创建

三个问题有任何一个答案为"是/不能"，就停下来，走正确流程。

---

## 例外情况

以下文件**可以**放在 `.spec-graph/` 之外：

| 文件 | 位置 | 原因 |
|------|------|------|
| CLAUDE.md | 项目根 | Agent 指令，不是项目状态 |
| README.md | 项目根 | 项目介绍，不是规划文档 |
| package.json | 项目根 | 包配置，不是状态文件 |
| src/** | 项目根 | 源代码，不是规划文档 |
| tests/** | 项目根 | 测试代码，不是规划文档 |

**判断标准**：这个文件是"代码/配置"还是"状态/规划"？代码/配置可以在外面，状态/规划必须在里面。
