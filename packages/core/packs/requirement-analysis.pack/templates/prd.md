# 产品需求文档 (PRD)

> **模板版本**: 1.0
> **项目名称**: {{ project_name }}
> **创建日期**: {{ created_date }}
> **最后更新**: {{ last_updated }}

---

## 1. 执行摘要

**一句话描述**:

> {{ elevator_pitch }}

**核心目标**:

- [ ] {{ goal_1 }}
- [ ] {{ goal_2 }}
- [ ] {{ goal_3 }}

**关键成功指标(KPI)**:
| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| {{ kpi_1_name }} | {{ kpi_1_target }} | {{ kpi_1_measure }} |
| {{ kpi_2_name }} | {{ kpi_2_target }} | {{ kpi_2_measure }} |

---

## 2. 用户与市场

### 2.1 目标用户画像 (Persona)

| 维度         | 描述                      |
| ------------ | ------------------------- |
| **角色**     | {{ persona_role }}        |
| **痛点**     | {{ persona_pain_points }} |
| **动机**     | {{ persona_motivations }} |
| **技能水平** | {{ persona_skill_level }} |

### 2.2 用户故事映射 (JTBD → Story)

| JTBD ID  | 要完成的任务 (Jobs To Be Done) | 预期成果        | 关联 Story      |
| -------- | ------------------------------ | --------------- | --------------- |
| JTBD-001 | {{ jtbd_1 }}                   | {{ outcome_1 }} | {{ story_ids }} |

---

## 3. 功能范围

### 3.1 核心功能 (Must-have)

| 功能 ID  | 名称                 | 描述                 | 优先级 |
| -------- | -------------------- | -------------------- | ------ |
| FEAT-001 | {{ feature_1_name }} | {{ feature_1_desc }} | P0     |

### 3.2 增强功能 (Should-have)

| 功能 ID  | 名称                   | 描述                   | 优先级 |
| -------- | ---------------------- | ---------------------- | ------ |
| FEAT-101 | {{ feature_101_name }} | {{ feature_101_desc }} | P1     |

### 3.3 未来功能 (Could-have, Out of scope)

| 功能 ID  | 名称                   | 原因                      |
| -------- | ---------------------- | ------------------------- |
| FEAT-201 | {{ feature_201_name }} | {{ out_of_scope_reason }} |

---

## 4. 验收标准 (Acceptance Criteria)

> 可测、明确、无歧义。每个 AC 必须能绑定到至少一个测试用例。

### 4.1 功能验收

**FEAT-001: {{ feature_1_name }}**

**场景**: {{ scenario_name }}

- **GIVEN**: {{ preconditions }}
- **WHEN**: {{ user_action }}
- **THEN**: {{ expected_result }}
  - [ ] AC 1: {{ acceptance_criterion_1 }}
  - [ ] AC 2: {{ acceptance_criterion_2 }}

### 4.2 非功能验收

| 类别         | 标准                 | 测量方式    |
| ------------ | -------------------- | ----------- |
| **性能**     | P95 响应时间 < 200ms | 负载测试    |
| **可用性**   | 99.9% uptime         | 监控告警    |
| **安全**     | OWASP Top 10 全覆盖  | 安全扫描    |
| **可访问性** | WCAG 2.1 AA          | axe-ci 扫描 |

---

## 5. 边界与约束

### 5.1 技术约束

- 技术栈: {{ tech_stack }}
- 兼容版本: {{ compatibility_matrix }}
- 性能预算: {{ performance_budget }}

### 5.2 业务约束

- 合规要求: {{ compliance_requirements }}
- 截止日期: {{ deadline }}
- 资源限制: {{ resource_limits }}

---

## 6. 可测性声明

> 本 PRD 的所有功能需求都附有可量化的验收标准。

**模糊点清单**(已澄清):
| # | 原始模糊描述 | 澄清后的精确表述 | 澄清日期 | 澄清人 |
|---|-------------|------------------|---------|-------|
| 1 | {{ ambiguous_1 }} | {{ clarified_1 }} | {{ date }} | {{ author }} |

**不可测项追踪**(已移除或转化):
| # | 不可测描述 | 处理方式 |
|---|-----------|----------|
| 1 | {{ non_measurable_1 }} | {{ resolution }} |

---

## 7. 追溯锚点

> 本 PRD 是整个追溯链的根节点。所有下游工件(架构设计/API 契约/Story/测试/代码/Commit)都必须能追溯回此处。

| 工件类型       | 关联 ID            | 验证状态 |
| -------------- | ------------------ | -------- |
| **架构设计**   | C4-L2              | ✅/❌    |
| **API 契约**   | contract/openapi   | ✅/❌    |
| **数据模型**   | contract/db-schema | ✅/❌    |
| **Epic 列表**  | plan/epics         | ✅/❌    |
| **Story 列表** | plan/story         | ✅/❌    |

---

**审批**:

- 产品负责人: ********\_******** 日期: ****\_****
- 技术负责人: ********\_******** 日期: ****\_****
- QA 负责人: ********\_******** 日期: ****\_****
