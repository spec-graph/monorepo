# ddd.pack — Context

## 定位

ddd.pack 为 spec-graph 提供完整的领域驱动设计(DDD)开发流程。它不是一个开发轨道(track),
而是一个**跨切面方法论层**——为已有的轨道(backend/frontend/embedded/...)提供 DDD 工件、
校验和门控。

## DDD 完整流程

### 阶段 1:领域发现(Discovery)

- 业务目标梳理 → `design/domain-vision`
- 核心域 / 支撑域 / 通用域划分
- 领域专家访谈(由 LLM 辅助或人工完成)

### 阶段 2:战略设计(Strategic Design)

- 限界上下文识别 → `design/context-map`
- 上下文间关系定义(ACL / OHS / PL / CS / CF / Partnership)
- 通用语言定义 → `design/ubiquitous-language`
- **门控**: `strategic-design-complete` (specify → design)

### 阶段 3:战术设计(Tactical Design)

- 聚合设计(聚合根 + 实体 + 值对象 + 不变量) → `design/aggregates`
- 领域事件设计(事件 schema + 生产者/消费者) → `design/domain-events`
- 仓储接口设计 → `design/repositories`
- **门控**: `tactical-design-complete` (design → plan)

### 阶段 4:实现(Implementation)

- 按聚合拆分任务
- 聚合实现(根 + 实体 + 值对象)
- 领域事件实现(handler / producer)
- 应用服务编排

### 阶段 5:验证(Validation)

- 限界上下文边界审计 → `bounded-context-audit`
- 聚合不变量检查 → `aggregate-invariant-check`
- 上下文映射一致性 → `context-map-consistency`
- 领域事件覆盖度 → `domain-event-coverage`

## 与其他 Pack 的关系

```
foundation.pack ───────────────────────────────────── 治理底盘
       │
       ├── requirement-analysis.pack ───────────── 需求分析
       ├── architecture.pack ───────────────────── C4 架构
       ├── task-decomposition.pack ─────────────── 任务分解
       │
       ├── api-design.pack ────┐
       ├── data-design.pack ───┤── 契约层
       ├── ddd.pack ───────────┘── 领域设计方法论(跨切面)
       │
       ├── frontend.pack ──────── FE 轨道
       └── backend.pack ───────── BE 轨道
```

ddd.pack 不替代 api-design / data-design,而是在它们之上提供**领域建模视角**:

- api-design 管"契约格式"(OpenAPI / gRPC)
- ddd.pack 管"为什么需要这个契约"(上下文关系 + 领域事件)

## 激活条件

当以下任一条件满足时激活:

- `topology: federated` — 联邦拓扑(多项目/多上下文)
- `boundary: published-api` 或 `published-lib` — 有对外边界
- `ddd: true` — 用户通过 profile override 显式启用

## 上下文映射关系类型

| 缩写 | 全称                  | 含义                                |
| ---- | --------------------- | ----------------------------------- |
| ACL  | Anti-Corruption Layer | 防腐层:翻译对方模型为自己的模型     |
| OHS  | Open Host Service     | 开放主机服务:提供标准协议供多方接入 |
| PL   | Published Language    | 发布语言:用标准 schema 描述交换格式 |
| CS   | Customer-Supplier     | 供需关系:上游按下游需求调整         |
| CF   | Conformist            | 遵从者:无条件遵循上游模型           |
| PT   | Partnership           | 协作:双方协调同步演进               |
