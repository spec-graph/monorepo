---
id: requirement/impact-map
kind: requirement/impact-map
status: completed
created_at: 2026-06-28T13:35:00Z
author: AI Agent
---

# Impact Map

## 目标 (Why)
**核心目标**: 让 AI 辅助开发流程可追踪、可审计、可复现

## 参与者 (Who)
### 1. AI Agent (Claude/Codex)
**需求**: 
- 清晰的工作流指导
- 自动化的状态追踪
- 完整的文档生成

### 2. 开发者
**需求**:
- 可视化的工作流状态
- 快速的问题定位
- 便捷的文档管理

### 3. 项目经理
**需求**:
- 项目进度概览
- 质量指标监控
- 风险预警机制

## 能力 (What)
### 1. 工作流编排
- **spec-graph init**: 初始化项目工作流
- **spec-graph dispatch**: 获取下一步动作
- **spec-graph status**: 查看当前状态
- **spec-graph gate**: 评估质量门控

### 2. 文档管理
- **文档创建**: 通过模板生成 PRD、架构文档、Stories、Tasks
- **状态追踪**: 自动注册 artifacts 并追踪状态
- **质量检查**: checklist 验证文档质量

### 3. 追溯系统
- **Trace 建立**: 建立 artifact 间的追溯关系
- **关系查询**: 查询完整的追溯链
- **影响分析**: 分析变更的影响范围

### 4. 分析记录
- **阶段分析**: 记录每个阶段的分析和决策
- **链接追踪**: 关联任务、文档、模板
- **审计支持**: 支持完整的审计追踪

## 交付物 (How)
### 1. CLI 工具
- spec-graph CLI 命令行工具
- 支持所有核心命令
- JSON 输出支持自动化

### 2. 文档系统
- .spec-graph/artifacts/ 文档存储
- 模板系统 (packs/foundation.pack/templates/)
- 质量检查系统 (checklist)

### 3. 状态管理
- machine-state.yaml 状态追踪
- traces/*.yaml 追溯关系
- analysis/*.yaml 阶段分析

### 4. Pack 系统
- foundation.pack 基础包
- 领域特定 pack (frontend/backend/api 等)
- 模板和验证规则

## 影响范围
### 正面影响
- ✅ 提高开发流程的可追踪性
- ✅ 减少文档遗漏和不一致
- ✅ 支持完整的审计和合规
- ✅ 降低知识流失风险

### 潜在风险
- ⚠️ 学习曲线：需要理解 spec-graph 的概念
- ⚠️ 初期投入：需要建立文档体系
- ⚠️ 维护成本：需要持续更新文档

## 度量指标
- **文档覆盖率**: 已创建文档 / 应创建文档
- **Trace 完整性**: 已建立 trace / 应建立 trace
- **Gate 通过率**: 通过的 gates / 总 gates
- **自动化程度**: 自动操作 / 总操作
