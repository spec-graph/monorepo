## Context

spec-graph V2 是单 agent 串行执行，可靠性 95%+。V3 要引入并行开发，但**必须保持接近串行的可靠性**。这是设计的核心挑战。

**设计哲学：**
- 可靠性优先于速度
- 保守的并行策略（默认串行，显式指定才并行）
- 三层门禁保证整合质量
- 精准归因保证失败可恢复
- 自动降级保证可用性

## Sub-Agent 架构的优势

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   优势 1: 上下文隔离                                              │
│   ─────────────────────                                          │
│   • 每个 sub-agent 只加载本任务相关的上下文                      │
│   • 避免前一个任务的上下文污染后一个任务                         │
│   • 上下文窗口压力小（每个 agent 处理范围小）                    │
│   • 每个 sub-agent 更专注                                        │
│                                                                  │
│   优势 2: 严格执行规则                                            │
│   ─────────────────────                                          │
│   • 每个 sub-agent 必须按完整开发流程执行                        │
│   • 代码 + 测试 + lint + 自审 + 功能验证                        │
│   • 每个产物都必须通过三层门禁                                   │
│   • 保证并行开发质量接近串行                                     │
│                                                                  │
│   优势 3: 精准归因                                                │
│   ─────────────────────                                          │
│   • 每个 sub-agent 独立上下文，失败易于定位                      │
│   • 失败归因精确到具体 sub-agent                                 │
│   • 针对性恢复（只重试有问题的 sub-agent）                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Sub-Agent 执行标准

**每个 sub-agent 必须完成完整开发流程：**
- ✓ 代码编写（遵循项目规范）
- ✓ 单元测试（覆盖核心逻辑 + 边界条件）
- ✓ Lint + Typecheck（无错误）
- ✓ 构建通过
- ✓ 代码自审（self-review）
- ✓ 功能验证（与 specs 对齐）

**所有门禁都要符合才算完成：**
- Level 1 (Individual Gate) 全部通过
- Level 2 (Merge Gate) 全部通过
- Level 3 (System Gate) 全部通过
- 任何一层失败 → 针对性恢复或降级串行

## Product Form

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   spec-graph V3 架构（可靠性优先）                                 │
│                                                                  │
│   Layer A: Skills (方法论)                                        │
│   ──────────────────────────                                     │
│   原有 6 + 新增 10 = 16 skills:                                   │
│   • spec-graph-parallel (并行方法论 + 三层门禁)                   │
│   • spec-graph-worktree (worktree 方法论)                         │
│   • spec-graph-merge (merge 方法论)                               │
│   • spec-graph-integration-gate (整合门禁方法论)                 │
│   • spec-graph-parallel-recovery (并行恢复方法论)                 │
│   • spec-graph-sub-agent-methodology (sub-agent 执行标准)         │
│   • spec-graph-context-sharing (上下文共享方法论)                 │
│   • spec-graph-requirement-analysis (自适应深度)                 │
│   • spec-graph-ui-design                                          │
│   • spec-graph-user-stories                                        │
│   • spec-graph-dev-stories                                         │
│                                                                  │
│   Layer B: Core (决策 + 可靠性算法)                              │
│   ───────────────────────────────────                            │
│   原有 8 + 新增 4 = 12 modules:                                   │
│   • dependency-analyzer (任务依赖 + 保守 wave 生成)             │
│   • file-conflict-analyzer (文件冲突 + 保守判断)                │
│   • integration-gate (三层门禁)                                   │
│   • parallel-recovery (精准归因 + 针对性恢复)                    │
│                                                                  │
│   Layer C: Host Agent (宿主 agent 执行)                           │
│   ───────────────────────────────                                │
│   • sub-agent 并行执行（宿主原生）                                │
│   • worktree 管理（bash 命令）                                    │
│   • 顺序 merge（bash 命令）                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 并行开发成功率 ≥ 90%（串行 95%+）
- 并行开发平均速度 ≥ 2x 串行
- 任何失败都能精准归因
- 任何不可恢复的失败都自动降级串行
- 跨所有支持 sub-agent 的工具兼容
- V2 串行模式完全保留为默认

**Non-Goals:**
- 不追求并行成功率 100%（不现实）
- 不支持高风险任务并行（自动降级串行）
- 不自己实现 sub-agent 运行时
- 不自己管理 git worktree

## Decisions

### Decision 1: 可靠性优先，保守并行

**Choice:** 默认串行，只有显式指定 `--mode parallel` 且依赖/冲突分析通过才并行。

**Rationale:**
- 并行开发的可靠性天然低于串行
- 用户应该显式接受并行风险
- 保守策略避免并行失败带来的用户困扰

### Decision 2: 三层门禁（Integration Gate）

**Choice:** 并行执行经过三层门禁：Individual Gate → Merge Gate → System Gate。

**Rationale:**
- Individual Gate 保证每个 sub-agent 的产物质量
- Merge Gate 保证合并不会破坏产物
- System Gate 保证跨 sub-agent 的一致性
- 三层组合使并行可靠性接近串行

### Decision 3: 精准归因 + 针对性恢复

**Choice:** 失败时精准归因到具体 sub-agent，针对性恢复（只重试失败的 sub-agent）。无法归因时降级串行。

**Rationale:**
- 精准归因减少不必要的重试
- 针对性恢复节省资源
- 降级串行保证可用性

### Decision 6: dependsOn 由 agent 分析得出，非模板预设

**Choice:** task-decomposition 阶段的 agent 必须分析项目实际代码、specs、design，自行判断每个 task 的 dependsOn 和 file impact。planning 模块的 DOMAIN_TEMPLATES 只作为 hint（可选提示），不作为最终决策。

**Rationale:**
- 模板预设的 dependsOn 是通用模式，无法感知项目实际状态：
  - 例："auth-endpoints dependsOn: [user-model]" 是通用情况，但如果项目已有 user-model，则 dependsOn 应为 []
  - 例："login endpoint 还依赖 rate-limiting" 模板不知道这个隐含依赖
- Agent 读 specs/design/现有代码后能做出更精确的判断
- dependsOn 的精确定义决定了并行可行性（误判 = 文件冲突）
- 保守策略：agent 不确定时保留依赖（宁可串行，不要错并行）
- 用户可最终确认/覆盖 agent 的分析结果

**数据流:**
```
planning 模板 (hint)
    ↓
agent 分析 specs + design + 现有代码 → task-level dependsOn + files
    ↓
用户确认/覆盖
    ↓
dependency-analyzer (生成 waves)
file-conflict-analyzer (生成冲突矩阵)
```

**对比:**
| 维度 | 模板预设 dependsOn | agent 分析 dependsOn |
|------|-------------------|---------------------|
| 准确性 | 通用模式，不对应实际 | 基于实际代码，精确 |
| 维护 | 每新领域需新模板 | agent 自动分析 |
| 成本 | 一次性写模板 | 每次运行时 agent 分析 |
| 结果 | 可能多错判依赖，少并行 | 更精准，多并行机会 |

### Decision 4: Sub-agent 架构，宿主 agent 执行

**Choice:** spec-graph 作为 skill 提供方法论及决策算法，宿主 agent 用它的 sub-agent tool 执行并行。

**Rationale:**
- 所有主流 AI agent 工具（2026）都已支持 sub-agent
- Sub-agent 是宿主 agent 的原生能力，资源管理由宿主负责
- 符合 spec-graph 的 DNA："大脑不做手"
- 跨平台兼容（不绑定特定 agent 工具）
- 每个 sub-agent 有独立上下文，避免上下文污染

**Alternatives considered:**
- child_process.spawn → 拒绝：复杂，资源管理麻烦，只能在 CLI 独立运行
- 进程池 → 拒绝：过度设计，宿主 agent 已有优化
- Agent SDK 直接调用 → 拒绝：失去宿主工具集成特性

**Choice:** spec-graph 作为 skill 提供方法论，宿主 agent 用它的 sub-agent tool 执行并行。

**Rationale:**
- 所有主流 AI agent 工具（2026）都已支持 sub-agent：
  - Claude Code: Agent tool（并行多个子 agent）
  - OpenAI Codex CLI: Subagents（独立 context window）
  - Trae: Sub-agent（垂直拓扑）
  - Cursor: Parallel agents（最多 8 个并行）
  - Windsurf: Cascade agent
  - Qoder: Experts mode
- Sub-agent 是宿主 agent 的原生能力，资源管理由宿主负责
- 符合 spec-graph 的 DNA："大脑不做手"
- 跨平台兼容（不绑定特定 agent 工具）
- 每个 sub-agent 有独立上下文，避免上下文污染
- 失败归因精准（每个 sub-agent 独立）

**Alternatives considered:**
- child_process.spawn → 拒绝：复杂，资源管理麻烦，只能在 CLI 独立运行
- 进程池 → 拒绝：过度设计，宿主 agent 已有优化
- Agent SDK 直接调用 → 拒绝：失去宿主工具集成特性

### Decision 5: 上下文共享

**Choice:** 每个 sub-agent 接收完整项目上下文 + 项目总览 + 其他 sub-agent 的计划（只读）+ 共享方法论。

**Rationale:**
- 解决"上下文分散"问题
- 让 sub-agent 知道彼此在做什么，避免冲突
- 共享方法论保证产物风格一致

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 三层门禁开销大 | Medium | Low | 门禁算法轻量；并行节省的时间 > 门禁开销 |
| 精准归因错误 | Low | Medium | 降级串行作为 fallback |
| 上下文共享开销 | Low | Low | 共享文档精简 |
| 保守策略太保守 | Medium | Low | 用户可手动覆盖 |

## Open Questions

| Question | Answer |
|----------|--------|
| **Q1: System Gate 具体检查什么？** | 产物风格一致性、命名一致性、整合测试 |
| **Q2: 精准归因怎么做？** | 分析每个 sub-agent 的产物，对比 main 状态差异 |
| **Q3: 降级串行时是否丢失已完成工作？** | 否，已合并到 main 的工作保留，未合并的重做 |

## Performance Targets

| Metric | Target |
|--------|--------|
| 并行开发成功率 | ≥ 90% |
| 并行开发速度 | ≥ 2x 串行 |
| 精准归因成功率 | ≥ 85% |
| 自动降级成功率 | 100% (失败时总能降级串行) |

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│           V3 可靠性优先并行架构                                        │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  1. 上下文共享                                                  │  │
│   │     项目总览 + 其他 sub-agent 计划 + 共享方法论              │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                          ↓                                           │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  2. 宿主 agent 执行并行（sub-agent tool）                      │  │
│   │     ┌──────────┐  ┌──────────┐  ┌──────────┐                │  │
│   │     │ sub-A    │  │ sub-B    │  │ sub-C    │                │  │
│   │     └────┬─────┘  └────┬─────┘  └────┬─────┘                │  │
│   └──────────┼──────────────┼──────────────┼────────────────────┘  │
│              ↓              ↓              ↓                         │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  3. 三层门禁                                                   │  │
│   │                                                              │  │
│   │     Level 1: Individual Gate (每个 sub-agent 的产物)          │  │
│   │        ↓ pass                                                 │  │
│   │     Level 2: Merge Gate (合并到 main 后评估)                 │  │
│   │        ↓ pass                                                 │  │
│   │     Level 3: System Gate (整个 main 整合评估)                 │  │
│   │        ↓ pass                                                 │  │
│   │                                                              │  │
│   │     任何层失败 → parallel-recovery                             │  │
│   │        → 精准归因 → 针对性重试或降级串行                     │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                          ↓                                           │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  4. 继续执行下一个 wave 或下一个 stage                         │  │
│   └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Migration Plan

- V2 串行模式完全保留（默认）
- `--mode parallel` 启用并行
- `--mode auto` 自动判断（保守）
- 任何失败自动降级到 serial
- 降级信息记录在 trace log

## Rollback Plan

- `--mode serial` 恢复 V2 行为
- 任何并行失败 → 自动降级
- 用户可随时切回 serial
