---
id: design/aggregates
kind: design/aggregates
status: completed
created_at: 2026-06-28T13:10:00Z
author: AI Agent
---

# Aggregates Design

## 核心聚合

### 1. WorkflowAggregate (工作流聚合)
**根实体**: Workflow
**职责**: 管理工作流的完整生命周期
**包含**:
- Stages (阶段列表)
- CurrentState (当前状态)
- History (历史记录)

**不变量**:
- 工作流必须从 initial stage 开始
- 状态转移必须通过 gate 检查
- 历史记录不可修改

### 2. ArtifactAggregate (工件聚合)
**根实体**: Artifact
**职责**: 管理工件的状态和内容
**包含**:
- Metadata (元数据：ID、类型、状态)
- Content (内容：markdown 文件路径)
- Relations (关系：traces)

**不变量**:
- 工件 ID 必须唯一
- 状态只能按 pending → in_progress → completed 转移
- 已完成的工件不可回退

### 3. TraceAggregate (追溯聚合)
**根实体**: Trace
**职责**: 管理工件间的关系
**包含**:
- FromArtifact (源工件)
- ToArtifact (目标工件)
- RelationType (关系类型)

**不变量**:
- 关系必须是有效的（derives、implements、satisfies）
- 不能创建循环依赖
- 关系不可删除，只能标记为废弃

### 4. GateAggregate (门控聚合)
**根实体**: Gate
**职责**: 管理状态转移的前置条件
**包含**:
- RequiredArtifacts (必需工件)
- RequiredTraces (必需追溯)
- RequiredChecks (必需检查)

**不变量**:
- 门控条件不可动态修改
- 门控评估必须是确定性的
- 门控失败必须阻止状态转移

## 聚合关系

```
WorkflowAggregate
  │
  ├──contains──→ ArtifactAggregate (多个)
  │
  ├──contains──→ TraceAggregate (多个)
  │
  └──contains──→ GateAggregate (多个)
```

## 并发控制

- **WorkflowAggregate**: 使用乐观锁，基于版本号
- **ArtifactAggregate**: 使用悲观锁，基于工件 ID
- **TraceAggregate**: 无锁，只追加不修改
- **GateAggregate**: 无锁，只读不写
