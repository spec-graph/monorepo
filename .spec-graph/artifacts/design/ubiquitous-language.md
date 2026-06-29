---
id: design/ubiquitous-language
kind: design/ubiquitous-language
status: completed
created_at: 2026-06-28T13:05:00Z
author: AI Agent
---

# Ubiquitous Language

## 核心术语

### Artifact (工件)
**定义**: 工作流中产生的可交付物
**示例**: PRD、架构文档、用户故事、代码
**关联**: 每个 artifact 有唯一 ID 和状态

### Gate (门控)
**定义**: 状态转移的前置条件检查
**示例**: propose-exit-gate 要求 PRD 完成
**关联**: Gate 检查 artifacts、traces、checks

### Trace (追溯)
**定义**: artifact 之间的关系链
**示例**: story derives from requirement
**关联**: Trace 建立 artifact 间的依赖

### Pack (包)
**定义**: 领域特定的扩展模块
**示例**: frontend.pack、api.pack
**关联**: Pack 提供模板、验证规则、工作流逻辑

### Dispatch (调度)
**定义**: 确定下一步动作的过程
**示例**: spec-graph dispatch 返回 manifest
**关联**: Dispatch 基于当前状态和 gates 决策

## 术语关系

```
Artifact ──has──→ Status (pending/in_progress/completed)
    │
    ├──derives──→ Artifact (上游)
    │
    └──implements─→ Story (下游)

Gate ──requires──→ Artifact (必须完成)
  │
  └──requires──→ Trace (必须存在)

Pack ──provides──→ Template (模板)
  │
  ├──provides──→ Validation (验证规则)
  │
  └──provides──→ Workflow (工作流逻辑)
```

## 使用规范

- **Artifact ID**: 使用 `<type>/<subtype>/<name>` 格式，如 `plan/story/S-001`
- **Trace 关系**: 使用 `derives`、`implements`、`satisfies` 等标准关系
- **Gate 检查**: Gate 名称使用 `<stage>-<direction>-gate` 格式，如 `propose-exit-gate`
- **Pack 命名**: 使用 `<domain>.pack` 格式，如 `frontend.pack`
