# spec-graph 文档联动完整流程指南

## 概述

本指南演示如何让 YAML 文件和 Plan 文档（需求/Epics/Stories）完整联动，形成可追溯的工作流。

## 核心概念

```
文档层 (Markdown)          元数据层 (YAML)              关系层 (Traces)
─────────────────         ─────────────────           ─────────────────
.spec-graph/artifacts/    machine-state.yaml          traces/*.yaml
  ├─ prd/PRD-001.md       ├─ plan/story               ├─ plan_to_requirement.yaml
  ├─ story/S-001.md       ├─ requirement/prd          └─ design_to_story.yaml
  └─ task/T-001.md        └─ design/architecture
                            │
                            ↓
                         analysis/*.yaml
                         ├─ propose.yaml
                         ├─ specify.yaml
                         └─ design.yaml
```

## 完整联动流程

### 阶段 1: 需求分析 (Propose)

#### 1.1 创建 PRD 文档

```bash
# 创建需求文档
cat > .spec-graph/artifacts/prd/PRD-001.md << 'EOF'
---
id: requirement/prd/PRD-001
kind: requirement/prd
status: completed
created_at: 2026-06-27T14:00:00Z
author: AI Agent
---

# PRD: spec-graph 工作流编排引擎

## 问题陈述
...（完整内容）

## 用户故事
### US-1: 初始化项目工作流
...
### US-2: 调度下一步动作
...
EOF
```

#### 1.2 注册为 Artifact

```bash
# 注册 PRD 为完成的 artifact
spec-graph artifact complete requirement/prd --status completed --producer agent
```

#### 1.3 记录阶段分析

```bash
# 记录 propose 阶段的分析
spec-graph analysis --phase propose \
  --content "## 关键决策\n- 采用 6 原语设计\n- 采用三段式管线" \
  --tasks "T-001,T-002,T-003" \
  --docs ".spec-graph/artifacts/prd/PRD-001.md" \
  --templates "prd"
```

这会创建 `.spec-graph/analysis/propose.yaml`：

```yaml
id: analysis-propose
phase: propose
status: draft
linked_tasks:
  - T-001
  - T-002
  - T-003
linked_artifacts:
  - requirement/prd/PRD-001
document_paths:
  - .spec-graph/artifacts/prd/PRD-001.md
templates_used:
  - prd
```

### 阶段 2: 设计 (Specify)

#### 2.1 创建 Epic 和 Stories

```bash
# 创建 Epic
cat > .spec-graph/artifacts/epics/EPIC-001.md << 'EOF'
---
id: plan/epic/EPIC-001
kind: plan/epic
status: completed
---

# Epic: 核心工作流引擎

## 用户故事列表
- US-1: 初始化项目工作流 (已完成)
- US-2: 调度下一步动作 (已完成)
- US-3: 追踪文档与状态 (已完成)
EOF

# 创建 Story S-001
cat > .spec-graph/artifacts/story/S-001.md << 'EOF'
---
id: plan/story/S-001
kind: plan/story
status: completed
---

# Story: 初始化项目工作流

## 需求引用
- PRD-001: spec-graph 工作流编排引擎 (US-1)

## 验收标准
### AC-1: 初始化命令
...
EOF

# 创建 Tasks
cat > .spec-graph/artifacts/task/T-001.md << 'EOF'
---
id: plan/task/T-001
kind: plan/task
status: completed
story_ref: plan/story/S-001
---

# Task: 实现 init 命令
...
EOF
```

#### 2.2 注册 Artifacts

```bash
# 注册所有 story 和 task
spec-graph artifact complete plan/story/S-001 --status completed --producer agent
spec-graph artifact complete plan/story/S-002 --status completed --producer agent
spec-graph artifact complete plan/story/S-003 --status completed --producer agent
spec-graph artifact complete plan/task/T-001 --status completed --producer agent
spec-graph artifact complete plan/task/T-002 --status completed --producer agent
spec-graph artifact complete plan/task/T-003 --status completed --producer agent
```

#### 2.3 建立 Trace 关系

```bash
# Story derives from Requirement
spec-graph trace add --from plan/story --to requirement/prd --relation derives

# Task implements Story
spec-graph trace add --from plan/task --to plan/story --relation implements

# Design satisfies Requirement
spec-graph trace add --from design/architecture --to requirement/prd --relation satisfies
```

这会创建 trace 文件：

```yaml
# traces/plan_to_requirement.yaml
traces:
  - from: plan/story
    to: requirement/prd
    relation: derives
```

#### 2.4 记录阶段分析

```bash
spec-graph analysis --phase specify \
  --content "## 设计决策\n- 分解为 3 个 stories\n- 每个 story 对应 1 个 task" \
  --tasks "T-001,T-002,T-003" \
  --artifacts "plan/story/S-001,plan/story/S-002,plan/story/S-003,plan/task/T-001,plan/task/T-002,plan/task/T-003" \
  --docs ".spec-graph/artifacts/story/S-001.md,.spec-graph/artifacts/story/S-002.md,.spec-graph/artifacts/story/S-003.md,.spec-graph/artifacts/task/T-001.md,.spec-graph/artifacts/task/T-002.md,.spec-graph/artifacts/task/T-003.md" \
  --templates "story,task"
```

### 阶段 3: 质量检查

#### 3.1 运行 Checklist

```bash
# 检查 Story 质量
spec-graph checklist plan/story

# 输出：
# Mechanical Checks (automated):
#   ✓ Story references at least one requirement
#   ✓ Scope is atomic
#   ✓ Has at least 2 acceptance criteria
#   ✓ All referenced requirements are resolved
#   ✓ No file paths outside project scope
```

**关键**：checklist 命令会检查 trace 关系，确保 story 正确引用了 requirement。

#### 3.2 验证 Trace 完整性

```bash
# 查看 plan/story 的 trace
spec-graph trace plan/story

# 输出：
# 🔍 Trace backward from plan/story
# [artifact] plan/story
#   kind: plan
# [requirement] requirement/prd
#   relation: derives
```

### 阶段 4: 状态机集成

#### 4.1 Gate 检查

```bash
# 评估 gate
spec-graph gate

# 输出：
# Gate: propose-exit-gate
# Status: PASSED ✓
#   ✓ Required artifacts: requirement/prd (completed)
#   ✓ Required traces: plan/story → requirement/prd (exists)
```

**Gate 如何工作**：
1. 检查 `machine-state.yaml` 中的 artifact 状态
2. 检查 `traces/*.yaml` 中的 trace 关系
3. 如果所有条件满足，gate 通过

#### 4.2 状态转移

```bash
# 从 propose 转移到 specify
spec-graph machine transition --from propose --to specify

# machine-state.yaml 更新：
# current_stage: specify
# stage_history:
#   - from_stage: propose
#     to_stage: specify
#     timestamp: "2026-06-27T15:00:00Z"
#     gate_evaluation:
#       gate_id: propose-exit-gate
#       passed: true
```

## 完整联动图

```
┌─────────────────────────────────────────────────────────────┐
│                    文档层 (Markdown)                         │
│  .spec-graph/artifacts/                                     │
│  ├─ prd/PRD-001.md         ← AI Agent 生成                 │
│  ├─ story/S-001.md         ← AI Agent 生成                 │
│  └─ task/T-001.md          ← AI Agent 生成                 │
└────────────────────┬────────────────────────────────────────┘
                     │ frontmatter (id, kind, status)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  元数据层 (machine-state.yaml)               │
│  artifacts:                                                 │
│    requirement/prd: { status: completed }                  │
│    plan/story/S-001: { status: completed }                 │
│    plan/task/T-001: { status: completed }                  │
└────────────────────┬────────────────────────────────────────┘
                     │ artifact status
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    关系层 (traces/*.yaml)                    │
│  plan_to_requirement.yaml:                                  │
│    from: plan/story                                         │
│    to: requirement/prd                                      │
│    relation: derives                                        │
└────────────────────┬────────────────────────────────────────┘
                     │ trace relationships
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                 分析层 (analysis/*.yaml)                     │
│  propose.yaml:                                              │
│    linked_tasks: [T-001, T-002, T-003]                     │
│    linked_artifacts: [requirement/prd/PRD-001]             │
│    document_paths: [...]                                    │
└────────────────────┬────────────────────────────────────────┘
                     │ analysis metadata
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   状态机层 (Gate 评估)                       │
│  Gate: propose-exit-gate                                    │
│  Check:                                                     │
│    ✓ artifact requirement/prd is completed                 │
│    ✓ trace plan/story → requirement/prd exists             │
│  Result: PASSED → allow transition to specify              │
└─────────────────────────────────────────────────────────────┘
```

## 实际操作示例

### 示例 1: 从 PRD 到 Story 的完整链路

```bash
# 1. 创建 PRD
spec-graph artifact create requirement/prd/PRD-001
# → 创建 .spec-graph/artifacts/prd/PRD-001.md

# 2. 标记 PRD 完成
spec-graph artifact complete requirement/prd/PRD-001 --status completed

# 3. 创建 Story 并引用 PRD
spec-graph artifact create plan/story/S-001
# → 在 S-001.md 中添加：
# ## 需求引用
# - PRD-001: spec-graph 工作流编排引擎 (US-1)

# 4. 建立 trace
spec-graph trace add --from plan/story/S-001 --to requirement/prd/PRD-001 --relation derives

# 5. 验证 trace
spec-graph trace plan/story/S-001
# → 显示：plan/story/S-001 → requirement/prd/PRD-001 (derives)

# 6. 运行 checklist
spec-graph checklist plan/story/S-001
# → ✓ Story references at least one requirement
```

### 示例 2: 从 Story 到 Task 的完整链路

```bash
# 1. 创建 Task 并引用 Story
spec-graph artifact create plan/task/T-001
# → 在 T-001.md 中添加：
# story_ref: plan/story/S-001

# 2. 建立 trace
spec-graph trace add --from plan/task/T-001 --to plan/story/S-001 --relation implements

# 3. 标记 Task 完成
spec-graph artifact complete plan/task/T-001 --status completed

# 4. 记录分析
spec-graph analysis --phase specify \
  --tasks "T-001" \
  --artifacts "plan/task/T-001" \
  --docs ".spec-graph/artifacts/task/T-001.md"

# 5. 验证完整链路
spec-graph trace plan/task/T-001
# → 显示：
# plan/task/T-001 → plan/story/S-001 (implements)
# plan/story/S-001 → requirement/prd/PRD-001 (derives)
```

## 关键命令总结

| 操作 | 命令 | 作用 |
|------|------|------|
| 创建文档 | `spec-graph artifact create <id>` | 创建 markdown 文件 |
| 标记完成 | `spec-graph artifact complete <id>` | 更新 machine-state.yaml |
| 建立关系 | `spec-graph trace add --from <id> --to <id>` | 创建 trace 文件 |
| 查看关系 | `spec-graph trace <id>` | 显示追溯链 |
| 质量检查 | `spec-graph checklist <id>` | 验证 trace 完整性 |
| 记录分析 | `spec-graph analysis --phase <phase>` | 创建 analysis 文件 |
| Gate 检查 | `spec-graph gate` | 评估状态转移条件 |
| 状态转移 | `spec-graph machine transition` | 更新 stage |

## 最佳实践

1. **先创建文档，再注册 artifact**
   - 文档是内容载体
   - Artifact 是状态追踪

2. **及时建立 trace 关系**
   - Story 创建后立即建立 `derives` trace
   - Task 创建后立即建立 `implements` trace

3. **使用 analysis 记录决策**
   - 每个阶段结束时运行 `analysis` 命令
   - 记录关键决策和使用的模板

4. **定期运行 checklist**
   - 确保 trace 完整性
   - 提前发现问题

5. **Gate 检查前验证**
   - 运行 `spec-graph trace <id>` 验证关系
   - 运行 `spec-graph checklist <id>` 验证质量

## 总结

通过这套联动机制，spec-graph 实现了：

- ✅ **文档可追溯**：每个文档都有明确的上下游关系
- ✅ **状态可追踪**：每个 artifact 的状态变化都有记录
- ✅ **质量可保证**：checklist 和 gate 确保质量
- ✅ **决策可审计**：analysis 记录每个阶段的决策

这就是 spec-graph 的核心价值：**不存储内容，但完整追踪关系和状态**。
