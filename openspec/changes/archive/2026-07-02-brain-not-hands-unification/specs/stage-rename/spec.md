## MODIFIED Requirements

### Requirement: FSM stage renamed from 'plan' to 'tasks'

The 8-stage FSM SHALL use `tasks` as the name for the third stage.

#### Scenario: Stage enumeration
- **WHEN** `STAGES` constant is read
- **THEN** it SHALL contain `'tasks'` not `'plan'`

#### Scenario: Stage output
- **WHEN** the tasks stage runs
- **THEN** artifact SHALL be at `.spec-graph/sessions/<id>/tasks/tasks.md`

#### Scenario: Backward compatibility
- **WHEN** an old session has `stage: "plan"` in state.yaml
- **THEN** dispatch SHALL automatically map it to "tasks"

### Requirement: Plan command and Plan type unchanged

The `spec-graph plan` CLI command and `Plan` TypeScript interface SHALL remain unchanged. They refer to strategic planning, not the FSM stage.

#### Scenario: Plan command still works
- **WHEN** user runs `spec-graph plan "<intent>"`
- **THEN** it SHALL create a session with capabilities
