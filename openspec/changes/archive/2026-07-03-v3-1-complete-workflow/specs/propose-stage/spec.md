# Propose Stage — Capability Spec

## ADDED Requirements

### Requirement: 9-Stage FSM

automator 模块 SHALL 支持 9-stage FSM，在 `specify` 之前添加 `propose` stage。

#### Scenario: New session starts at propose

WHEN 新 session 创建（`spec-graph plan` + `spec-graph confirm`）
THEN initial stage SHALL 为 `propose`
AND stage 顺序 SHALL 为：
  `propose → specify → design → tasks → implement → review → test → accept → integrate`

#### Scenario: v3.0 session backward compat

WHEN 加载 v3.0 session（stage 为 `specify` 或后续 stage）
THEN session SHALL 继续从原 stage 运行
AND 不强制回到 `propose`
AND `normalizeStage()` SHALL 处理 `plan` → `tasks` 的旧名称映射

#### Scenario: Stage type union

WHEN TypeScript 代码引用 `Stage` 类型
THEN `Stage` SHALL 包含 `propose`
AND `STAGES` 数组 SHALL 长度为 9
AND `STAGE_OUTPUTS` SHALL 包含 `propose` 的输出定义（`proposal.md`）

### Requirement: Propose Stage Gate

propose stage SHALL 有独立的 gate 配置，比 specify 宽松。

#### Scenario: Propose exit criteria

WHEN gate-enforcement 评估 propose stage 的 exit criteria
THEN SHALL 检查：
  - `proposal-exists`: proposal.md 存在
  - `proposal-problem-statement`: 包含问题陈述或 Why section
  - `proposal-personas`: 包含至少一个 user persona
  - `proposal-scope-outline`: 包含范围轮廓（What/How 高层描述）
AND SHALL 不检查 specify 的严格 criteria（如 US-xxx 格式、SHALL/MUST）

#### Scenario: Propose gate.yaml

WHEN `knowledge/stages/propose/gate.yaml` 加载
THEN SHALL 存在并定义 entry + exit criteria
AND entry SHALL 只要求 `plan-confirmed`
AND exit SHALL 为上述 4 个 criteria

#### Scenario: Propose vs specify gate difference

WHEN 同一个 proposal.md 分别通过 propose 和 specify gate
THEN propose gate SHALL pass（结构存在即可）
AND specify gate MAY fail（需要严格格式 + 验收标准）
AND 这符合 propose 是"初稿"、specify 是"细化"的设计意图

### Requirement: Propose Stage Dispatch

dispatch 模块 SHALL 为 propose stage 生成正确的 dispatch action。

#### Scenario: Propose stage action

WHEN dispatch 执行
AND 当前 stage 为 `propose`
THEN manifest SHALL 包含 1 个 `type: "perform_stage"` action
AND action 的 `agent_id` SHALL 为 `pm`
AND `model_tier` SHALL 为 `capable`
AND prompt SHALL 引导 agent 产出问题陈述 + personas + scope 轮廓
AND prompt SHALL 不包含 specify 的严格格式要求

#### Scenario: Propose and specify dispatch merge (optional)

WHEN dispatch 检测到 propose → specify transition
AND 协调者支持连续执行
THEN dispatch MAY 在单个 manifest 中包含 propose + specify 两个 actions
AND 两个 actions 的 `parallel_group` SHALL 相同（顺序执行）
AND pm agent SHALL 在同一个 session 内连续执行两个 stage

### Requirement: Propose Stage Knowledge

knowledge base SHALL 为 propose stage 提供方法论指导。

#### Scenario: Propose stage skills

WHEN knowledge-base 加载 propose stage 的 skills
THEN SHALL 包含：
  - `brainstorming`: 头脑风暴方法论（发散思维）
  - `problem-framing`: 问题框架化方法论
AND 这些 skills SHALL 和 specify 的 skills（requirement-analysis, design-thinking）不同

#### Scenario: Propose stage templates

WHEN dispatch 加载 propose stage 的 prompt template
THEN SHALL 包含 proposal.md 的初稿模板
AND 模板 SHALL 包含 sections：Why / User Personas / Scope Outline / Open Questions
AND 模板 SHALL 不包含 specify 的严格 spec 格式要求

## MODIFIED Requirements

### Requirement: Automator STAGES constant

automator 模块 SHALL 更新 STAGES 常量包含 propose。

#### Scenario: STAGES array update

WHEN 代码引用 `automator.STAGES`
THEN SHALL 返回 9 个 stage（不是 8 个）
AND 第一个 SHALL 为 `propose`
AND 最后一个 SHALL 为 `integrate`
