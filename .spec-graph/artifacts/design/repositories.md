---
id: design/repositories
kind: design/repositories
status: completed
created_at: 2026-06-28T14:30:00Z
author: AI Agent
---

# Repositories Design

## 概述

本文档描述 spec-graph 系统的数据访问层设计，包括各个聚合根对应的 Repository 接口和实现。

## Repository 设计原则

### 1. 接口隔离
- 每个聚合根有独立的 Repository 接口
- 接口只暴露必要的查询和修改方法
- 隐藏底层存储细节

### 2. 依赖倒置
- 业务逻辑依赖 Repository 接口
- 具体实现可以替换（文件系统、数据库、云存储等）
- 便于测试和扩展

### 3. 单一职责
- 每个 Repository 只负责一个聚合根的持久化
- 不包含业务逻辑
- 不包含跨聚合的操作

### 4. 幂等性
- 所有修改操作都是幂等的
- 重复执行不会产生副作用
- 支持重试机制

## Repository 接口定义

### 1. WorkflowRepository (工作流仓储)

```typescript
interface WorkflowRepository {
  // 查询
  findById(workflowId: string): Promise<Workflow | null>
  findByStage(stage: string): Promise<Workflow[]>
  findAll(): Promise<Workflow[]>
  
  // 修改
  save(workflow: Workflow): Promise<void>
  updateStage(workflowId: string, stage: string): Promise<void>
  delete(workflowId: string): Promise<void>
  
  // 查询特定
  exists(workflowId: string): Promise<boolean>
  countByStage(stage: string): Promise<number>
}
```

**实现**:
- `FileSystemWorkflowRepository`: 基于文件系统的实现
- `DatabaseWorkflowRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
├── machine-state.yaml  # 存储当前工作流状态
└── history/            # 存储历史记录
    └── workflow-<id>.yaml
```

### 2. ArtifactRepository (工件仓储)

```typescript
interface ArtifactRepository {
  // 查询
  findById(artifactId: string): Promise<Artifact | null>
  findByType(type: string): Promise<Artifact[]>
  findByStatus(status: ArtifactStatus): Promise<Artifact[]>
  findAll(): Promise<Artifact[]>
  
  // 修改
  save(artifact: Artifact): Promise<void>
  updateStatus(artifactId: string, status: ArtifactStatus): Promise<void>
  delete(artifactId: string): Promise<void>
  
  // 查询特定
  exists(artifactId: string): Promise<boolean>
  countByStatus(status: ArtifactStatus): Promise<number>
  findByProducer(producer: string): Promise<Artifact[]>
}
```

**实现**:
- `FileSystemArtifactRepository`: 基于文件系统的实现
- `DatabaseArtifactRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
├── machine-state.yaml  # 存储 artifact 状态
└── artifacts/          # 存储 artifact 内容
    ├── prd/
    ├── architecture/
    ├── story/
    └── ...
```

### 3. TraceRepository (追溯仓储)

```typescript
interface TraceRepository {
  // 查询
  findByFrom(fromArtifactId: string): Promise<Trace[]>
  findByTo(toArtifactId: string): Promise<Trace[]>
  findByRelation(relation: string): Promise<Trace[]>
  findAll(): Promise<Trace[]>
  
  // 修改
  save(trace: Trace): Promise<void>
  delete(traceId: string): Promise<void>
  
  // 查询特定
  exists(traceId: string): Promise<boolean>
  findPath(fromId: string, toId: string): Promise<Trace[]>
  findUpstream(artifactId: string): Promise<Trace[]>
  findDownstream(artifactId: string): Promise<Trace[]>
}
```

**实现**:
- `FileSystemTraceRepository`: 基于文件系统的实现
- `DatabaseTraceRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
└── traces/
    ├── plan_to_requirement.yaml
    ├── story_to_req.yaml
    └── ...
```

### 4. GateRepository (门控仓储)

```typescript
interface GateRepository {
  // 查询
  findById(gateId: string): Promise<Gate | null>
  findByStage(stage: string): Promise<Gate[]>
  findAll(): Promise<Gate[]>
  
  // 修改
  save(gate: Gate): Promise<void>
  updateResult(gateId: string, result: GateResult): Promise<void>
  delete(gateId: string): Promise<void>
  
  // 查询特定
  exists(gateId: string): Promise<boolean>
  findPassed(): Promise<Gate[]>
  findFailed(): Promise<Gate[]>
}
```

**实现**:
- `FileSystemGateRepository`: 基于文件系统的实现
- `DatabaseGateRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
├── graph.yaml  # 存储 gate 定义
└── machine-state.yaml  # 存储 gate 评估结果
```

### 5. AnalysisRepository (分析仓储)

```typescript
interface AnalysisRepository {
  // 查询
  findByPhase(phase: string): Promise<Analysis | null>
  findAll(): Promise<Analysis[]>
  
  // 修改
  save(analysis: Analysis): Promise<void>
  delete(phase: string): Promise<void>
  
  // 查询特定
  exists(phase: string): Promise<boolean>
  findByArtifact(artifactId: string): Promise<Analysis[]>
  findByTask(taskId: string): Promise<Analysis[]>
}
```

**实现**:
- `FileSystemAnalysisRepository`: 基于文件系统的实现
- `DatabaseAnalysisRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
└── analysis/
    ├── propose.yaml
    ├── specify.yaml
    └── ...
```

### 6. ChecklistRepository (检查清单仓储)

```typescript
interface ChecklistRepository {
  // 查询
  findByArtifact(artifactId: string): Promise<Checklist | null>
  findAll(): Promise<Checklist[]>
  
  // 修改
  save(checklist: Checklist): Promise<void>
  updateResult(checklistId: string, result: ChecklistResult): Promise<void>
  delete(artifactId: string): Promise<void>
  
  // 查询特定
  exists(artifactId: string): Promise<boolean>
  findPassed(): Promise<Checklist[]>
  findFailed(): Promise<Checklist[]>
}
```

**实现**:
- `FileSystemChecklistRepository`: 基于文件系统的实现
- `DatabaseChecklistRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
└── checklists/
    ├── plan_story_S-001.md
    └── ...
```

### 7. ChangeRepository (变更仓储)

```typescript
interface ChangeRepository {
  // 查询
  findById(changeId: string): Promise<Change | null>
  findByStatus(status: ChangeStatus): Promise<Change[]>
  findAll(): Promise<Change[]>
  
  // 修改
  save(change: Change): Promise<void>
  updateStatus(changeId: string, status: ChangeStatus): Promise<void>
  delete(changeId: string): Promise<void>
  
  // 查询特定
  exists(changeId: string): Promise<boolean>
  findActive(): Promise<Change[]>
  findArchived(): Promise<Change[]>
}
```

**实现**:
- `FileSystemChangeRepository`: 基于文件系统的实现
- `DatabaseChangeRepository`: 基于数据库的实现（未来）

**文件存储结构**:
```
.spec-graph/
└── changes/
    ├── change-xxx.json
    └── archived/
        └── change-yyy.json
```

## Repository 实现细节

### 1. 文件系统实现

#### 优点
- 简单直观
- 人类可读
- 易于调试
- 无需额外依赖

#### 缺点
- 性能有限（大量数据时）
- 并发控制困难
- 查询能力有限

#### 实现策略
- 使用 YAML 格式存储
- 使用文件锁控制并发
- 缓存机制提升性能
- 增量更新减少 I/O

### 2. 数据库实现（未来）

#### 优点
- 性能优秀
- 查询能力强
- 并发控制完善

#### 缺点
- 需要额外依赖
- 增加复杂性
- 人类不可读

#### 实现策略
- 使用 SQLite（轻量级）
- 提供迁移工具
- 保持接口兼容

## Repository 使用示例

### 1. 保存 Artifact

```typescript
const artifactRepo = new FileSystemArtifactRepository(projectRoot);

const artifact: Artifact = {
  id: 'plan/story/S-001',
  kind: 'plan/story',
  status: 'completed',
  created_at: new Date(),
  author: 'AI Agent'
};

await artifactRepo.save(artifact);
```

### 2. 查询 Artifact

```typescript
const artifact = await artifactRepo.findById('plan/story/S-001');

if (artifact) {
  console.log(`Artifact ${artifact.id} status: ${artifact.status}`);
}
```

### 3. 更新状态

```typescript
await artifactRepo.updateStatus('plan/story/S-001', 'completed');
```

### 4. 查询 Trace

```typescript
const traceRepo = new FileSystemTraceRepository(projectRoot);

const traces = await traceRepo.findByFrom('plan/story/S-001');

for (const trace of traces) {
  console.log(`Trace: ${trace.from} → ${trace.to} (${trace.relation})`);
}
```

## Repository 测试策略

### 1. 单元测试
- 测试每个 Repository 方法的正确性
- 使用内存文件系统模拟
- 覆盖所有边界情况

### 2. 集成测试
- 测试 Repository 与文件系统的交互
- 测试并发场景
- 测试错误处理

### 3. 性能测试
- 测试大量数据的性能
- 测试查询性能
- 测试并发性能

## Repository 演进路线

### v1.0 (当前)
- 文件系统实现
- 基本查询能力
- 简单的并发控制

### v1.1 (计划)
- 缓存机制
- 增量更新
- 性能优化

### v2.0 (未来)
- 数据库实现
- 高级查询能力
- 分布式支持

## 相关链接

- [aggregates.md](./aggregates.md) - 聚合设计
- [domain-events.md](./domain-events.md) - 领域事件设计
- [data-model.md](./data-model.md) - 数据模型设计
