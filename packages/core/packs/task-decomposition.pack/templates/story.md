# Story: {{ story_title }}

> **Story ID**: {{ story_id }}
> **Epic ID**: {{ epic_id }}
> **优先级**: P0 / P1 / P2
> **创建日期**: {{ created_date }}
> **Story Points**: {{ story_points }}

---

## 1. 7 契约字段 (Contract Fields)

> **用户故事**:
> 作为一个 **{{ actor }}**,
> 想要 **{{ want }}**,
> 以便于 **{{ benefit }}**。

### 1.1 业务目标

> {{ business_goal }}

### 1.2 前置条件 (GIVEN)

- {{ precondition_1 }}
- {{ precondition_2 }}

### 1.3 用户动作 (WHEN)

- {{ user_action_1 }}
- {{ user_action_2 }}

### 1.4 预期结果 (THEN)

- {{ expected_result_1 }}
- {{ expected_result_2 }}

### 1.5 验收标准 (Acceptance Criteria)

- [ ] AC-001: {{ acceptance_criterion_1 }}
- [ ] AC-002: {{ acceptance_criterion_2 }}
- [ ] AC-003: {{ acceptance_criterion_3 }}
- [ ] AC-004: {{ acceptance_criterion_4 }}

### 1.6 非功能约束

- **性能**: {{ perf_constraint }}
- **安全**: {{ security_constraint }}
- **可访问性**: {{ a11y_constraint }}

### 1.7 审计字段 (Audit Log)

| 日期       | 变更 | 变更人       | 原因     |
| ---------- | ---- | ------------ | -------- |
| {{ date }} | 创建 | {{ author }} | 初始版本 |

---

## 2. 追溯链接

### 2.1 向上追溯 (Trace Up)

| 追溯类型     | 目标 ID             | 验证  |
| ------------ | ------------------- | ----- |
| **需求来源** | {{ req_source_id }} | ✅/❌ |
| **PRD 章节** | {{ prd_section }}   | ✅/❌ |
| **JTBD**     | {{ jtbd_id }}       | ✅/❌ |

### 2.2 向下追溯 (Trace Down)

| 追溯类型     | 目标 ID             | 验证  |
| ------------ | ------------------- | ----- |
| **测试用例** | {{ test_case_ids }} | ✅/❌ |
| **API 端点** | {{ endpoint_path    | ✅/❌ |
| **代码模块** | {{ module_name }}   | ✅/❌ |
| **变更记录** | {{ commit_hashes }} | ✅/❌ |

---

## 3. 实现计划

### 3.1 任务分解

- [ ] 任务 1: {{ task_1 }}
- [ ] 任务 2: {{ task_2 }}
- [ ] 任务 3: {{ task_3 }}

### 3.2 依赖关系

- **前置依赖**: {{ dependency_story_id
- \*\*阻塞的: {{ blocked_by }}
- **阻塞了**: {{ blocks }}

---

## 4. 测试绑定声明

> \*\*Test-Binding Gate:本 Story 的所有 AC 必须有对应的测试用例。

| AC ID  | 测试用例 ID     | 测试类型                 | 状态                |
| ------ | --------------- | ------------------------ | ------------------- |
| AC-001 | {{ test_id_1 }} | unit / integration / e2e | ✅ 已绑定 / ❌ 缺失 |
| AC-002 | {{ test_id_2 }} | unit / integration / e2e | ✅ 已绑定 / ❌ 缺失 |

\*\*绑定检查清单:

- [ ] 每个 AC 至少有一个测试用例
- [ ] 测试用例名称明确引用 Story ID
- [ ] 测试用例覆盖所有 THEN 子句
- [ ] 边界条件测试覆盖
- [ ] 负例覆盖

---

## 5. 实现与交付物

| 交付物       | 状态                    |
| ------------ | ----------------------- |
| 前端代码     | {{ fe_module_path       |
| 后端代码     | {{ be_module_path }}    |
| API 契约更新 | {{ openapi_diff_path }} |
| 数据库迁移   | {{ migration_file }}    |
| 文档         | {{ doc_path }}          |

---

\*\*状态:

- 产品: ********\_******** 日期: ****\_****
- 开发负责人: ********\_******** 日期: ****\_****
- QA 负责人: ********\_******** 日期: ****\_****
