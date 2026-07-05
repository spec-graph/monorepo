# fsm-extension: 9-stage FSM with specs

## Requirement: FSM supports specs as an optional 9th stage

The automator MUST support a 9-stage FSM where `specs` is inserted between `specify` and `design`.

### Scenario: STAGES array includes specs

**Given** automator module loaded
**When** STAGES array is inspected
**Then** length is 9
**And** STAGES[1] is `'specs'`
**And** order is: specify, specs, design, tasks, implement, review, test, accept, integrate

### Scenario: STAGE_OUTPUTS has specs entry

**Given** automator module loaded
**When** STAGE_OUTPUTS['specs'] is accessed
**Then** artifact is `'specs.md'`
**And** dir is `'specs'`

### Scenario: Stage type includes specs

**Given** TypeScript compilation
**When** Stage type is used
**Then** `'specs'` is a valid Stage value

### Scenario: Session progresses through specs

**Given** session at stage `specify`
**When** submitResult with valid proposal
**Then** nextStage is `'specs'`

### Scenario: Session at specs produces specs.md

**Given** session at stage `specs`
**When** submitResult with specs.md artifact
**Then** nextStage is `'design'`
**And** completedArtifacts includes `'specs/specs.md'`
