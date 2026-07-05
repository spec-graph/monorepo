# Planning LLM 化 — Capability Spec

## ADDED Requirements

### Requirement: Planning Manifest Generation

`spec-graph plan` 命令 SHALL 生成 planning manifest（DispatchManifest 变体），而不是直接分解意图。manifest 包含 planning agent 所需的 prompt + JSON schema 约束。

#### Scenario: Standard planning dispatch

WHEN 用户运行 `spec-graph plan "Build JWT auth system"`
THEN spec-graph SHALL 输出 planning manifest JSON（type: "planning"）
AND manifest 包含 planning agent 的 prompt（含 intent + profile + schema 约束）
AND manifest 的 `model_tier` SHALL 为 "capable"
AND 不直接创建 session

#### Scenario: Offline fallback

WHEN 用户运行 `spec-graph plan "intent" --fallback`
OR 无外部协调者可用
THEN spec-graph SHALL 使用关键词匹配（DOMAIN_TEMPLATES）分解意图
AND 直接创建 session（当前行为）
AND 输出 warning: "planning LLM failed, used keyword fallback"

### Requirement: Plan JSON Schema Validation

planning 模块 SHALL 验证 agent 返回的 JSON 符合 Plan JSON Schema。

#### Scenario: Valid JSON response

WHEN planning agent 返回符合 schema 的 JSON
THEN `planning.validatePlanOutput(json)` SHALL 返回 `PlanOutput`
AND session SHALL 使用该 plan 创建

#### Scenario: Invalid JSON response

WHEN planning agent 返回的 JSON 不符合 schema
THEN `planning.validatePlanOutput(json)` SHALL 返回 `ValidationError`
AND 错误 SHALL 包含具体的字段和原因
AND 系统 SHALL 使用错误信息重新构造 prompt 并重试（最多 2 次）
AND 如果 2 次重试仍失败 SHALL 回退到 `--fallback` 路径

#### Scenario: JSON Schema 字段约束

WHEN 验证 plan JSON
THEN `capabilities` MUST 是数组，至少 1 项，最多 15 项
AND 每个 capability 的 `id` MUST 匹配正则 `^[a-z][a-z0-9-]*$`
AND 每个 capability 的 `description` MUST 至少 10 字符
AND `complexity` MUST 是 "low" | "medium" | "high" 之一
AND `order` MUST 是 `capabilities[*].id` 的排列
AND `risks` 和 `openQuestions` 可选

### Requirement: Planning Agent Prompt

planning manifest 的 prompt SHALL 包含足够的上下文让 agent 做出正确的意图分解。

#### Scenario: Prompt content

WHEN 生成 planning manifest
THEN prompt SHALL 包含：
  - 用户原始 intent
  - 项目 profile（来自 sense 模块）
  - Plan JSON Schema
  - 知识库上下文（从 knowledge/shared/ 加载）
  - 示例 plan（few-shot）

#### Scenario: Planning agent role

WHEN dispatch planning agent
THEN manifest 的 `agent_id` SHALL 为 "planner"
AND `model_tier` SHALL 为 "capable"
AND prompt SHALL 明确指示 agent 输出符合 schema 的 JSON
