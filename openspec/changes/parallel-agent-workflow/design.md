## Context

spec-graph V2 是单 agent 串行执行。V3 的目标是让 spec-graph 能利用宿主 agent 的 sub-agent 能力（所有主流 AI agent 工具在 2026 年都已支持），实现并行开发。

spec-graph V3 的核心变化是**职责分离**：
- spec-graph 专注**决策和方法论**
- 宿主 agent 专注**执行**（通过它的 sub-agent tool）

## Product Form

spec-graph V3 依然是三层架构，但职责清晰分离：

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Layer A: Skills (方法论 + 决策指导)                            │
│   ───────────────────────────────────                            │
│   原有 6 个 skills + 新增 7 个 skills:                           │
│   ├── spec-graph-parallel          并行方法论                   │
│   ├── spec-graph-worktree          worktree 方法论              │
│   ├── spec-graph-merge             merge queue 方法论           │
│   ├── spec-graph-requirement-analysis (深度自适应)              │
│   ├── spec-graph-ui-design          UI 设计                    │
│   ├── spec-graph-user-stories       用户故事                   │
│   └── spec-graph-dev-stories        开发故事                   │
│                                                                  │
│   Layer B: Core (决策算法)                                       │
│   ─────────────────────────────────                              │
│   原有 8 个模块 + 新增 2 个模块:                                 │
│   ├── dependency-analyzer    任务依赖分析 + wave 生成          │
│   └── file-conflict-analyzer 文件冲突检测                      │
│                                                                  │
│   Layer C: Host Agent (执行层 - 宿主 agent 负责)                │
│   ───────────────────────────────────────────                    │
│   ├── sub-agent 并行执行（Agent tool / Subagents）             │
│   ├── git worktree 管理（bash 命令）                            │
│   ├── 顺序 merge（bash 命令）                                   │
│   └── 资源管理（进程/内存/API 限制）                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 利用宿主 agent 的 sub-agent 能力实现并行开发
- 提供完整的分析 pipeline（requirement → design → UI → user-stories → dev-stories → tasks）
- 跨所有支持 sub-agent 的工具兼容（Claude Code, Codex, Trae, Cursor, etc.）
- 需求分析深度根据 intent 自动判断
- 保持 V2 串行模式向后兼容

**Non-Goals:**
- 不实现自己的 sub-agent 运行时（宿主 agent 已有）
- 不自己管理 git worktree（宿主 agent 用 bash）
- 不自己实现 merge queue（宿主 agent 顺序执行 bash merge）
- 不支持无 sub-agent 能力的工具（V2 串行作为 fallback）

## Decisions

### Decision 1: Sub-agent 架构，不自己 spawn 进程

**Choice:** spec-graph 作为 skill 运行，宿主 agent 用它的 sub-agent tool 执行并行。

**Rationale:**
- 所有主流 AI agent 工具（2026）都支持 sub-agent 并行
- Sub-agent 是宿主 agent 的原生能力，资源管理由宿主负责
- 符合 spec-graph 的 DNA："大脑不做手"
- 跨平台兼容（不绑定特定 agent 工具）

**Alternatives considered:**
- child_process.spawn → 拒绝：复杂，资源管理麻烦，只能在 CLI 独立运行
- 进程池 → 拒绝：过度设计，宿主 agent 已有优化
- Agent SDK 直接调用 → 拒绝：失去宿主工具集成特性

### Decision 2: spec-graph 提供方法论，宿主 agent 执行

**Choice:** spec-graph 通过 skill（SKILL.md）提供并行执行的方法论指导。宿主 agent 按方法论执行，使用自己的 sub-agent tool。

**Rationale:**
- 方法论是 spec-graph 的核心价值（V2 已证明）
- 执行逻辑是宿主 agent 的责任
- 清晰职责分离，维护成本低

### Decision 3: 两个核心新模块（dependency-analyzer, file-conflict-analyzer）

**Choice:** 新增 2 个独立模块：
- `dependency-analyzer`: 任务依赖分析，生成执行 waves
- `file-conflict-analyzer`: 文件冲突检测

**Rationale:**
- 这两个是**决策类算法**，是 spec-graph 的核心价值
- 独立于宿主 agent 工具，可被任何 skill 调用
- 其他功能（worktree 管理、merge queue、sub-agent 调度）都是执行类，由宿主 agent 负责

### Decision 4: 需求分析深度自适应

**Choice:** `requirement-analysis` skill 根据 intent 复杂度自动选择分析深度（轻量/中等/复杂）。

**Rationale:**
- 简单任务不需要完整分析（如 "add login button"）
- 复杂任务需要深度分析（如 "build payment system"）
- 用户无需手动选择深度

### Decision 5: 向后兼容

**Choice:** 保留 V2 串行模式为默认，`--mode parallel` 启用并行。

**Rationale:**
- 不破坏现有用户的工作流
- 串行模式适合简单任务
- 渐进式采用并行

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 宿主 agent 的 sub-agent 能力限制 | Medium | High | spec-graph 方法论包含 fallback 策略 |
| 不同工具的 sub-agent 语法差异 | Medium | Medium | spec-graph 方法论足够通用 |
| Worktree 合并冲突 | Low | High | file-conflict-analyzer 提前检测 |
| 宿主 agent 失败不可控 | Low | Medium | spec-graph 方法论包含错误处理 |

## Open Questions

| Question | Answer |
|----------|--------|
| **Q1: 宿主 agent 是否支持 sub-agent 嵌套？** | 多数支持（Claude Code 3 层嵌套，Cursor 递归） |
| **Q2: 最大并行规模？** | 由宿主 agent 决定（Cursor 8 agent，Claude 不限） |
| **Q3: 合并冲突如何处理？** | 暂停，报告给用户，按 merge skill 指导 |

## Performance Targets

| Metric | Target |
|--------|--------|
| Wave 调度 | <1s（依赖分析） |
| File conflict 分析 | <3s per task |
| 端到端（5 并行） | 取决于宿主 agent |

## Security Considerations

| Concern | Mitigation |
|---------|--------|
| Sub-agent 权限 | 由宿主 agent 控制（spec-graph 不直接控制） |
| 分支命名冲突 | `spec-graph/<session>/<task>` 前缀隔离 |
| Worktree 目录清理 | spec-graph 方法论包含清理指导 |

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                   V3 Complete Pipeline (sub-agent 架构)              │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  spec-graph skills 指导宿主 agent:                            │  │
│   │   requirement → design → UI → user-stories → dev-stories      │  │
│   │   → task-decomposition → waves                                │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                          ↓                                           │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  宿主 agent 执行并行 (用自己的 sub-agent tool):               │  │
│   │                                                              │  │
│   │   ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│   │   │ sub-agent A │  │ sub-agent B │  │ sub-agent C │           │  │
│   │   │ task A       │  │ task B       │  │ task C       │           │  │
│   │   │ worktree A/ │  │ worktree B/ │  │ worktree C/ │           │  │
│   │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │  │
│   └──────────┼────────────────┼────────────────┼─────────────────┘  │
│              ↓                 ↓                 ↓                    │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  宿主 agent 顺序合并（用 bash: git merge，按 merge skill）:   │  │
│   │   A completes → rebase → merge → main                        │  │
│   │   B completes → wait → rebase → merge → main                 │  │
│   │   C completes → wait → rebase → merge → main                 │  │
│   └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Migration Plan

- V2 保持不变（`--mode serial` 默认）
- V3 新增 `--mode parallel` 和 `--mode auto`
- 现有 sessions 不受影响
- spec-graph skill 自动安装到 `~/.claude/skills/` 或 `.claude/skills/`

## Rollback Plan

- `--mode serial` 恢复 V2 行为
- 删除 spec-graph-parallel 等 skill 禁用并行能力
