# 架构决策记录 (ADR)

> **ADR ID**: ADR-{{ id }}
> **创建日期**: {{ created_date }}
> **最后更新**: {{ last_updated }}
> **状态**: {{ status }} # Proposed / Accepted / Deprecated / Superseded
> **影响范围**: {{ affected_components }}

---

## 1. 上下文 (Context)

### 1.1 问题描述

> 我们面临什么问题？需要做出什么决策？

{{ problem_description }}

### 1.2 约束条件

- 时间约束: {{ time_constraints }}
- 技术约束: {{ technical_constraints }}
- 业务约束: {{ business_constraints }}
- 合规约束: {{ compliance_constraints }}

### 1.3 决策驱动力

| 驱动因素       | 重要性              | 说明                |
| -------------- | ------------------- | ------------------- |
| {{ driver_1 }} | High / Medium / Low | {{ explanation_1 }} |
| {{ driver_2 }} | High / Medium / Low | {{ explanation_2 }} |

---

## 2. 备选方案 (Considered Options)

### 2.1 方案 A: {{ option_a_name }}

**描述**:
{{ option_a_description }}

**优点** (+):

1. {{ pro_a_1 }}
2. {{ pro_a_2 }}

**缺点** (-):

1. {{ con_a_1 }}
2. {{ con_a_2 }}

### 2.2 方案 B: {{ option_b_name }}

**描述**:
{{ option_b_description }}

**优点** (+):

1. {{ pro_b_1 }}
2. {{ pro_b_2 }}

**缺点** (-):

1. {{ con_b_1 }}
2. {{ con_b_2 }}

### 2.3 方案 C: {{ option_c_name }} (可选)

**描述**:
{{ option_c_description }}

---

## 3. 决策 (Decision)

### 3.1 选中方案

**✅ 选择方案: {{ selected_option }}**

### 3.2 选择理由

> 为什么选择这个方案？基于什么权衡？

{{ decision_rationale }}

### 3.3 关键权衡 (Trade-offs)

| 权衡项           | 选择           | 理由           |
| ---------------- | -------------- | -------------- |
| {{ tradeoff_1 }} | {{ choice_1 }} | {{ reason_1 }} |
| {{ tradeoff_2 }} | {{ choice_2 }} | {{ reason_2 }} |

### 3.4 不选其他方案的理由

- **方案 A**: {{ why_not_a }}
- **方案 B**: {{ why_not_b }}

---

## 4. 后果 (Consequences)

### 4.1 正面后果

- ✅ {{ positive_consequence_1 }}
- ✅ {{ positive_consequence_2 }}

### 4.2 负面后果

- ⚠️ {{ negative_consequence_1 }} (缓解措施: {{ mitigation_1 }})
- ⚠️ {{ negative_consequence_2 }} (缓解措施: {{ mitigation_2 }})

### 4.3 引入的风险

| 风险         | 概率         | 影响         | 应对措施         |
| ------------ | ------------ | ------------ | ---------------- |
| {{ risk_1 }} | High/Med/Low | High/Med/Low | {{ response_1 }} |
| {{ risk_2 }} | High/Med/Low | High/Med/Low | {{ response_2 }} |

---

## 5. 实施计划 (Implementation)

### 5.1 实施步骤

1. **Phase 1**: {{ phase_1_description }} — 预计 {{ phase_1_effort }} 人天
2. **Phase 2**: {{ phase_2_description }} — 预计 {{ phase_2_effort }} 人天
3. **Phase 3**: {{ phase_3_description }} — 预计 {{ phase_3_effort }} 人天

### 5.2 验收标准

- [ ] 验收标准 1: {{ acceptance_criterion_1 }}
- [ ] 验收标准 2: {{ acceptance_criterion_2 }}
- [ ] 验收标准 3: {{ acceptance_criterion_3 }}

### 5.3 回滚计划

> 如果实施失败，如何回滚？

{{ rollback_plan }}

---

## 6. 关联信息

### 6.1 相关链接

- 需求文档: {{ link_requirements }}
- PRD 章节: {{ link_prd }}
- 相关 ADR:
  - ADR-00x: {{ link_related_adr_1 }}
  - ADR-00y: {{ link_related_adr_2 }}

### 6.2 参考资料

1. {{ reference_1 }}
2. {{ reference_2 }}

### 6.3 决策者与参与者

| 角色       | 姓名                 | 职责           |
| ---------- | -------------------- | -------------- |
| 架构师     | {{ architect_name }} | 最终决策者     |
| Tech Lead  | {{ tech_lead_name }} | 技术可行性评估 |
| 产品负责人 | {{ po_name }}        | 业务影响评估   |
| 安全负责人 | {{ security_name }}  | 安全评估       |

---

## 7. 变更历史

| 版本 | 日期         | 修改人         | 修改内容                 |
| ---- | ------------ | -------------- | ------------------------ |
| v1.0 | {{ date_1 }} | {{ author_1 }} | 初始版本                 |
| v1.1 | {{ date_2 }} | {{ author_2 }} | {{ change_description }} |

---

## 8. 模板使用说明

> **什么时候写 ADR?**
>
> - 架构级别的决策(影响 ≥ 3 个模块)
> - 不可逆或回滚成本高的决策
> - 引入新技术/框架/依赖
> - 改变已有架构模式
> - 技术债偿还策略
>
> **ADR 生命周中期**:
>
> 1. Proposed → 草案状态,收集反馈
> 2. Accepted → 已决策,开始实施
> 3. Deprecated → 决策不再适用但未替换
> 4. Superseded by ADR-XXX → 被新决策替代
>
> **原则**: 决策一旦做出,不删除 ADR,只更新状态。历史决策可追溯。
