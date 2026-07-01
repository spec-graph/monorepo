## Why

spec-graph V2 是单 agent 串行执行。虽然 2026 年所有主流 AI agent 工具（Claude Code、Codex、Trae、Cursor、Windsurf 等）都已支持 sub-agent 并行执行，但 spec-graph V2 没有利用这个能力。

**核心机会：**
- Sub-agent 并行是行业标准（Claude Code Agent tool, Codex subagents, Cursor parallel agents, Trae vertical topology）
- 所有主流工具都支持隔离的 git worktree
- spec-graph 可以专注决策（dependency analysis, conflict detection, methodology），让宿主 agent 专注执行（sub-agent 并行、worktree 管理、merge queue）

**设计哲学：**
- spec-graph 是**大脑**，宿主 agent 是**手**
- spec-graph 提供方法论，宿主 agent 执行
- 跨所有支持 sub-agent 的工具兼容

## What Changes

### 新架构：spec-graph 作为 skill 提供方法论

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   宿主 Agent (Claude Code / Codex / Trae / Cursor / etc.)        │
│   └── 加载 spec-graph skills                                    │
│   └── 按 spec-graph 方法论执行                                   │
│       ├── 用 sub-agent tool 并行执行（宿主原生能力）             │
│       ├── 用 bash 管理 worktrees（宿主原生能力）                 │
│       └── 用 bash 顺序合并（宿主原生能力）                       │
│                                                                  │
│   spec-graph V3 (作为 skill 运行)                                │
│   └── spec-graph-parallel: 并行方法论指导                        │
│   └── spec-graph-worktree: worktree 操作指导                    │
│   └── spec-graph-merge: merge queue 方法论                      │
│   └── spec-graph-dependency-analyzer: 任务依赖分析              │
│   └── spec-graph-file-conflict-analyzer: 文件冲突检测          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 关键职责分离

| 职责 | spec-graph | 宿主 agent |
|------|-----------|------------|
| 任务依赖分析 | ✓ (dependency-analyzer) | — |
| 文件冲突检测 | ✓ (file-conflict-analyzer) | — |
| Wave 编排 | ✓ (方法论) | — |
| Worktree 创建 | 方法论 (skill) | ✓ (bash 命令) |
| 并行执行 | 方法论 (skill) | ✓ (sub-agent tool) |
| Merge queue | 方法论 (skill) | ✓ (bash 命令) |
| 进程管理 | — | ✓ (sub-agent 内部管理) |
| 资源限制 | — | ✓ (sub-agent 配置) |

### 增强 pipeline

新增 4 个阶段作为前置分析 pipeline：

```
requirement-analysis → design → ui-design → user-stories → dev-stories → task-decomposition
    ↓ (智能深度: 根据 intent 复杂度自适应)
    ↓
  [8 个现有阶段: specify → design → plan → implement → review → test → accept → integrate]
```

- **requirement-analysis**: 需求分析（深度自适应）
- **ui-design**: UI 设计（独立阶段）
- **user-stories**: 用户故事设计
- **dev-stories**: 开发故事设计（技术视角）

## Capabilities

### New Capabilities

- `dependency-analyzer`: 分析任务依赖关系，生成执行 waves。独立模块，可被多个 skill 调用。

- `file-conflict-analyzer`: 分析任务文件影响，检测文件冲突，生成冲突矩阵。

### New Skills

- `spec-graph-parallel`: 并行方法论。指导宿主 agent 如何用 sub-agent 并行执行任务。包括 wave 调度、子 agent 任务分配、进度报告、失败处理。

- `spec-graph-worktree`: Worktree 方法论。指导宿主 agent 如何创建/清理 git worktrees。包括分支命名约定、冲突处理。

- `spec-graph-merge`: Merge queue 方法论。指导宿主 agent 如何顺序合并多个 worktree 到主分支。包括 rebase 策略、冲突解决。

- `spec-graph-requirement-analysis`: 需求分析 skill（深度自适应）。根据 intent 复杂度选择轻量/中等/复杂的分析模板。

- `spec-graph-ui-design`: UI 设计 skill（独立阶段）。

- `spec-graph-user-stories`: 用户故事设计 skill。

- `spec-graph-dev-stories`: 开发故事设计 skill。

### Modified Capabilities

- `task-decomposition`: 增强任务分解，加入依赖分析和文件影响预估。

- `automator`: 增强 `auto` 命令，支持 `--mode parallel/serial/auto`。

## Impact

### 代码（轻量）

spec-graph V3 核心模块只有 2 个新模块：
- `dependency-analyzer`（~300 LOC）
- `file-conflict-analyzer`（~200 LOC）

其他都是 skill（SKILL.md），不需要代码。

### 跨平台兼容

spec-graph V3 可以运行在所有支持 sub-agent 的工具中：
- Claude Code (Agent tool)
- OpenAI Codex CLI (Subagents)
- Trae (Sub-agent)
- Cursor (Parallel agents)
- Windsurf (Cascade)
- Qoder (Experts mode)

### 向后兼容

- V2 串行模式完全保留
- `spec-graph auto` 默认串行
- `spec-graph auto --mode parallel` 启用并行

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 宿主 agent 的 sub-agent 行为不可控 | Medium | High | spec-graph 方法论里包含错误处理指导 |
| 不同工具的 sub-agent 语法差异 | Medium | Medium | spec-graph 提供通用方法论，宿主适配 |
| Worktree 冲突 | Low | High | file-conflict-analyzer 提前检测 |
| 合并冲突 | Medium | Medium | Merge 方法论指导处理 |
