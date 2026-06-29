# 数据模型设计 (Data Model)

> **版本**: {{ version }}
> **创建日期**: {{ created_date }}
> **数据库类型**: PostgreSQL / MySQL / SQLite / MongoDB
> **ORM/查询器**: Prisma / TypeORM / Sequelize / Knex / Mongoose

---

## 1. ER 图

```mermaid
erDiagram
    {{ entity_1 }} {
        {{ type }} {{ field_1 }} PK
        {{ type }} {{ field_2 }}
        {{ type }} {{ field_3 }} FK
    }

    {{ entity_2 }} {
        {{ type }} {{ field_1 }} PK
        {{ type }} {{ field_2 }}
    }

    {{ entity_1 }} ||--o{ {{ entity_2 }} : "{{ relationship }}"
```

---

## 2. 表定义

### 2.1 `{{ table_1_name }}`

| 列名             | 类型         | 约束                   | 描述                |
| ---------------- | ------------ | ---------------------- | ------------------- |
| `id`             | UUID         | PRIMARY KEY            | 主键                |
| `created_at`     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() | 创建时间            |
| `updated_at`     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() | 更新时间            |
| `{{ column_1 }}` | {{ type_1 }} | NOT NULL               | {{ description_1 }} |
| `{{ column_2 }}` | {{ type_2 }} | UNIQUE                 | {{ description_2 }} |

**索引**:

- `idx_{{ table_1_name }}_{{ column_1 }}` ON `{{ column_1 }}`
- `idx_{{ table_1_name }}_created_at` ON `created_at` DESC

**触发器**:

- `trigger_update_updated_at`: 更新时自动设置 `updated_at = NOW()`

### 2.2 `{{ table_2_name }}`

| 列名             | 类型         | 约束                                    | 描述     |
| ---------------- | ------------ | --------------------------------------- | -------- |
| `id`             | UUID         | PRIMARY KEY                             | 主键     |
| `created_at`     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()                  | 创建时间 |
| `updated_at`     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()                  | 更新时间 |
| `{{ column_1 }}` | {{ type_1 }} | NOT NULL REFERENCES {{ ref_table }}(id) | 外键     |

---

## 3. 关系定义

| 关系        | 左表          | 右表          | 基数 | 描述                                                 |
| ----------- | ------------- | ------------- | ---- | ---------------------------------------------------- |
| {{ rel_1 }} | {{ table_a }} | {{ table_b }} | 1:N  | {{ rel_description_1 }}                              |
| {{ rel_2 }} | {{ table_c }} | {{ table_d }} | N:M  | {{ rel_description_2 }}(通过联结表 {{ join_table }}) |

---

## 4. 迁移计划

### 4.1 版本历史

| 版本   | 日期         | 迁移文件                   | 变更内容             |
| ------ | ------------ | -------------------------- | -------------------- |
| v0.1.0 | {{ date_1 }} | `001_init.sql`             | 初始 schema          |
| v0.2.0 | {{ date_2 }} | `002_add_{{ column }}.sql` | 新增 {{ column }} 列 |

### 4.2 待执行迁移

| 优先级 | 迁移内容          | 风险             | 回滚方案            |
| ------ | ----------------- | ---------------- | ------------------- |
| P0     | {{ migration_1 }} | {{ risk_level }} | {{ rollback_plan }} |

---

## 5. 性能优化

### 5.1 索引策略

| 索引名           | 表          | 列            | 类型                | 原因                   |
| ---------------- | ----------- | ------------- | ------------------- | ---------------------- |
| {{ index_name }} | {{ table }} | {{ columns }} | B-Tree / GIN / GIST | 高频查询 / 外键 / 排序 |

### 5.2 分区策略

| 表                | 分区键              | 分区方式            | 分区数      |
| ----------------- | ------------------- | ------------------- | ----------- |
| {{ large_table }} | {{ partition_key }} | RANGE / LIST / HASH | {{ count }} |

### 5.3 缓存策略

| 缓存键            | 数据源                   | TTL                | 失效条件                 |
| ----------------- | ------------------------ | ------------------ | ------------------------ |
| `{{ cache_key }}` | {{ table }}.{{ column }} | {{ ttl_seconds }}s | {{ invalidation_event }} |

---

## 6. 数据一致性保证

### 6.1 数据库级约束

- [ ] 外键约束启用
- [ ] 唯一约束覆盖所有业务唯一键
- [ ] CHECK 约束覆盖枚举值范围
- [ ] NOT NULL 约束覆盖必填字段
- [ ] 级联删除/更新策略明确

### 6.2 应用级保证

- [ ] 乐观锁(version 字段)
- [ ] 事务边界定义
- [ ] 幂等性保证
- [ ] 最终一致性策略

---

## 7. API → 数据库映射

> 确保 API 契约与数据模型一致。

| API 端点                          | 请求/响应字段         | 数据库表.列                | 类型匹配                          | 验证 |
| --------------------------------- | --------------------- | -------------------------- | --------------------------------- | ---- |
| `GET /api/v1/{{ resource }}/{id}` | `response.id`         | `{{ table }}.id`           | ✅ string ↔ UUID                  | ✅   |
| `POST /api/v1/{{ resource }}`     | `request.{{ field }}` | `{{ table }}.{{ column }}` | ✅ {{ api_type }} ↔ {{ db_type }} | ✅   |

**不一致追踪**:
| 发现日期 | API 字段 | DB 字段 | 差异描述 | 修复计划 |
|----------|----------|---------|----------|----------|
| {{ date }} | {{ api_field }} | {{ db_field }} | {{ mismatch_desc }} | {{ fix_plan }} |

---

## 8. 审计与合规

### 8.1 敏感数据分类

| 表.列                      | 敏感等级                 | 加密方式                | 脱敏规则      |
| -------------------------- | ------------------------ | ----------------------- | ------------- |
| `{{ table }}.{{ column }}` | PII / 机密 / 内部 / 公开 | AES-256 / 透明加密 / 无 | 替换为 \*\*\* |

### 8.2 审计日志配置

- [ ] 所有 INSERT/UPDATE/DELETE 操作记录审计日志
- [ ] 审计日志包含:操作人、时间、操作类型、变更前后值
- [ ] 审计日志不可篡改、不可删除、保留期 ≥ 1 年

---

**审批**:

- DBA: ********\_******** 日期: ****\_****
- 架构师: ********\_******** 日期: ****\_****
- 安全负责人: ********\_******** 日期: ****\_****
