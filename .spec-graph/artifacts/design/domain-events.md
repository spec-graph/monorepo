---
id: design/domain-events
kind: design/domain-events
status: completed
created_at: 2026-06-28T13:15:00Z
author: AI Agent
---

# Domain Events

## 核心领域事件

### 1. WorkflowEvents (工作流事件)

#### WorkflowStarted
**触发时机**: 工作流初始化时
**携带数据**:
- workflowId: string
- initialStage: string
- startedAt: timestamp

**消费者**:
- ArtifactAggregate: 初始化 artifact 状态
- TraceAggregate: 准备追溯关系

#### WorkflowStageChanged
**触发时机**: 工作流状态转移时
**携带数据**:
- workflowId: string
- fromStage: string
- toStage: string
- timestamp: timestamp
- gateEvaluation: GateEvaluationResult

**消费者**:
- HistoryService: 记录状态历史
- NotificationService: 发送状态变更通知

#### WorkflowCompleted
**触发时机**: 工作流完成时
**携带数据**:
- workflowId: string
- completedAt: timestamp
- finalStage: string

**消费者**:
- ArchiveService: 归档工作流
- ReportService: 生成完成报告

### 2. ArtifactEvents (工件事件)

#### ArtifactCreated
**触发时机**: 工件创建时
**携带数据**:
- artifactId: string
- artifactType: string
- createdAt: timestamp
- createdBy: string

**消费者**:
- TraceService: 建立初始追溯关系
- ChecklistService: 生成质量检查清单

#### ArtifactStatusChanged
**触发时机**: 工件状态变更时
**携带数据**:
- artifactId: string
- fromStatus: string
- toStatus: string
- timestamp: timestamp
- changedBy: string

**消费者**:
- GateService: 重新评估相关门控
- TraceService: 更新追溯关系状态

#### ArtifactCompleted
**触发时机**: 工件完成时
**携带数据**:
- artifactId: string
- completedAt: timestamp
- completedBy: string

**消费者**:
- GateService: 检查是否满足门控条件
- WorkflowService: 检查是否可以推进工作流

### 3. TraceEvents (追溯事件)

#### TraceCreated
**触发时机**: 追溯关系创建时
**携带数据**:
- traceId: string
- fromArtifact: string
- toArtifact: string
- relationType: string
- createdAt: timestamp

**消费者**:
- GateService: 检查是否满足门控追溯要求
- ChecklistService: 验证追溯完整性

#### TraceValidated
**触发时机**: 追溯关系验证通过时
**携带数据**:
- traceId: string
- validatedAt: timestamp
- validatedBy: string

**消费者**:
- GateService: 更新门控评估结果

### 4. GateEvents (门控事件)

#### GateEvaluated
**触发时机**: 门控评估时
**携带数据**:
- gateId: string
- passed: boolean
- missingArtifacts: string[]
- missingTraces: string[]
- failedChecks: string[]
- evaluatedAt: timestamp

**消费者**:
- WorkflowService: 决定是否允许状态转移
- NotificationService: 发送门控失败通知

#### GatePassed
**触发时机**: 门控通过时
**携带数据**:
- gateId: string
- passedAt: timestamp

**消费者**:
- WorkflowService: 执行状态转移

## 事件处理模式

### 事件发布
- 使用事件总线（EventBus）发布事件
- 事件是不可变的（immutable）
- 事件携带完整的上下文数据

### 事件订阅
- 使用观察者模式订阅事件
- 订阅者必须处理事件失败的情况
- 订阅者可以异步处理事件

### 事件存储
- 事件存储在事件日志中（EventLog）
- 事件日志用于审计和回放
- 事件日志可以按时间或类型查询
