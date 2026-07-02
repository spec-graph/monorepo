## MODIFIED Requirements

### Requirement: FSM stage 'plan' renamed to 'tasks'

The 8-stage FSM SHALL use `tasks` as the name for the third stage (previously `plan`). The Stage type, STAGES array, and STAGE_OUTPUTS dictionary SHALL all use `tasks`.

#### Scenario: FSM stages enumeration
- **WHEN** `STAGES` constant is read
- **THEN** it SHALL contain `'tasks'` not `'plan'` in the third position

#### Scenario: Stage output directory
- **WHEN** the tasks stage runs
- **THEN** the artifact SHALL be written to `.spec-graph/sessions/<id>/tasks/tasks.md`

#### Scenario: Dispatch manifest stage name
- **WHEN** dispatch is called during the tasks stage
- **THEN** `manifest.current_stage` SHALL be `"tasks"`

### Requirement: Pack action bindings updated

Packs SHALL use `tasks` instead of `plan` as an action name in `agent_bindings` and `actions` arrays.

#### Scenario: Foundation pack bindings
- **WHEN** foundation.pack is loaded
- **THEN** agent_bindings SHALL contain `tasks: developer`, NOT `plan: developer`

#### Scenario: Pack on_transition
- **WHEN** a gate references the previous stage of implement
- **THEN** it SHALL reference `tasks`, NOT `plan`

### Requirement: Plan object name unchanged

The `Plan` TypeScript interface and the `plan` field in state.yaml SHALL remain unchanged. They refer to the strategic planning object, not the FSM stage.

#### Scenario: Plan type in code
- **WHEN** code refers to the strategic planning data
- **THEN** it SHALL use `Plan` (capital P) type and `state.yaml#plan` field

#### Scenario: CLI plan command unchanged
- **WHEN** user runs `spec-graph plan "<intent>"`
- **THEN** the command SHALL work as before (strategic planning)

### Requirement: Knowledge base directory renamed

The knowledge base directory for the tasks stage SHALL be `knowledge/stages/tasks/` (previously `knowledge/stages/plan/`).

#### Scenario: Gate config location
- **WHEN** gate-enforcement loads the tasks stage gate
- **THEN** it SHALL read from `knowledge/stages/tasks/gate.yaml`

#### Scenario: Methodology location
- **WHEN** prompt construction weaves methodology for tasks stage
- **THEN** it SHALL load from `knowledge/stages/tasks/skills/`
