---
id: plan/epic/EPIC-001
kind: plan/epic
status: completed
created_at: 2026-06-27T16:00:00Z
author: AI Agent
---

# Epic: spec-graph 核心工作流引擎

## Epic 概述

实现 spec-graph 的核心工作流编排能力:从项目初始化到状态机驱动的任务调度,再到质量门强制。

## 范围

### 包含
- `spec-graph init` - 项目初始化
- `spec-graph sense` - 项目分析(profile 生成)
- `spec-graph compose` - 工作流图合成
- `spec-graph dispatch` - 下一步动作调度
- `spec-graph run` - 确定性动作自动执行
- Gate 评估和状态转移
- Dispatch manifest 生成(包含文档指导字段)

### 不包含
- Pack 系统的扩展性(EPIC-002)
- 会议协议和多 agent 协作(EPIC-003)
- 契约联邦和漂移检测(EPIC-004)
- UI 界面

## 关联 PRD

- PRD-001: spec-graph 工作流编排引擎

## 用户故事列表

### US-1: 初始化项目工作流 (已完成)
**优先级**: 高  
**状态**: 已完成

### US-2: 调度下一步动作 (已完成)
**优先级**: 高  
**状态**: 已完成

### US-3: 追踪文档与状态 (已完成)
**优先级**: 高  
**状态**: 已完成

## 时间估算

| 用户故事 | 估算工时 | 实际工时 | 状态 |
|---------|---------|---------|------|
| US-1: 初始化项目工作流 | 2 天 | 1.5 天 | ✅ 已完成 |
| US-2: 调度下一步动作 | 3 天 | 2.5 天 | ✅ 已完成 |
| US-3: 追踪文档与状态 | 2 天 | 1.5 天 | ✅ 已完成 |
| **总计** | **7 天** | **5.5 天** | **✅ 完成** |

## 依赖关系

### 前置依赖
- ARCH-001: spec-graph 内核架构(已完成)
- Node.js 20+ 运行时
- TypeScript 5.x

### 后续依赖
- EPIC-002: Pack 系统扩展性(计划中)
- EPIC-003: 会议协议和多 agent 协作(计划中)

## 成功标准

- ✅ `spec-graph init` 生成完整的 `.spec-graph/` 目录
- ✅ `spec-graph dispatch --json` 返回包含文档指导字段的 manifest
- ✅ `spec-graph run` 自动执行 run_check / verify_trace / transition
- ✅ Gate 评估正确阻止不合格的状态转移
- ✅ 484 个测试全部通过,覆盖率 > 80%

## 风险和障碍

| 风险 | 影响 | 缓解措施 | 状态 |
|------|------|----------|------|
| Compose 算法复杂度 | 高 | 已优化,单 fork 模式 5s | ✅ 已缓解 |
| Dispatch manifest 过大 | 中 | 已添加上下文精简机制 | ✅ 已缓解 |
| Gate 评估性能 | 低 | 已测试 100+ artifacts 无性能问题 | ✅ 已缓解 |

## 开放问题

无

## 完成记录

**完成日期**: 2026-06-27  
**实际工时**: 5.5 天(提前 1.5 天)  
**质量**: 484 个测试全部通过,覆盖率 > 80%
