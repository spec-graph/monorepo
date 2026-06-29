# Epic: {{ epic_title }}

> **Epic ID**: {{ epic_id }}
> **优先级**: P0 / P1 / P2
> **创建日期**: {{ created_date }}
> **Story Points**: {{ epic_points }}

---

## 1. Epic 概述

### 1.1 业务目标

> {{ business_goal }}

### 1.2 成功标准

- [ ] {{ success_criteria_1 }}
- [ ] {{ success_criteria_2 }}
- [ ] {{ success_criteria_3 }}

### 1.3 范围边界

- **In Scope**: {{ in_scope }}
- **Out of Scope**: {{ out_of_scope }}

---

## 2. Story 分解

| Story ID         | 标题                | Points         | 状态    |
| ---------------- | ------------------- | -------------- | ------- |
| {{ story_id_1 }} | {{ story_title_1 }} | {{ points_1 }} | pending |
| {{ story_id_2 }} | {{ story_title_2 }} | {{ points_2 }} | pending |

**总 Story Points**: {{ total_points }}

---

## 3. 依赖关系

- **前置依赖**: {{ dependency_epic_ids }}
- **阻塞的**: {{ blocked_by }}
- **阻塞了**: {{ blocks }}

---

## 4. 追溯链接

| 追溯类型     | 目标 ID             | 验证  |
| ------------ | ------------------- | ----- |
| **需求来源** | {{ req_source_id }} | ✅/❌ |
| **Stories**  | {{ story_ids }}     | ✅/❌ |

---

## 5. 审计字段

| 日期       | 变更 | 变更人       | 原因     |
| ---------- | ---- | ------------ | -------- |
| {{ date }} | 创建 | {{ author }} | 初始版本 |
