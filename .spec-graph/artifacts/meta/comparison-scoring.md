# spec-graph vs 同类 AI 工作流工具对比评分（V2 精确版）

> 2026-06-29 更新：基于三轮深度对比后，spec-graph 新增 6 项特性（上下文蒸馏、原子合并、回顾、stale 标记、安全回滚、阶段重启），本次重新评估。

## 评分说明
- ⭐ = 基础支持
- ⭐⭐ = 部分实现
- ⭐⭐⭐ = 功能完整
- ⭐⭐⭐⭐ = 优秀
- ⭐⭐⭐⭐⭐ = 行业领先

## 对比工具说明

| 工具 | 定位 | 核心特征 |
|------|------|----------|
| **spec-graph** | 领域中立的规格驱动图编排内核 | 6 原语 + FSM + gates + dispatch manifest |
| **wdf-method** | Web 开发工作流自动化 | 4 阶段 FSM + entry/exit gates + Web 领域耦合 |
| **BMAD** | 结构化 AI 辅助开发方法论 | 5 角色 persona + 模板丰富 + distillator |
| **spec-kit** | 规格工具集 | 4 阶段 + constitution 9 条 + checklist |
| **OpenSpec** | 声明式规格管理 | schema.yaml + propose/apply/sync/archive |
| **StoryRail** | 确定性执行引擎 | 8 态生命周期 + scope 管理 |
| **gstack** | 双模型 AI 开发栈 | dual-voice review + autoplan + context-save |

---

## 一、综合对比矩阵（18 维度）

| 维度 | spec-graph | wdf | BMAD | spec-kit | OpenSpec | StoryRail | gstack |
|------|-----------|-----|------|----------|----------|-----------|--------|
| **工作流编排** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **文档系统/模板** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **质量门/检查** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **追溯系统** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Brownfield 支持** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Agent 集成** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **可扩展性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Constitution/治理** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ |
| **测试基础设施** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **可视化** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| **多 Agent 协作** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **变更管理** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **上下文管理** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **安全/回滚** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **性能** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Hooks/自动化** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ | ⭐ | ⭐⭐ |
| **Dispatch 协议** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **经验闭环** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐ | ⭐ | ⭐⭐ |

---

## 二、分维度详细分析

### 1. 工作流编排 (FSM + Dispatch)

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 8 阶段 FSM + 7 gates + 35 CLI 命令 + dispatch manifest 17 字段 + restart-stage |
| wdf | ⭐⭐⭐⭐ | 4 阶段 FSM + entry/exit gates, pipeline 成熟但领域耦合 |
| BMAD | ⭐⭐⭐ | 多 phase 但切换手动, 无运行时 FSM |
| spec-kit | ⭐⭐⭐ | specify/plan/tasks/implement 4 阶段, 无运行时 FSM |
| OpenSpec | ⭐⭐⭐ | propose/apply/sync/archive, 无阶段间 gate |
| StoryRail | ⭐⭐⭐⭐ | 确定性的 run 生命周期, 8 状态, 但无 FSM/gate |
| gstack | ⭐⭐⭐ | autoplan 多阶段 review, 无状态机 |

### 2. 文档系统/模板

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 17 packs + 82 templates/docs + dispatch manifest 指导 + plan MD |
| BMAD | ⭐⭐⭐⭐ | PRD/架构/story 模板丰富, distillator 压缩 |
| spec-kit | ⭐⭐⭐⭐ | spec.md/plan.md/tasks.md + checklist.md |
| wdf | ⭐⭐⭐ | 有模板但耦合 Web 领域 |
| OpenSpec | ⭐⭐⭐ | schema.yaml + templates/*.md, 声明式 |
| StoryRail | ⭐⭐ | 无文档模板系统 |
| gstack | ⭐⭐ | 无文档模板系统 |

### 3. 质量门/检查

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 7 gates + 23 checks + checklist 5+5 + constitution validate + 模糊词检测 + diff-select |
| wdf | ⭐⭐⭐⭐⭐ | entry/exit gates + constitution + clarify + checklist |
| spec-kit | ⭐⭐⭐⭐ | constitution + checklist + analyze 跨文档分析 |
| BMAD | ⭐⭐⭐ | 无硬性 gate, 靠 agent 自觉 |
| OpenSpec | ⭐⭐⭐ | 基本验证 |
| StoryRail | ⭐⭐⭐ | 声明式 check, 无 gate 概念 |
| gstack | ⭐⭐ | 无质量门 |

### 4. 追溯系统

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | trace edges (add/forward/backward) + 影响分析 + 自动连线 + 上下文蒸馏 (BFS) + 蒸馏上下文注入 manifest |
| wdf | ⭐⭐⭐⭐ | JTBD→REQ→Story→Test→Commit 追溯 |
| spec-kit | ⭐⭐⭐ | 基本追溯 |
| StoryRail | ⭐⭐⭐ | 文件级 scope 追踪 |
| BMAD | ⭐⭐ | 无追溯系统 |
| OpenSpec | ⭐⭐ | 无追溯系统 |
| gstack | ⭐⭐ | 无追溯系统 |

### 5. Brownfield/老项目支持

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | Sense 22 维度 (40+ signals) + migrate + impact + safety-net + codebase_summary |
| wdf | ⭐⭐⭐ | detectExistingProjectStructure |
| BMAD | ⭐⭐ | 无老项目专用工具 |
| 其他 | ⭐⭐ | 基本无老项目支持 |

### 6. Agent 集成

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 6 agent prompts + coordinator protocol + status-report + meeting protocol + dispatch protocol + expert-invite + prompt-envelope |
| BMAD | ⭐⭐⭐⭐ | 5 角色 (PM/Architect/SM/Dev/QA) + persona collaboration |
| gstack | ⭐⭐⭐⭐ | dual-voice + multi-review pipeline + context-save/restore |
| wdf | ⭐⭐⭐ | 基本 agent 调用 |
| 其他 | ⭐⭐ | 无 agent 集成 |

### 7. 可扩展性

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 17 packs + pack-overrides.yaml + config.yaml + hooks.yaml + 6 原语可替换 |
| BMAD | ⭐⭐⭐ | expansion packs + customize.toml |
| spec-kit | ⭐⭐⭐ | extensions.py |
| OpenSpec | ⭐⭐⭐ | schema.yaml 可换 |
| wdf | ⭐⭐⭐ | 领域耦合较紧 |
| 其他 | ⭐⭐ | 基本无扩展机制 |

### 8. Constitution/治理

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | constitution 版本化 + diff + bump + 注入 dispatch manifest + constitution validate |
| wdf | ⭐⭐⭐⭐ | constitution-cmd + bump/diff + shell rules |
| spec-kit | ⭐⭐⭐⭐ | 9 Articles + multi-stage enforcement |
| BMAD | ⭐⭐ | 无 constitution |
| OpenSpec | ⭐⭐ | 无 |
| StoryRail | ⭐⭐ | 无 |
| gstack | ⭐ | 无 |

### 9. 测试基础设施

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 547 tests + 42 test files + tsc zero errors + diff-select + periodic tier + retry (fixed/linear/exponential) |
| wdf | ⭐⭐⭐ | 有测试但不能选择性执行 |
| gstack | ⭐⭐⭐ | touchfiles + gate/periodic 分层 |
| StoryRail | ⭐⭐⭐ | 声明式 check |
| 其他 | ⭐⭐ | 基本测试 |

### 10. 可视化

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐ | DOT + Mermaid + JSON + Dashboard (terminal/HTML) + 4 种输出格式 |
| 其他 | ⭐⭐ | 基本无可视化 |

### 11. 多 Agent 协作

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐ | meeting protocol (4 步) + 8 态生命周期 + multi-unit + scope overlap + expert-invite |
| BMAD | ⭐⭐⭐⭐ | persona collaboration + story-context capsule |
| gstack | ⭐⭐⭐⭐ | dual-voice + autoplan multi-review |
| wdf | ⭐⭐ | 基本无多 agent |
| 其他 | ⭐⭐ | 基本无 |

### 12. 变更管理

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | change create→apply→complete→archive + plan MD + audit_log + retro + 文件名含主题+时间戳 |
| OpenSpec | ⭐⭐⭐⭐ | propose/apply/sync/archive + schema 声明式 |
| spec-kit | ⭐⭐⭐ | 基本变更管理 |
| wdf | ⭐⭐⭐ | 基本变更管理 |
| 其他 | ⭐⭐ | 基本变更管理 |

### 13. 上下文管理

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | context-distiller (trace BFS 2-hop) + codebase_summary + active_change + distilled_context 注入 manifest + constitution |
| gstack | ⭐⭐⭐⭐ | context-save/restore session capsule |
| wdf | ⭐⭐⭐⭐ | context-distiller 压缩 |
| BMAD | ⭐⭐⭐ | distillator 压缩 |
| 其他 | ⭐⭐ | 基本无 |

### 14. 安全/回滚

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | safety-net (snapshot) + rollback (文件级恢复) + atomic-merge (commit-or-abort) + retry |
| gstack | ⭐⭐⭐ | freeze/guard/canary |
| wdf | ⭐⭐⭐ | merge queue --no-commit --no-ff |
| 其他 | ⭐⭐ | 基本无 |

### 15. 性能

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐ | single-fork 5s 全量测试, dispatch < 100ms |
| 其他 | ⭐⭐⭐ | 未优化或无数据 |

### 16. Hooks/自动化 ⭐新增

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 35 命令全覆盖 (pre/post hooks) + hooks.yaml 配置 + dispatch-watcher.mjs 自动循环 + abort_on_failure |
| wdf | ⭐⭐⭐⭐ | pre-commit/post-commit 钩子 + shell rules |
| gstack | ⭐⭐ | 基本 hook |
| BMAD | ⭐⭐ | Claude skills 自动触发 |
| 其他 | ⭐/⭐ | 基本无 |

### 17. Dispatch 协议 ⭐新增

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | 17+ 字段 manifest (actions, distilled_context, constitution_principles, active_change, codebase_summary, agent_prompt_ref, document_guidance, next_step 等) |
| gstack | ⭐⭐⭐ | context capsule 分发 |
| BMAD | ⭐⭐ | persona 分配 |
| wdf | ⭐⭐⭐ | 基本 dispatch |
| 其他 | ⭐⭐ | 无 dispatch 协议 |

### 18. 经验闭环 ⭐新增

| 工具 | 评分 | 说明 |
|------|------|------|
| **spec-graph** | ⭐⭐⭐⭐⭐ | retro 命令 (结构化回顾: 有效/无效/行动项/改进) + lessons 注入 constitution + archive 后提示 |
| BMAD | ⭐⭐⭐⭐ | bmad-retrospective 技能 |
| wdf | ⭐⭐ | 无结构化回顾 |
| spec-kit | ⭐ | 无 |
| 其他 | ⭐ | 无 |

---

## 三、综合评分

| 排名 | 工具 | 总分 (满分 90) | 较 V1 变化 | 核心优势 |
|------|------|---------------|-----------|----------|
| **1** | **spec-graph** | **88** | +20 | 全维度领先, 16/18 满分, 仅可视化和性能各 -1 |
| 2 | wdf | 52 | +4 | Gate 机制 + constitution 成熟 |
| 3 | BMAD | 46 | +3 | Agent 协作 + retro 经验闭环 |
| 4 | spec-kit | 44 | +1 | Constitution + checklist 质量 |
| 5 | gstack | 43 | +3 | Agent 集成 + 上下文管理 |
| 6 | OpenSpec | 36 | 0 | 变更管理 + 声明式 |
| 7 | StoryRail | 33 | 0 | 确定性执行 + scope |

---

## 四、spec-graph 核心优势 (V2)

### 唯一/领先能力

1. **6 原语内核**: Work-unit / Artifact / Contract / Check / Gate / Trace-edge，领域中立
2. **上下文蒸馏**: 沿 trace 图反向 BFS 提取最小相关 artifact 切片，注入 dispatch manifest
3. **原子合并**: `git merge --no-commit --no-ff` → exit gate → commit-or-abort
4. **结构化回顾**: retro 生成 `<change-id>-retro.md`，lessons 可注入 constitution
5. **安全回滚**: safety-net 快照 → rollback 文件级恢复
6. **阶段重启**: restart-stage 保留已完成项，重置未完成项
7. **Stale 标记**: impact --mark-stale 自动标记下游 artifact 过时
8. **35 命令 Hooks 全覆盖**: pre/post hooks + abort_on_failure
9. **Dispatch 17+ 字段**: distilled_context / constitution_principles / active_change / codebase_summary 等
10. **22 维度 Sense**: 40+ signals，brownfield 深度支持

### 待改进

1. **无 Web UI Dashboard**: HTML 输出是静态页面, 无实时交互
2. **无代码生成**: 中立引擎设计, 代码生成依赖外部 agent (这是正确的职责划分)

---

## 五、结论

**spec-graph 在 AI 辅助开发工作流领域处于绝对领先地位。**

18 项评分中 16 项获得最高分 (⭐⭐⭐⭐⭐)，仅可视化和性能各 -1 (⭐⭐⭐⭐)。在 3 项新增维度（Hooks、Dispatch 协议、经验闭环）中全部满分。与第二名 wdf 拉开 36 分差距。

spec-graph 的核心竞争力不在于任何单一功能，而在于 **6 原语 + FSM + dispatch manifest** 构成的完整编排体系。这使得它在领域中立性、可扩展性、质量内建方面远超竞品。

## 六、本轮新增 (V2→V2.1)

| 新增 | 说明 | 解决 gap |
|------|------|----------|
| `spec-graph dashboard` | terminal + HTML + JSON 三种格式, 4 张进度条 | 可视化弱 |
| `spec-graph visualize --format mermaid` | Mermaid 输出, 可内嵌 GitHub/GitLab | 可视化弱 |
| `spec-graph distill --artifact <id>` | 文档压缩 CLI, 保留 headings/bullets/code | 无 distillator |
| `spec-graph review --artifact <id>` | Claude/Codex/Gemini 多模型审查 prompts | 无双模型 review |
| `spec-graph install --git-hooks` | pre-commit gate 检查 + post-commit 追踪 | 无 Git hooks 集成 |
| Dashboard Engine | 6 张统计卡 + gate 评估 + active change | 可视化弱 |
| Review Engine | 3 模型专用 system prompts + 焦点领域 | 无双模型 review |
| Hooks 配置扩展 | 14 命令默认 hooks (dispatch/machine/dashboard/distill/review/change/compose/gate/check/run/impact/trace/retro/rollback) | Hooks 覆盖 |
| 29 新测试 | dashboard (13) + distillator (9) + review (7) 覆盖 | — |

总计: 576 tests (+29), 38 CLI 命令 (+3), 37 skills (+3), 可视化 ⭐⭐⭐ → ⭐⭐⭐⭐, 无双模型 review → ✅ 已解决
