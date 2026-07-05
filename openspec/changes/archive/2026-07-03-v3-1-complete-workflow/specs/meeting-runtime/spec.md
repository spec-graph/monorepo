# Meeting Runtime — Capability Spec

## ADDED Requirements

### Requirement: Meeting State Management

spec-graph SHALL 提供 meeting 状态管理模块，存储 meeting runtime state 到 `.spec-graph/meetings/`。

#### Scenario: Create meeting state

WHEN 协调者运行 `spec-graph meeting start <meeting-id>`
THEN spec-graph SHALL 从 graph.yaml 或 ad-hoc 声明加载 meeting 配置
AND SHALL 创建 `.spec-graph/meetings/<meeting-id>.yaml`
AND initial state SHALL 为：
  - `status: "in_progress"`
  - `current_round: 1`
  - `current_phase: meeting.declaration.rounds[0].phase`
  - `current_round_contributions: []`
  - `participants: meeting.declaration.participants[*].agent_id`

#### Scenario: Meeting not found

WHEN meeting id 不在 graph.yaml.meetings 中
AND 没有 ad-hoc 声明
THEN spec-graph SHALL 返回错误 "meeting not found"
AND 不创建任何状态文件

#### Scenario: Meeting already exists

WHEN `meeting start` 对已存在的 meeting
THEN spec-graph SHALL 返回错误 "meeting already exists"
AND 不覆盖现有状态

### Requirement: Meeting Round Progression

spec-graph SHALL 管理 meeting 的 round 推进，记录每轮贡献到 transcript。

#### Scenario: Record contribution

WHEN 协调者运行 `spec-graph meeting record <meeting-id> --participant <agent-id> --content <text> --type <type>`
AND meeting status 为 `in_progress`
THEN spec-graph SHALL 将 contribution 追加到 `current_round_contributions`
AND contribution SHALL 包含：participant, type, content, round, targets (可选)
AND 如果 participant 不在 meeting.participants 列表中 SHALL 返回错误

#### Scenario: Advance round

WHEN 协调者运行 `spec-graph meeting advance <meeting-id>`
THEN spec-graph SHALL：
  - 将 `current_round_contributions` 移入 `rounds[current_round]`
  - `current_round` 递增
  - `current_phase` 更新为下一 round 的 phase
  - 清空 `current_round_contributions`
AND 如果当前是最后一轮 SHALL 返回错误 "all rounds completed, use meeting complete"

#### Scenario: Advance with empty contributions

WHEN `meeting advance` 执行
AND `current_round_contributions` 为空
THEN spec-graph SHALL 仍然推进 round（允许空轮次）
AND SHALL 在 transcript 中标记该轮为空

### Requirement: Meeting Completion

spec-graph SHALL 在 meeting 完成时生成 transcript 和 output artifacts。

#### Scenario: Complete meeting

WHEN 协调者运行 `spec-graph meeting complete <meeting-id> --summary <text>`
THEN spec-graph SHALL：
  - 设置 `status: "completed"`
  - 设置 `completed_at: now()`
  - 设置 `convergence_summary: <text>`
  - 将 output_artifacts 链接到 session 的 artifact 目录
AND SHALL 记录 completion 到 audit log

#### Scenario: Complete with unresolved questions

WHEN meeting complete 执行
AND meeting 有 open_questions
THEN spec-graph SHALL 保留 open_questions 在 transcript 中
AND SHALL 不阻塞 completion
AND 协调者 SHALL 决定是否继续 workflow 或先解决 open_questions

#### Scenario: Abandon meeting

WHEN 协调者运行 `spec-graph meeting abandon <meeting-id> --reason <text>`
THEN spec-graph SHALL：
  - 设置 `status: "abandoned"`
  - 记录 abandon reason
AND SHALL 保留 transcript（不删除）

### Requirement: Meeting Dispatch Integration

dispatch 模块 SHALL 检测当前 stage 的 meeting 触发条件，生成 meeting dispatch action。

#### Scenario: Meeting detected on dispatch

WHEN dispatch 执行
AND graph.meetings 中某个 meeting 的 `on_actions` 包含当前 stage 的 action
THEN dispatch manifest SHALL 包含一个 `type: "meeting"` action
AND meeting action SHALL 包含：
  - `meeting_id`
  - `rounds`: 每轮的 prompt + phase + speakers
  - `participants`: 每个 participant 的 role + perspective
  - `output_artifacts`
AND meeting action 的 `parallel_group` SHALL 为 -1（不并行）

#### Scenario: Meeting action ordering

WHEN dispatch 生成 meeting + perform_stage actions
THEN meeting action SHALL 在 pipeline 首位
AND perform_stage actions SHALL 在 meeting 之后
AND 协调者 SHALL 先完成 meeting 再执行 perform_stage

#### Scenario: No meeting for stage

WHEN dispatch 执行
AND 当前 stage 没有匹配的 meeting
THEN manifest SHALL 不包含 meeting action
AND 行为 SHALL 和 v3.0 一致

### Requirement: Meeting Transcript Query

spec-graph SHALL 提供 transcript 查询接口。

#### Scenario: List active meetings

WHEN 协调者运行 `spec-graph meeting list`
THEN spec-graph SHALL 列出当前 session 的 meetings
AND SHALL 显示每个 meeting 的 status + current_round + participant_count

#### Scenario: View transcript

WHEN 协调者运行 `spec-graph meeting transcript <meeting-id>`
THEN spec-graph SHALL 输出完整的 transcript
AND 包含所有 rounds 的 contributions
AND 包含 convergence_summary（如果有）
AND 包含 open_questions（如果有）
