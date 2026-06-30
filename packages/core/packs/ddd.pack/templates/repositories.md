# Repositories

> 仓储接口设计：聚合根的持久化边界。
> 仓储是领域层与基础设施层的分界线——领域层定义接口，基础设施层实现。

## 上下文：{{context_name}}

### {{AggregateRoot}}Repository

**管理聚合**： `{{AggregateRoot}}`

**接口定义**（选择适合项目的语言）：

**TypeScript 示例**：
```typescript
interface {{AggregateRoot}}Repository {
  // 按 ID 加载聚合（含实体和值对象）
  findById(id: {{AggregateId}}): Promise<{{AggregateRoot}} | null>;

  // 保存聚合（持久化整个聚合为一个事务）
  save(aggregate: {{AggregateRoot}}): Promise<void>;

  // 删除聚合（仅当业务允许时）
  delete(id: {{AggregateId}}): Promise<void>;

  // 自定义查询（仅返回查询结果，非完整聚合）
  findBy{{QueryField}}(value: {{Type}}): Promise<{{QueryResult}}[]>;
}
```

**Python 示例**：
```python
from typing import Protocol, Optional

class {{AggregateRoot}}Repository(Protocol):
    def find_by_id(self, id: {{AggregateId}}) -> Optional["{{AggregateRoot}}"]:
        """按 ID 加载聚合（含实体和值对象）"""
        ...

    def save(self, aggregate: "{{AggregateRoot}}") -> None:
        """保存聚合（持久化整个聚合为一个事务）"""
        ...

    def delete(self, id: {{AggregateId}}) -> None:
        """删除聚合（仅当业务允许时）"""
        ...

    def find_by_{{query_field}}(self, value: {{Type}}) -> list["{{QueryResult}}"]:
        """自定义查询（仅返回查询结果，非完整聚合）"""
        ...
```

**Go 示例**：
```go
type {{AggregateRoot}}Repository interface {
    // 按 ID 加载聚合
    FindByID(ctx context.Context, id {{AggregateId}}) (*{{AggregateRoot}}, error)

    // 保存聚合
    Save(ctx context.Context, aggregate *{{AggregateRoot}}) error

    // 删除聚合
    Delete(ctx context.Context, id {{AggregateId}}) error

    // 自定义查询
    FindBy{{QueryField}}(ctx context.Context, value {{Type}}) ([]{{QueryResult}}, error)
}
```

**Java 示例**：
```java
public interface {{AggregateRoot}}Repository {
    Optional<{{AggregateRoot}}> findById({{AggregateId}} id);
    void save({{AggregateRoot}} aggregate);
    void delete({{AggregateId}} id);
    List<{{QueryResult}}> findBy{{QueryField}}({{Type}} value);
}
```

**Rust 示例**：
```rust
pub trait {{AggregateRoot}}Repository {
    fn find_by_id(&self, id: &{{AggregateId}}) -> Result<Option<{{AggregateRoot}}>;
    fn save(&self, aggregate: &{{AggregateRoot}}) -> Result<()>;
    fn delete(&self, id: &{{AggregateId}}) -> Result<()>;
    fn find_by_{{query_field}}(&self, value: &{{Type}}) -> Result<Vec<{{QueryResult}}>>;
}
```

**持久化策略**：

| 方面     | 选择                           | 理由         |
| -------- | ------------------------------ | ------------ |
| 存储类型 | RDBMS / Document / Event Store | {{reason}}   |
| 并发控制 | 乐观锁(version) / 悲观锁       | {{strategy}} |
| 序列化   | JSON / Binary / ORM            | {{approach}} |

---

### {{AggregateRoot2}}Repository

**管理聚合**： `{{AggregateRoot2}}`

**接口定义**（参考上方多语言示例，根据项目语言选择）：

```
{{AggregateRoot2}}Repository:
  - findById(id) → {{AggregateRoot2}} | null
  - save(aggregate) → void
```

## 事件存储（如使用 Event Sourcing）

| 聚合          | 事件存储     | 快照策略        | 回溯支持 |
| ------------- | ------------ | --------------- | -------- |
| {{aggregate}} | 追加式事件流 | 每 N 个事件快照 | ✓/✗      |

## 跨上下文数据访问

<!-- 不允许直接访问其他上下文的仓储，必须通过契约/事件 -->

| 需求               | 错误方式         | 正确方式                    |
| ------------------ | ---------------- | --------------------------- |
| 查询其他上下文数据 | 直接查对方数据库 | 通过契约 API / 订阅领域事件 |
