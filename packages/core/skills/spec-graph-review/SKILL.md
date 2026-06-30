---
name: spec-graph-review
description: "Generate multi-model review prompts (Claude / Codex / Gemini / custom) for an artifact. Each model gets a tailored system prompt and the distilled artifact content. spec-graph only generates prompts — does NOT invoke external models. AI agent (or user) is responsible for sending prompts to each model and reconciling findings. Use for dual-voice review, multi-model consensus, or focused quality gates."
---

# spec-graph review

为 artifact 生成多模型审查 prompts(Claude / Codex / Gemini)。

## Architecture Principle

**spec-graph 只生成 prompts — 不调用外部模型。**

- ❌ spec-graph 不会自动调用 Claude / Codex / Gemini API
- ❌ spec-graph 不会替你合并多模型审查结果
- ❌ spec-graph 不会替你决定哪个模型说得更对
- ✅ spec-graph 为每个模型生成定制 system_prompt + user_prompt
- ✅ spec-graph 自动蒸馏 artifact(默认 3000 字符上限)以省 token
- ✅ spec-graph 支持 `--save` 写入文件,便于 agent 分发到各模型

**Agent 的职责**:把生成的 prompt 发给对应模型,收集响应,对比冲突,更新 artifact。

## What this does

`review` 命令基于 artifact 内容生成多模型审查请求:

1. 在 `.spec-graph/artifacts/{requirements,design,plan,contract,verification,change-record,implementation,meta}/` 找 artifact 文件(.md / .yaml / .txt)
2. 读取完整内容
3. 默认用 distillator 蒸馏到 3000 字符上限(`--full` 关闭蒸馏)
4. 为每个指定模型生成 system_prompt(模型专属)+ user_prompt(包含 artifact 内容)
5. 输出格式:terminal 内联 / JSON / 写入文件(`--save`)

### 模型专属 system prompts

每个模型有定制化的审查重点:

| Model | 审查重点 | 输出格式 |
|-------|---------|---------|
| `claude` | Correctness / Completeness / Consistency / Clarity / Risks | Summary + Strengths + Issues(severity)+ Suggestions + Verdict(APPROVE/REQUEST_CHANGES/REJECT) |
| `codex` | Requirements coverage / Technical accuracy / Feasibility / Edge cases / Dependencies | Assessment(Pass/Fail + confidence)+ Findings + Blockers + Recommendations |
| `gemini` | Purpose alignment / Quality / Integration / Maintenance / Documentation | Overview + Detailed Findings + Action Items + Risk Assessment(L/M/H) |
| custom / 未知 | 通用 correctness + completeness + consistency + clarity | 通用结构化 review |

### 蒸馏策略

默认调用 `distillMarkdown(fullContent, { maxLength: 3000 })`:

- 保留 markdown 结构(标题 / 列表 / 表格)
- 移除冗余空白 / 注释 / 装饰
- 截断到 3000 字符上限

`--full` 关闭蒸馏,传完整内容(适合小型 artifact 或需要 100% 准确审查时)。

## Usage

```bash
# 默认: Claude + Codex 双模型审查(terminal 输出)
spec-graph review --artifact plan/tasks

# 三模型审查
spec-graph review --artifact design/arch --models "claude,codex,gemini"

# 聚焦特定维度
spec-graph review --artifact plan/tasks --focus "security,performance"

# 保存为文件(便于分发到各模型)
spec-graph review --artifact plan/tasks --save

# 包含完整 artifact(关闭蒸馏)
spec-graph review --artifact plan/tasks --full

# JSON 输出(便于程序化处理)
spec-graph review --artifact plan/tasks --json

# 组合用法
spec-graph review --artifact design/auth \
  --models "claude,codex,gemini" \
  --focus "security,oauth,token-refresh" \
  --save --full
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--artifact <id>` | ✅ Required | Artifact ID(不含路径,自动在 artifacts/ 子目录找) |
| `--models <list>` | ⚠️ Optional | 逗号分隔模型名(默认:`claude,codex`) |
| `--focus <areas>` | ⚠️ Optional | 逗号分隔审查重点(注入到 user_prompt) |
| `--full` | ⚠️ Optional | 包含完整 artifact(默认蒸馏到 3000 字符) |
| `--save` | ⚠️ Optional | 写入 `.spec-graph/reviews/<artifact>-<model>-review.md` |
| `--json` | ⚠️ Optional | JSON 输出(与 `--save` 互斥,`--save` 优先) |

### Artifact 搜索路径

`--artifact <id>` 不需要指定路径,spec-graph 按以下子目录顺序查找:

```
.spec-graph/artifacts/
├── requirements/<id>.md
├── design/<id>.md
├── plan/<id>.md
├── contract/<id>.md
├── verification/<id>.md
├── change-record/<id>.md
├── implementation/<id>.md
└── meta/<id>.md
```

(也尝试 `.yaml` 和 `.txt` 后缀)

## Execution Rules

### ✅ 何时使用

| 情况 | 是否运行 review |
|------|----------------|
| 设计文档 / 架构文档即将进入实现 | ✅ 强烈推荐(design → plan 之间) |
| 关键 artifact(安全 / 合规 / 核心 API) | ✅ 必须多模型审查 |
| 单一 agent 写的复杂 artifact | ✅ 用其他模型交叉验证 |
| gate 反复失败,需要外部视角 | ✅ 用 review 找盲点 |
| 用户对 artifact 质量有疑虑 | ✅ 用 review 提供独立评估 |
| 大型 plan MD(实现前) | ✅ review 后再 dispatch |

### ❌ 何时不使用

| 情况 | 替代做法 |
|------|---------|
| 简单 / 重复性 artifact(模板填充) | 跳过 review |
| 紧急 hotfix | 走 bugfix.pack 流程,跳过 review |
| artifact 还未完成(草稿) | 先完成,再 review |
| 想看 artifact 在 graph 中的位置 | 用 `spec-graph impact --artifact <id>` |
| 想检查 artifact 是否符合规范 | 用 `spec-graph check` / `spec-graph checklist` |

### 判断流程

```
artifact 写完
    ↓
是关键 artifact 吗?(design / contract / 大型 plan / 安全相关)
    ├── 是 → 选择模型组合
    │       ↓
    │       spec-graph review --artifact <id> --models "..." --focus "..." --save
    │       ↓
    │       agent 分发 prompt 到各模型
    │       ↓
    │       收集响应,对比 findings
    │       ↓
    │       findings 有冲突吗?
    │       ├── 是 → agent 判断 / 召开 meeting / 问用户
    │       └── 否 → 直接更新 artifact
    │       ↓
    │       重跑 gate 验证
    │
    └── 否(简单 artifact)
            ↓
            跳过 review,直接进下一步
```

## Agent Workflow

### Step 1: 选择模型组合

根据 artifact 类型和风险级别选择:

| 场景 | 推荐模型组合 | 理由 |
|------|-------------|------|
| 通用 design 文档 | `claude,codex` | 默认 dual-voice |
| 安全 / 合规相关 | `claude,codex,gemini` | 三模型交叉,提高覆盖 |
| 技术可行性评估 | `codex` 单独 | codex 擅长技术精度 |
| 整体质量评估 | `gemini` 单独 | gemini 擅长 holistic |
| 高风险 / 不可逆决策 | `claude,codex,gemini` | 全模型共识 |

### Step 2: 选择 focus(可选)

如果 artifact 有特定关注点,用 `--focus` 注入提示:

```bash
spec-graph review --artifact design/auth \
  --focus "security,oauth,token-refresh,csrf"
```

focus 会作为 `**Focus areas**: ...` 段插入 user_prompt。

### Step 3: 生成 review prompts

推荐用 `--save` 写入文件,便于分发:

```bash
spec-graph review --artifact design/auth \
  --models "claude,codex,gemini" \
  --focus "security,oauth" \
  --save

# 输出:
# ✓ Review prompts saved:
#   .spec-graph/reviews/design-auth-claude-review.md
#   .spec-graph/reviews/design-auth-codex-review.md
#   .spec-graph/reviews/design-auth-gemini-review.md
#
#   Send each file to the corresponding model for review.
```

### Step 4: 分发到各模型

Agent 把每个 review 文件发给对应模型(这一步 spec-graph 不做):

```
Claude review 文件 → 发给 Claude(可在另一会话)
Codex review 文件  → 发给 Codex CLI / API
Gemini review 文件 → 发给 Gemini API
```

每个文件包含完整的 system_prompt + user_prompt,可直接复制粘贴或 API 调用。

### Step 5: 收集响应并对比

收到三个模型的 review 后,agent 对比:

```
1. 三模型都指出的问题    → 高置信,必须修
2. 两模型指出的问题      → 中置信,需要判断
3. 仅一模型指出的问题    → 低置信,可选修
4. 模型间冲突的结论      → 需要决策(开会 / 问用户)
```

### Step 6: 更新 artifact

根据 review findings 修改 artifact:

```bash
# 直接编辑 artifact 文件
# (agent 用 Edit / Write 工具)
```

### Step 7: 重跑 gate 验证

```bash
spec-graph gate --artifact <id>
# 或
spec-graph check --artifact <id>
spec-graph checklist
```

### Step 8: (可选)沉淀 review 模式

如果某类 artifact 经常出同类问题:

- 把 focus 加入 pack template 的 review checklist
- 把 model 推荐组合加入 pack.yaml 的 review_defaults

## Usage Scenarios

### Scenario 1: 成功 — design 文档 dual-voice review

```bash
# design/auth 刚写完,准备进 plan 阶段
spec-graph review --artifact design/auth \
  --models "claude,codex" \
  --focus "security,oauth,token-refresh" \
  --save

# 输出两个文件:
# .spec-graph/reviews/design-auth-claude-review.md
# .spec-graph/reviews/design-auth-codex-review.md

# agent 分发:
# - claude-review.md → 在另一 Claude 会话执行
# - codex-review.md  → 在 Codex CLI 执行

# 收集两份 review,对比 findings:
# - Claude: "token refresh 逻辑缺失"
# - Codex:  "OAuth state 参数未校验"
# → 两个都修

# 更新 artifact,重跑 gate
```

### Scenario 2: 成功 — 三模型共识审查(高安全)

```bash
# 核心支付模块 contract
spec-graph review --artifact contract/payment \
  --models "claude,codex,gemini" \
  --focus "pci-dss,payment,security,compliance" \
  --save --full

# 用 --full 因为 contract 需要逐字审查(不能蒸馏)
# 三模型都说 OK → 高置信进入实现
# 任一模型 REQUEST_CHANGES → 必须修复
```

### Scenario 3: 成功 — JSON 输出用于程序化处理

```bash
# 想把 review prompts 通过 API 发给模型
spec-graph review --artifact plan/tasks --json > review-prompts.json

# 然后用脚本调用各模型 API
# jq '.reviews[] | select(.model=="claude") | .user_prompt' review-prompts.json
```

### Scenario 4: 成功 — 用 focus 收窄审查范围

```bash
# 只关心 plan 的性能维度
spec-graph review --artifact plan/api-optimization \
  --models "codex" \
  --focus "performance,latency,caching" \
  --save

# codex 收到 prompt 时,Focus areas 段会提示聚焦性能
```

### Scenario 5: 失败 — artifact 不存在

```bash
$ spec-graph review --artifact nonexistent
Error: Artifact 'nonexistent' not found in .spec-graph/artifacts.
Searched in: requirements, design, plan, contract, verification, change-record, implementation, meta

# 修复:列出可用 artifacts
ls .spec-graph/artifacts/*/
# 或查 graph
spec-graph compose --json | jq '.artifacts[].id'
```

### Scenario 6: 失败 — artifact 未通过 dispatch 生成

```bash
$ spec-graph review --artifact my-design
Error: Artifact 'my-design' not found...

# 原因:用户直接写了文件到 .spec-graph/artifacts/,未走 dispatch
# (违反 CLAUDE.md 的"禁止直接创建文档"规则)

# 修复:走正规流程
spec-graph change create --title "..." --type feature
spec-graph change apply <id>
spec-graph dispatch --json  # 由 dispatch 生成 artifact
```

### Scenario 7: 半成功 — 生成了但没分发

```bash
spec-graph review --artifact plan/tasks --save
# 文件生成了,但 agent 忘记发给模型

# 后果:review 文件躺在 .spec-graph/reviews/,无人响应
# 修复:agent 必须主动分发 + 收集 + 对比 + 应用
```

### Scenario 8: 半成功 — 三模型结论冲突

```bash
# Claude 说 "APPROVE"
# Codex  说 "REQUEST_CHANGES: 边界条件未覆盖"
# Gemini 说 "APPROVE with low risk"

# 决策原则:
# - 任一模型 REQUEST_CHANGES / REJECT → 必须处理
# - 2 vs 1 时,优先采纳更严格的结论
# - 不确定 → 召开 meeting / 问用户
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `✗ --artifact is required`(实际为 `Error: Artifact '<id>' not found`) | 未传 `--artifact` 或 artifact 不存在 | 加 `--artifact <id>` / 查可用 ID |
| `Artifact '<id>' not found in .spec-graph/artifacts` | ID 错误 / 文件未通过 dispatch 生成 | 查 graph / 走正规 change 流程 |
| `Graph not found`(review 自身不读 graph,但若间接调用) | 未 compose | `spec-graph compose` |
| review 文件未分发 | agent 流程缺失 | agent 必须主动分发到各模型 |
| 三模型冲突无法决策 | 模型间分歧 | 开 meeting / 问用户 / 选严格结论 |
| token 超限 | artifact 太大且用 `--full` | 移除 `--full`,用默认蒸馏 |

## 衔接关系

- **前置**: artifact 必须存在(由 `dispatch` 生成,不能手写)
- **依赖文件**: `.spec-graph/artifacts/{kind}/<id>.md`
- **生成文件**: `.spec-graph/reviews/<artifact>-<model>-review.md`(仅 `--save`)
- **下游使用**:
  - agent 分发到各模型(手动 / API 调用)
  - 收集响应,更新 artifact
  - 重跑 `spec-graph gate` / `spec-graph check` / `spec-graph checklist`
- **配合命令**:
  - `spec-graph impact --artifact <id>` — 看 artifact 的影响范围(配合 review 决定严重性)
  - `spec-graph distill` — 手动蒸馏大 artifact(若默认蒸馏不够)
  - `spec-graph meeting init` — 模型冲突时开会
- **协作**: spec-graph 生成 prompt,agent 是分发者 + 协调者,各 AI 模型是审查员,用户是最终决策者(冲突时)。

## 注意事项

- **不调用 API**: spec-graph 只生成 prompt 文本,不会调用 Claude/Codex/Gemini API。分发是 agent 的责任。
- **蒸馏上限**: 默认 3000 字符,大 artifact 用 `--full` 但注意 token 成本。
- **模型 prompt 写死**: claude/codex/gemini 的 system_prompt 在 `src/engine/review/index.ts` 中硬编码,自定义需修改源码或用 custom(走 DEFAULT_SYSTEM_PROMPT)。
- **互斥输出**: `--save` 优先于 `--json`,二者都加时只 save 不打 JSON。
- **文件覆盖**: 多次运行同一 artifact + model 会覆盖之前的 review 文件。
- **不修改 artifact**: review 命令只读 artifact,不修改。修改由 agent 根据响应执行。
