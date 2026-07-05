## MODIFIED Requirements

### Requirement: FSM stage renamed from 'plan' to 'tasks'

The 8-stage FSM SHALL use `tasks` as the name for the third stage instead of `plan`.

#### Scenario: Stage enumeration
- **WHEN** `STAGES` constant is read
- **THEN** it SHALL contain `'tasks'` not `'plan'`
- **AND** the array SHALL be:
  ```typescript
  const STAGES = [
    'specify', 'design', 'tasks', 'implement',
    'review', 'test', 'accept', 'integrate'
  ] as const
  ```

#### Scenario: Stage type union
- **WHEN** `Stage` type is inferred from STAGES
- **THEN** it SHALL be:
  ```typescript
  type Stage = 'specify' | 'design' | 'tasks' | 'implement' |
               'review' | 'test' | 'accept' | 'integrate'
  ```
- **AND** it SHALL NOT include `'plan'`

#### Scenario: Stage output
- **WHEN** the tasks stage runs
- **THEN** artifact SHALL be at `.spec-graph/sessions/<id>/tasks/tasks.md`
- **AND** `STAGE_OUTPUTS.tasks` SHALL be `['tasks.md']`

#### Scenario: nextPrompt methodology selection
- **WHEN** `nextPrompt` function is called for tasks stage
- **THEN** it SHALL check `stage === 'tasks'` (not `'plan'`)
- **AND** it SHALL call `methodologyTasks(...)` (renamed from `methodologyPlan`)

#### Scenario: dispatch STAGE_OUTPUT_MAP
- **WHEN** dispatch generates manifest for tasks stage
- **THEN** `STAGE_OUTPUT_MAP.tasks` SHALL be `'tasks'`
- **AND** output path SHALL be `tasks/tasks.md`

### Requirement: Knowledge directory renamed

The knowledge directory for the tasks stage SHALL be renamed from `plan/` to `tasks/`.

#### Scenario: Directory structure
- **WHEN** knowledge directories are inspected
- **THEN** `packages/core/knowledge/stages/tasks/` SHALL exist
- **AND** `packages/core/knowledge/stages/plan/` SHALL NOT exist

### Requirement: Pack agent_bindings updated

All pack files SHALL use `tasks:` instead of `plan:` in agent_bindings.

#### Scenario: foundation.pack agent_bindings
- **WHEN** `packages/core/packs/foundation.pack/pack.yaml` is inspected
- **THEN** agent_bindings SHALL contain:
  ```yaml
  agent_bindings:
    specify: [pm]
    design: [architect]
    tasks: [developer]
    implement: [developer]
    ...
  ```
- **AND** it SHALL NOT contain `plan:` key

#### Scenario: ddd.pack agent_bindings
- **WHEN** `packages/core/packs/ddd.pack/pack.yaml` is inspected
- **THEN** agent_bindings SHALL contain `tasks:` (not `plan:`)

### Requirement: Pack actions arrays updated

All pack files SHALL use `'tasks'` instead of `'plan'` in actions arrays.

#### Scenario: foundation.pack actions
- **WHEN** `packages/core/packs/foundation.pack/pack.yaml` is inspected
- **THEN** actions array SHALL contain:
  ```yaml
  actions:
    - specify
    - design
    - tasks
    - implement
    ...
  ```
- **AND** it SHALL NOT contain `'plan'`

#### Scenario: ddd.pack actions
- **WHEN** `packages/core/packs/ddd.pack/pack.yaml` is inspected
- **THEN** actions array SHALL contain `'tasks'` (not `'plan'`)

### Requirement: Pack gate on_transition updated

All pack files SHALL use `[tasks, implement]` instead of `[plan, implement]` in gate on_transition.

#### Scenario: foundation.pack gate
- **WHEN** `packages/core/packs/foundation.pack/pack.yaml` is inspected
- **THEN** gate on_transition SHALL contain:
  ```yaml
  gate:
    on_transition:
      - [tasks, implement]
  ```
- **AND** it SHALL NOT contain `[plan, implement]`

#### Scenario: ddd.pack gate
- **WHEN** `packages/core/packs/ddd.pack/pack.yaml` is inspected
- **THEN** gate on_transition SHALL contain `[design, tasks]` (not `[design, plan]`)

### Requirement: Backward compatibility for old sessions

Dispatch SHALL automatically map old stage name `"plan"` to `"tasks"` for backward compatibility.

#### Scenario: Old session with stage: "plan"
- **WHEN** an old session has `stage: "plan"` in state.yaml
- **THEN** dispatch SHALL automatically map it to `"tasks"`
- **AND** the session SHALL continue to work

#### Scenario: normalizeStage function
- **WHEN** `normalizeStage("plan")` is called
- **THEN** it SHALL return `"tasks"`

#### Scenario: normalizeStage passthrough
- **WHEN** `normalizeStage("specify")` is called
- **THEN** it SHALL return `"specify"` (unchanged)

### Requirement: Plan command and Plan type unchanged

The `spec-graph plan` CLI command and `Plan` TypeScript interface SHALL remain unchanged. They refer to strategic planning, not the FSM stage.

#### Scenario: Plan command still works
- **WHEN** user runs `spec-graph plan "<intent>"`
- **THEN** it SHALL create a session with capabilities
- **AND** it SHALL NOT be affected by stage rename

#### Scenario: Plan type unchanged
- **WHEN** `Plan` TypeScript interface is inspected
- **THEN** it SHALL still exist with same structure
- **AND** it SHALL NOT be renamed to `Tasks`

#### Scenario: state.yaml plan field unchanged
- **WHEN** `state.yaml` is inspected
- **THEN** `plan` field SHALL still exist
- **AND** it SHALL contain `capabilities`, `order`, `complexity`, `risks`

#### Scenario: planning.generatePlan() unchanged
- **WHEN** `planning.generatePlan()` function is called
- **THEN** it SHALL work as before
- **AND** it SHALL NOT be renamed

### Requirement: Test files updated

All test files referencing `'plan'` stage SHALL be updated to use `'tasks'`.

#### Scenario: automator tests
- **WHEN** `packages/core/src/automator/index.test.ts` is inspected
- **THEN** test cases SHALL use `'tasks'` stage (not `'plan'`)

#### Scenario: dispatch tests
- **WHEN** `packages/core/src/dispatch/index.test.ts` is inspected
- **THEN** test cases SHALL use `'tasks'` stage (not `'plan'`)

#### Scenario: gate-enforcement tests
- **WHEN** `packages/core/src/gate-enforcement/index.test.ts` is inspected
- **THEN** STAGES array in tests SHALL contain `'tasks'` (not `'plan'`)

### Requirement: No remaining 'plan' stage references

After all changes, no code SHALL reference `'plan'` as a stage name (excluding Plan type and plan field).

#### Scenario: grep validation
- **WHEN** `grep -r "stage.*'plan'\|'plan'.*stage" packages/core/src/` runs
- **THEN** zero matches SHALL be found

#### Scenario: STAGE_OUTPUTS validation
- **WHEN** `grep -r "STAGE_OUTPUTS.plan" packages/` runs
- **THEN** zero matches SHALL be found

#### Scenario: STAGE_OUTPUT_MAP validation
- **WHEN** `grep -r "STAGE_OUTPUT_MAP.plan" packages/` runs
- **THEN** zero matches SHALL be found
