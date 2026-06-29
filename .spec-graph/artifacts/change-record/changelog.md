---
id: change-record/changelog
kind: change-record/changelog
status: completed
created_at: 2026-06-28T14:20:00Z
author: AI Agent
---

# Changelog

All notable changes to the spec-graph project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 计划实现 Pack 系统扩展 (EPIC-002)
- 计划实现会议协议 (EPIC-003)
- 计划实现契约联邦 (EPIC-004)

## [1.0.0] - 2026-06-28

### Added
- **核心工作流引擎** (EPIC-001)
  - 状态机引擎：支持阶段转移和 gate 评估
  - Dispatch 引擎：生成下一步动作清单
  - Machine State：追踪当前阶段和历史记录

- **文档管理系统**
  - 支持 6 种文档类型：PRD、架构、Epic、Story、Task、ADR
  - 文档模板系统：基于 packs/foundation.pack/templates/
  - 文档质量检查：checklist 命令验证文档质量

- **状态追踪系统**
  - Artifact 注册：通过 `spec-graph artifact complete` 注册
  - 状态管理：machine-state.yaml 追踪 artifact 状态
  - 状态更新：支持状态转移和状态查询

- **追溯关系系统**
  - Trace 创建：通过 `spec-graph trace add` 创建关系
  - 关系类型：supports、derives、implements、verifies
  - Trace 查询：通过 `spec-graph trace <id>` 查询追溯链

- **质量检查系统**
  - Checklist 生成：通过 `spec-graph checklist <id>` 生成
  - 机械检查：5 个自动检查（trace 完整性、scope 原子性等）
  - 软检查：5 个手动检查（模糊形容词、可测试性等）

- **阶段分析系统**
  - Analysis 记录：通过 `spec-graph analysis` 记录
  - 关联追踪：记录 linked_tasks、linked_artifacts、document_paths
  - 模板使用：记录使用的模板类型

- **Gate 评估系统**
  - Gate 定义：graph.yaml 定义各阶段的 gate 条件
  - Gate 评估：通过 `spec-graph gate` 评估
  - Gate 阻断：gate 失败时阻止状态转移

- **CLI 命令**
  - `spec-graph init`: 初始化项目
  - `spec-graph compose`: 合成工作流图
  - `spec-graph dispatch`: 获取下一步动作
  - `spec-graph status`: 查看当前状态
  - `spec-graph gate`: 评估 gate
  - `spec-graph artifact`: 管理 artifacts
  - `spec-graph trace`: 管理 traces
  - `spec-graph checklist`: 质量检查
  - `spec-graph analysis`: 阶段分析

- **文档体系**
  - PRD-001: 产品需求文档
  - ARCH-001: 架构文档
  - EPIC-001: Epic 文档
  - S-001~S-003: Story 文档
  - T-001~T-003: Task 文档
  - ADR-001~ADR-004: 架构决策记录
  - 总计 14 个核心文档

- **测试覆盖**
  - 35 个测试文件
  - 484 个测试用例
  - 100% 通过率
  - 覆盖率 > 80%

### Changed
- N/A (初始版本)

### Deprecated
- N/A (初始版本)

### Removed
- N/A (初始版本)

### Fixed
- **checklist 命令的 trace 读取问题**
  - 问题：从 state.traces 读取，但 trace 存储在独立文件
  - 解决：改用 buildTraceIndex 从文件读取
  - 影响：checklist 命令现在可以正确验证 story 是否引用了 requirement

- **Map API 使用问题**
  - 问题：使用 .find() 而不是 .get()
  - 解决：改用正确的 Map API
  - 影响：消除了运行时错误

- **节点类型检查问题**
  - 问题：检查 type === 'requirement' 而不是 metadata.kind
  - 解决：检查 metadata.kind.startsWith('requirement')
  - 影响：正确识别 requirement 类型的节点

### Security
- 无安全问题

## [0.1.0] - 2026-06-27

### Added
- 项目初始化
- 基础架构设计
- 核心原语定义（6 原语）
- 三段式管线设计（Sense → Compose → Enforce）

## 版本命名规范

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修正

## 变更类型说明

- **Added**: 新功能
- **Changed**: 现有功能的变更
- **Deprecated**: 即将移除的功能
- **Removed**: 已移除的功能
- **Fixed**: 问题修复
- **Security**: 安全修复

## 链接说明

- `[Unreleased]`: 未发布的变更
- `[1.0.0]`: 版本 1.0.0 的变更
- 日期格式：YYYY-MM-DD

## 如何贡献

1. 创建变更提案
2. 实现变更
3. 更新本文档
4. 提交审查
5. 合并后更新版本号

## 相关链接

- [constitution.md](./constitution.md) - 宪法变更记录
- [PRD-001.md](../requirement/prd/PRD-001.md) - 产品需求文档
- [ARCH-001.md](../design/architecture/ARCH-001.md) - 架构文档
