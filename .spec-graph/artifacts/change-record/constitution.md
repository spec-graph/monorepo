---
id: change-record/constitution
kind: change-record/constitution
status: completed
created_at: 2026-06-28T14:15:00Z
author: AI Agent
---

# Constitution Change Record

## 变更记录概述

本文档记录 spec-graph 项目宪法（Constitution）的所有变更历史。

## 宪法版本历史

### v1.0.0 (2026-06-28) - 初始版本

**变更类型**: 新增  
**变更原因**: 建立项目的基础宪法

**主要变更**:
1. **质量阈值**
   - test_coverage: 0.8 (80%)
   - cyclomatic_complexity: 15
   - ambiguity_score: 0
   - placeholder_count: 0
   - non_measurable_count: 5
   - lint_warnings: 0

2. **必需的检查工具**
   - lint: 代码风格检查
   - typecheck: 类型检查

3. **审查要求**
   - require_review_approvers: 1

4. **宪法条款**
   - story-has-ac: 每个故事必须有验收标准
   - c4-has-context: C4 图必须包含 Context 部分

5. **追溯要求**
   - story_to_prd: 每个 story 必须追溯到 PRD
   - ac_to_test: 每个 AC 必须有对应的测试
   - design_to_req: 每个设计必须追溯到需求

6. **语义化版本策略**
   - MAJOR: contract-removed, contract-breaking-change, public-api-removed
   - MINOR: contract-added, feature-added
   - PATCH: bugfix, internal-refactor
   - deprecation_grace_releases: 2

7. **安全策略**
   - command_whitelist: npm test, npm run, npx, node, jest, vitest, tsc, eslint
   - forbidden_patterns: &&, ||, ;, |, $(, `, >, <, curl, wget, sudo, su, eval, rm -rf

**影响范围**: 整个项目  
**向后兼容**: 是（初始版本）  
**迁移指南**: 无需迁移

## 变更流程

### 提案流程
1. 创建变更提案文档
2. 说明变更原因和影响
3. 列出受影响的部分
4. 提交审查

### 审查流程
1. 至少 1 名审查者审查
2. 评估变更的影响
3. 验证向后兼容性
4. 批准或拒绝

### 实施流程
1. 更新 constitution.yaml
2. 更新本文档
3. 更新受影响的 artifacts
4. 运行验证检查

### 验证流程
1. 运行 `spec-graph constitution validate`
2. 验证所有 artifacts 符合新宪法
3. 运行所有测试
4. 确认无回归

## 变更统计

| 版本 | 日期 | 类型 | 影响范围 | 审查者 | 状态 |
|------|------|------|----------|--------|------|
| v1.0.0 | 2026-06-28 | 新增 | 整个项目 | AI Agent | ✅ 已批准 |

## 未来变更计划

### 计划中的变更
1. **v1.1.0**: 添加性能阈值
   - response_time: 100ms
   - memory_usage: 100MB
   - cpu_usage: 50%

2. **v1.2.0**: 添加安全审查要求
   - require_security_review: true
   - security_review_approvers: 2

3. **v2.0.0**: 重构宪法结构
   - 分离质量、安全、性能部分
   - 添加领域特定部分

## 变更最佳实践

### 何时变更
- 质量标准需要调整
- 新的检查工具需要添加
- 追溯要求需要更新
- 安全策略需要加强

### 何时不变
- 变更影响太大
- 没有充分的理由
- 可以通过 waiver 解决
- 向后不兼容

### 变更检查清单
- [ ] 变更原因明确
- [ ] 影响范围评估
- [ ] 向后兼容性验证
- [ ] 至少 1 名审查者批准
- [ ] 更新 constitution.yaml
- [ ] 更新本文档
- [ ] 运行验证检查
- [ ] 更新受影响的 artifacts

## 相关链接

- [constitution.yaml](../../constitution.yaml) - 当前宪法配置
- [CHANGELOG.md](./changelog.md) - 项目变更日志
- [PRD-001.md](../requirement/prd/PRD-001.md) - 产品需求文档
