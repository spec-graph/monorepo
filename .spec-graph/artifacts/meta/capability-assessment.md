# spec-graph 能力评估报告

## 评估日期: 2026-06-28 (更新)

---

## 一、基础设施评分

| 维度 | 状态 | 评分 |
|------|------|------|
| 测试覆盖 | 546 tests, 42 files, 100% pass | ⭐⭐⭐⭐⭐ |
| 类型安全 | tsc --noEmit zero errors | ⭐⭐⭐⭐⭐ |
| 文档系统 | 32 docs, 7 templates, 45+ archived changes | ⭐⭐⭐⭐⭐ |
| Agent 协议 | 6 agent prompts + coordinator protocol | ⭐⭐⭐⭐⭐ |
| 状态机 | 8 stages, 7 gates, 23 checks | ⭐⭐⭐⭐⭐ |
| Hooks 系统 | dispatch + machine transition hooks | ⭐⭐⭐⭐ |
| 代码库扫描 | 22 维度检测 (brownfield 支持) | ⭐⭐⭐⭐⭐ |
| 影响分析 | 增量依赖分析 (ripple effect) | ⭐⭐⭐⭐⭐ |
| 文档解析 | Checklist 自动检测模糊形容词 | ⭐⭐⭐⭐⭐ |

---

## 二、新项目开发支持能力

### ✅ 已具备

1. **项目初始化**: init → sense → compose 一键生成 workflow
2. **文档模板**: 7 种文档类型都有 frontmatter + 完整结构
3. **质量门**: 每个阶段转移都有 gate 强制检查
4. **追溯**: 所有 artifact 关系可追踪
5. **checklist**: 5 机械 + 5 软检查（模糊形容词自动检测）
6. **constitution**: 版本化质量标准
7. **contract 系统**: 契约联邦 + 漂移检测
8. **meeting 协议**: 多 agent 协作讨论
9. **multi-unit**: 大 story 可拆分并行开发

### ⚠️ 关键缺口

**1. 没有代码生成能力** (⚠️ 设计如此，不是 bug)
spec-graph 是中立引擎，不调用 LLM API，不 dispatch sub-agent，不生成代码。
代码生成依赖于外部 coordinator (Claude/Codex) + 子 agent。

**2. Auto-loop 依赖纪律** (⚠️ 人的问题，不是代码问题)
工作流自动推进依赖主 agent 看到 hook 注入后严格执行 auto-loop 协议。
CLAUD.md 和 coordinator-protocol.md 已明确规定了纪律，
但执行取决于主 agent 是否遵守。

**3. 缺失"了解现有代码"的能力**
Sense 只能检测 package.json 等标志文件，不能分析现有代码结构。
对于接手老项目，需要 AI agent 自行阅读代码，spec-graph 不提供这个能力。

**4. 没有代码测试反馈循环**
Check 系统可以运行 lint/typecheck/unit-test，但没有自动修复的能力。
check 失败后需要 AI agent 手动修复，spec-graph 不会自动重试。

---

## 三、老项目接手能力

### ✅ 已具备

1. **brownfield 识别**: profile.facts.field 可设为 brownfield
2. **project config 注入**: 可注入项目特定上下文 (context/rules/references)
3. **constitution diff**: 可对比新旧质量标准
4. **contract drift**: 可检测契约版本漂移

### ⚠️ 关键缺口

**1. 无代码库扫描**
spec-graph 不分析现有代码库的架构、依赖、代码质量。
接手老项目的"了解现状"阶段完全依赖 AI agent 自行阅读代码。

**2. 无迁移规划**
没有"从旧架构迁移到新架构"的路径规划能力。
migration-plan artifact 只是一个 markdown 模板，不包含智能分析。

**3. 无增量变更追踪**
ChangeDescriptor 记录了变更元数据，但不追踪"哪些代码被改了"、
"新功能影响了哪些旧代码"等。

---

## 四、自动化驱动开发可行性评估

### 场景 1: 全新 Web 项目

**流程**:
```
init → sense → compose → dispatch → AI 读 manifest → 
AI 写 PRD → AI 写架构 → AI 写 stories → AI 写 tasks → 
AI 生成代码 → AI 运行测试 → AI 标记完成 → dispatch → ...
```

**可行性**: ⭐⭐⭐⭐ (80%)
- ✅ 工作流定义完整
- ✅ 文档模板齐全
- ✅ 质量门和 checklist 到位
- ⚠️ 代码生成完全依赖 AI agent
- ⚠️ Auto-loop 依赖纪律

### 场景 2: 接手老项目加新功能

**流程**:
```
init(sense 识别 brownfield) → compose → dispatch → 
AI 读现有代码 → AI 分析架构 → AI 写新功能 PRD → ...
```

**可行性**: ⭐⭐⭐ (60%)
- ✅ brownfield 识别
- ✅ project config 注入
- ⚠️ 无代码分析能力
- ⚠️ 无架构理解能力
- ⚠️ 依赖 AI agent 自行阅读代码

### 场景 3: 老项目重构

**可行性**: ⭐⭐ (40%)
- ⚠️ 无代码质量分析
- ⚠️ 无重构路径规划
- ⚠️ 无自动化测试覆盖率分析
- ⚠️ 完全依赖 AI agent 理解代码

---

## 五、结论与建议

### 总体评估: 🟡 基本可用，核心缺口明确

spec-graph 在 **工作流管理、文档系统、质量门、追溯** 方面表现优秀，
但在 **代码理解、自动修复反馈循环** 方面存在设计性缺口。

### 立即可达成的能力

1. **新项目规划**: 可以自动驱动文档生成流程（PRD → 架构 → story → task）
2. **质量保证**: 可以自动检查文档质量和结构完整性
3. **追溯审计**: 可以追踪所有 artifact 的来源和依赖关系

### 需要补充的能力（建议优先做）

1. **代码扫描增强**: Sense 阶段增加代码结构分析（AST 解析、依赖图）
2. **自动重试**: check 失败后自动重试（带退避）
3. **增量影响分析**: change 影响范围自动计算
4. **重构安全网**: characterization test + 不变量检查
5. **现有代码分析**: 接手老项目时自动分析代码结构和质量

### 无需 spec-graph 做的事（AI agent 的职责）

- 代码生成（LLM 能力，spec-graph 不应替代）
- 代码阅读和理解（AI agent 的自然能力）
- Bug 修复（需要人类判断或 LLM 推理）
- 需求理解和翻译（LLM 能力）

### 最终判断

**spec-graph 已经可以支持文档层面的自动规划开发**（生成 PRD、架构、story、task）。
**但还无法支持代码层面的自动执行**（代码生成、测试、调试），
这不是设计缺陷——spec-graph 的定位就是"工作流管理 + 状态追踪"，不是"代码生成"。

**对于"接手老项目完成新功能的迭代开发"**，spec-graph 提供了工作流框架，
但 AI agent 需要自行阅读和理解老代码，spec-graph 目前没有提供这个辅助能力。

**建议**: 
1. 增强 Sense 阶段的代码扫描能力（最高优先级）
2. 实现 check 失败后的自动重试机制
3. 实现增量影响分析
4. 在项目中正式使用 spec-graph 驱动开发，验证实际效果
