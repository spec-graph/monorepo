# Repositories

> 仓储接口设计:聚合根的持久化边界。
> 仓储是领域层与基础设施层的分界线——领域层定义接口,基础设施层实现。

## 上下文:{{context_name}}

### {{AggregateRoot}}Repository

**管理聚合**: `{{AggregateRoot}}`

**接口定义**:

```typescript
interface {{AggregateRoot}}Repository {
  // 按 ID 加载聚合(含实体和值对象)
  findById(id: {{AggregateId}}): Promise<{{AggregateRoot}} | null>;

  // 保存聚合(持久化整个聚合为一个事务)
  save(aggregate: {{AggregateRoot}}): Promise<void>;

  // 删除聚合(仅当业务允许时)
  delete(id: {{AggregateId}}): Promise<void>;

  // 自定义查询(仅返回查询结果,非完整聚合)
  findBy{{QueryField}}(value: {{Type}}): Promise<{{QueryResult}}[]>;
}
```

**持久化策略**:

| 方面     | 选择                           | 理由         |
| -------- | ------------------------------ | ------------ |
| 存储类型 | RDBMS / Document / Event Store | {{reason}}   |
| 并发控制 | 乐观锁(version) / 悲观锁       | {{strategy}} |
| 序列化   | JSON / Binary / ORM            | {{approach}} |

---

### {{AggregateRoot2}}Repository

**管理聚合**: `{{AggregateRoot2}}`

**接口定义**:

```typescript
interface {{AggregateRoot2}}Repository {
  findById(id: {{AggregateId}}): Promise<{{AggregateRoot2}} | null>;
  save(aggregate: {{AggregateRoot2}}): Promise<void>;
}
```

## 事件存储(如使用 Event Sourcing)

| 聚合          | 事件存储     | 快照策略        | 回溯支持 |
| ------------- | ------------ | --------------- | -------- |
| {{aggregate}} | 追加式事件流 | 每 N 个事件快照 | ✓/✗      |

## 跨上下文数据访问

<!-- 不允许直接访问其他上下文的仓储,必须通过契约/事件 -->

| 需求               | 错误方式         | 正确方式                    |
| ------------------ | ---------------- | --------------------------- |
| 查询其他上下文数据 | 直接查对方数据库 | 通过契约 API / 订阅领域事件 |
