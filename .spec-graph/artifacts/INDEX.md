---
id: index
kind: meta/index
status: completed
created_at: 2026-06-27T22:00:00Z
author: AI Agent
---

# spec-graph 文档体系索引

## 概述

本文档索引了 spec-graph 工作流编排引擎的完整文档体系,涵盖需求、架构、任务、决策等各个层面。

## 文档清单

### 需求文档 (PRD)
- [PRD-001: spec-graph 工作流编排引擎](./prd/PRD-001.md)
  - 问题陈述: AI 辅助开发缺乏结构化流程控制
  - 核心功能: 项目初始化、动作调度、文档追踪、质量门
  - 成功指标: 测试覆盖率 > 80%,dispatch 响应 < 100ms

### 架构文档 (ARCH)
- [ARCH-001: spec-graph 内核架构](./architecture/ARCH-001.md)
  - 三层架构: Sense → Compose → Enforce
  - 6 原语: Work-unit/Artifact/Contract/Check/Gate/Trace-edge
  - 关键模块: next/dispatch/machine/enforce/meeting

### Epic 文档
- [EPIC-001: 核心工作流引擎](./epics/EPIC-001.md)
  - 范围: init/sense/compose/dispatch/run
  - 用户故事: US-1/US-2/US-3
  - 状态: ✅ 已完成

### 用户故事 (Story)
- [S-001: 初始化项目工作流](./story/S-001.md)
  - 验收标准: 生成 .spec-graph/ 目录和 profile.yaml
  - 状态: ✅ 已完成
  
- [S-002: 调度下一步动作](./story/S-002.md)
  - 验收标准: 返回 manifest 包含文档指导字段
  - 状态: ✅ 已完成
  
- [S-003: 追踪文档与状态](./story/S-003.md)
  - 验收标准: analysis 命令记录文档路径和链接
  - 状态: ✅ 已完成

### 实现任务 (Task)
- [T-001: 实现 init 命令](./task/T-001.md)
  - 关联: S-001
  - 状态: ✅ 已完成
  
- [T-002: 实现 dispatch 命令](./task/T-002.md)
  - 关联: S-002
  - 状态: ✅ 已完成
  
- [T-003: 实现 analysis 和 checklist 命令](./task/T-003.md)
  - 关联: S-003
  - 状态: ✅ 已完成

### 架构决策记录 (ADR)
- [ADR-001: 选择 TypeScript 作为实现语言](./adr/ADR-001.md)
  - 决策: TypeScript 5.x
  - 理由: 与 wdf-method 一致,类型安全,生态丰富
  
- [ADR-002: 采用 6 原语设计](./adr/ADR-002.md)
  - 决策: Work-unit/Artifact/Contract/Check/Gate/Trace-edge
  - 理由: 足够表达所有领域概念,避免内核膨胀
  
- [ADR-003: 采用三段式管线](./adr/ADR-003.md)
  - 决策: Sense → Compose → Enforce
  - 理由: LLM 最小化,Compose 可审计,Enforce 完全确定
  
- [ADR-004: 文档存储在 .spec-graph/artifacts/](./adr/ADR-004.md)
  - 决策: 分离存储策略
  - 理由: 关注点分离,spec-graph 只追踪元数据

## 追踪链接

### 阶段分析
- **阶段**: propose
- **关联任务**: T-001, T-002, T-003
- **关联 artifacts**: PRD-001, ARCH-001, EPIC-001, S-001, S-002, S-003, T-001, T-002, T-003, ADR-001~004
- **使用模板**: prd, architecture, epic, story, task, adr

### 关键决策
1. 采用 6 原语设计(Work-unit/Artifact/Contract/Check/Gate/Trace-edge)
2. 采用三段式管线(Sense → Compose → Enforce)
3. 文档存储在 .spec-graph/artifacts/,spec-graph 只追踪元数据

### 范围定义
**包含**:
- 项目初始化(init/sense/compose)
- 工作流调度(dispatch/run)
- 文档追踪(analysis/checklist)
- 质量门(gate 评估)

**不包含**:
- Pack 系统扩展性(EPIC-002)
- 会议协议和多 agent 协作(EPIC-003)
- 契约联邦和漂移检测(EPIC-004)
- UI 界面

## 测试覆盖

- **测试文件**: 35 个
- **测试用例**: 484 个
- **通过率**: 100%
- **覆盖率**: > 80%

## 下一步

1. EPIC-002: Pack 系统扩展性
2. EPIC-003: 会议协议和多 agent 协作
3. EPIC-004: 契约联邦和漂移检测
4. 完善 coordinator-protocol.md 文档
5. 增加 pack 数量(嵌入式、移动端等)

## 参考文档

- [CLAUDE.md](../../CLAUDE.md) - AI Agent 行为指南
- [docs/architecture-overview.md](../../docs/architecture-overview.md) - 系统架构概览
- [docs/agent-document-workflow.md](../../docs/agent-document-workflow.md) - 实战示例
- [docs/features.md](../../docs/features.md) - 功能清单
- [packs/foundation.pack/agents/coordinator-protocol.md](../../packs/foundation.pack/agents/coordinator-protocol.md) - Coordinator 协议
