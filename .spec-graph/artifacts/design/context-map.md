---
id: design/context-map
kind: design/context-map
status: completed
created_at: 2026-06-28T13:00:00Z
author: AI Agent
---

# Context Map

## Bounded Contexts

### 1. spec-graph Core (内核)
**职责**: 工作流编排引擎
**边界**: 状态机、dispatch、gate 评估
**下游**: Pack 系统、会议协议

### 2. Pack System (Pack 系统)
**职责**: 领域知识扩展
**边界**: 模板、验证规则、领域特定逻辑
**上游**: spec-graph Core
**下游**: 领域特定工作流

### 3. Meeting Protocol (会议协议)
**职责**: 多 agent 协作
**边界**: 会议调度、共识达成、决策记录
**上游**: spec-graph Core
**下游**: 工作流决策

## Context 关系

```
┌─────────────────┐
│  spec-graph     │
│  Core           │
│  (内核)          │
└────────┬────────┘
         │ upstream/downstream
         ├──────────────────┬─────────────────┐
         ↓                  ↓                 ↓
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Pack System    │  │  Meeting        │  │  Trace System   │
│  (Pack 系统)     │  │  Protocol       │  │  (追溯系统)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Integration Patterns

- **spec-graph Core → Pack System**: Plugin pattern (packs 注册到内核)
- **spec-graph Core → Meeting Protocol**: Command pattern (内核触发会议)
- **spec-graph Core → Trace System**: Observer pattern (内核追踪变更)
