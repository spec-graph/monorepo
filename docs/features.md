# spec-graph 功能清单

## 已实现功能

### Tier 1: 核心功能 ✅

#### 1. 项目级配置注入 ✅
- **文件**: `src/commands/config.ts`, `src/commands/config.test.ts`
- **功能**: 新增 `spec-graph config` 命令
- **子命令**: `init` / `set` / `show` / `clear`
- **存储**: `.spec-graph/config.yaml`
- **字段**: `context`(注入到 pack)、`rules`(per-artifact 校验)、`references`(外部引用)
- **集成**: compose 引擎自动读取并注入到 graph，dispatch manifest 暴露给 coordinator
- **测试**: 8 个测试全部通过

#### 2. Per-artifact 状态扩展 ✅
- **文件**: `src/engine/machine/index.ts`, `src/commands/artifact.ts`, `src/commands/artifact-status.test.ts`
- **功能**: 扩展 `ArtifactStatus` 类型，新增 `ready` 和 `blocked` 状态
- **命令**: `spec-graph artifact ready <id>` / `spec-graph artifact block <id>`
- **显示**: `artifact list` 和 `status` 用不同颜色显示新状态
- **集成**: dispatch manifest 新增 `artifact_statuses` 字段
- **测试**: 8 个测试全部通过

#### 3. Constitution 版本化 ✅
- **文件**: `src/commands/constitution.ts`, `src/commands/constitution-version.test.ts`
- **功能**: 
  - `spec-graph constitution bump [--type major|minor|patch]` 保存快照并更新版本
  - `spec-graph constitution diff` 对比当前与快照的差异
- **存储**: `.spec-graph/.constitution-snapshot.json` 保存历史快照
- **输出**: 支持 JSON 格式，显示 thresholds/articles/traces/waivers 的变更
- **测试**: 9 个测试全部通过

#### 4. Checklist 命令 ✅
- **文件**: `src/commands/checklist.ts`, `src/commands/checklist.test.ts`
- **功能**: `spec-graph checklist <story-id>` 生成预实施检查清单
- **检查项**: 
  - 5 个机械检查（自动化验证）: REQ 映射、范围原子化、AC 数量、REQ 解决、路径安全
  - 5 个软检查（人工审查）: 无模糊形容词、AC 可验证、边界情况、依赖声明、超出范围
- **输出**: `.spec-graph/checklists/<story-id>.md` Markdown 文件
- **测试**: 6 个测试全部通过

#### 5. 富文档系统 ✅
- **文件**: 
  - `src/commands/analysis.ts` - 阶段分析持久化
  - `src/commands/dispatch.ts` - 添加文档指导字段
  - `packs/foundation.pack/templates/*.md` - 6 个标准模板
- **功能**:
  - 创建 6 个标准模板: `prd.md`, `architecture.md`, `story.md`, `epic.md`, `task.md`, `adr.md`
  - dispatch manifest 新增 `template_ref`、`suggested_doc_path`、`document_guidance` 字段
  - `spec-graph analysis` 命令追踪阶段分析和文档链接
- **集成**: AI Agent 读取 manifest 后知道使用什么模板、写到哪里、写什么内容
- **测试**: 5 个 dispatch-doc 测试全部通过

### 基础设施功能 ✅

#### 状态机和调度引擎
- **文件**: `src/engine/machine/index.ts`, `src/commands/dispatch.ts`
- **功能**: 
  - 状态机管理(`machine-state.yaml`)
  - Gate 评估和转移验证
  - Dispatch manifest 生成
  - 多动作调度(`--all` 标志)
- **特性**: 
  - `requires_sub_agent` 区分确定性和 LLM 动作
  - `check_command` 嵌入实际 shell 命令
  - `trace_query` 暴露追踪查询详情
  - `missing_contracts` 检测契约漂移
  - `project_config` 注入项目级配置

#### 会议协议
- **文件**: `src/engine/meeting/index.ts`, `src/commands/meeting.ts`
- **功能**: 
  - 多轮广播式讨论
  - 动态轮次管理
  - 专家邀请协议
  - 运行时状态持久化
- **集成**: coordinator 可以发起 ad-hoc meeting

#### 契约联邦
- **文件**: `src/commands/contract.ts`
- **功能**:
  - 契约注册表管理
  - 版本发布和绑定
  - 漂移检测(`spec-graph contract drift`)
  - 重新验证(`spec-graph contract reverify`)

#### 追溯系统
- **文件**: `src/engine/trace/index.ts`, `src/commands/trace.ts`
- **功能**:
  - 追踪查询评估(exists/every/single 基数)
  - 自动连线(artifact 完成时自动填充追踪)
  - `spec-graph trace add` 手动创建追踪
  - 前后向追踪查询

#### 隔离和合并队列
- **文件**: `src/engine/isolation/*.ts`, `src/commands/scope.ts`, `src/commands/merge-queue.ts`
- **功能**:
  - Worktree 管理
  - Scope lock(文件级隔离)
  - 合并队列(顺序合并、冲突检测)

#### 变更管理
- **文件**: `src/commands/change.ts`
- **功能**:
  - OpenSpec 风格变更生命周期(`create` → `apply` → `sync` → `complete` → `archive`)
  - Profile patch 应用
  - Sync impact 计算
  - Audit log 追踪

### 辅助命令 ✅

- `spec-graph init` - 初始化项目
- `spec-graph compose` - 生成工作流图
- `spec-graph sense` - 分析项目结构
- `spec-graph status` - 查看当前状态
- `spec-graph next` - 查看下一步动作
- `spec-graph gate` - 评估 gate
- `spec-graph show` - 显示 graph 详情
- `spec-graph doctor` - 诊断项目健康
- `spec-graph profile` - 管理 profile
- `spec-graph artifact` - 管理 artifact
- `spec-graph check` - 运行 check
- `spec-graph run` - 自动运行确定性动作
- `spec-graph prime` - 初始化状态
- `spec-graph worktree` - 管理 worktree
- `spec-graph permissions` - 管理权限
- `spec-graph constitution` - 管理 constitution

## 文档系统

### 用户文档
- `CLAUDE.md` - AI Agent 行为指南和工作协议
- `docs/architecture-overview.md` - 系统架构概览
- `docs/agent-document-workflow.md` - AI Agent 文档生成实战示例

### 协议文档
- `packs/foundation.pack/agents/coordinator-protocol.md` - Coordinator 协议
- `packs/foundation.pack/agents/status-report-protocol.md` - 状态报告协议
- `packs/foundation.pack/agents/prompt-envelope.md` - Prompt 信封标准
- `packs/foundation.pack/agents/meeting-protocol.md` - 会议协议

### 模板文档
- `packs/foundation.pack/templates/prd.md` - 产品需求文档模板
- `packs/foundation.pack/templates/architecture.md` - 架构设计文档模板
- `packs/foundation.pack/templates/story.md` - 用户故事模板
- `packs/foundation.pack/templates/epic.md` - Epic 模板
- `packs/foundation.pack/templates/task.md` - 任务模板
- `packs/foundation.pack/templates/adr.md` - 架构决策记录模板

## 测试覆盖

### 测试文件数量
- 35 个测试文件
- 484 个测试用例
- 全部通过 ✅

### 关键测试领域
- Dispatch manifest 生成和字段
- 状态机转移和 gate 评估
- 会议协议和运行时状态
- 契约漂移检测
- 追溯系统
- Checklist 质量检查
- Analysis 链接追踪
- Constitution 版本化
- 项目配置注入

## 架构特点

### 中立引擎
- 不绑定特定 AI 工具
- 不存储文档内容
- 只追踪状态和元数据
- 通过 manifest 指导 AI Agent

### 声明式工作流
- Graph 定义所有 artifact、check、gate
- 模板提供结构框架
- AI Agent 负责内容生成
- 可追溯的链接关系

### 可组合性
- Pack 系统支持领域扩展
- Profile 驱动合成
- 项目级配置覆盖
- 灵活的权限模型

### 质量内建
- Gate 强制验证
- Checklist 质量检查
- Constitution 标准约束
- 追溯系统保证一致性

## 当前状态

**状态**: 核心功能完整，可投入使用

**已验证**:
- ✅ 完整的工作流生命周期
- ✅ AI Agent 文档生成流程
- ✅ 质量检查和验证
- ✅ 变更管理和追溯
- ✅ 会议和协作协议

**待优化**(可选):
- 更多 artifact 类型模板
- 高级追溯查询
- 可视化仪表板
- 性能优化(大型项目)

## 使用示例

```bash
# 初始化项目
spec-graph init
spec-graph compose

# 获取下一步动作
spec-graph dispatch --json

# AI Agent 读取 manifest，生成文档
# ... (AI Agent 工作)

# 质量检查
spec-graph checklist requirement/prd/PRD-001

# 记录分析
spec-graph analysis --phase propose \
  --tasks "T-001" \
  --artifacts "requirement/prd/PRD-001" \
  --docs ".spec-graph/artifacts/prd/PRD-001.md"

# 标记完成
spec-graph artifact complete requirement/prd/PRD-001

# 继续工作流
spec-graph dispatch --json
```

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js
- **测试**: Vitest
- **CLI**: Commander.js
- **配置**: YAML
- **状态**: Machine State (YAML)
- **文档**: Markdown

## 许可证

内部项目
