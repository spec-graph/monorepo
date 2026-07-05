# e2e-validation: end-to-end workflow validation

## Requirement: complete workflow passes real gate evaluation

A complete 8-stage workflow MUST pass all gate evaluations without force-advance. The test-project serves as the validation environment.

### Scenario: simple task runs single-agent path end-to-end

**Given** test-project with session for intent "Add input validation to user registration"
**And** plan complexity = low, 1 capability, 0 open questions
**When** the workflow runs through all 8 stages
**Then** each stage advances via `trigger: "gate-pass"` (not `user-force`)
**And** state transitions to `completed`
**And** all expected artifacts are produced:
- specify/proposal.md
- design/design.md
- tasks/tasks.md
- implement/ (source files + validation-report.json)
- review/review.md
- test/test.md
- accept/verification.md
- integrate/pr.md
**And** meeting was NOT triggered (recommended=false, coordinator didn't initiate)

### Scenario: complex task with open questions runs meeting path

**Given** test-project with session for intent "Refactor user auth to OAuth2 + social login"
**And** plan complexity = medium, 5 capabilities, 2 open questions
**When** the workflow runs through all 8 stages
**When** coordinator reaches tasks stage
**And** manifest.meeting.recommended is `true`
**And** coordinator initiates task-decomposition-meeting
**Then** meeting runs with 4 participants through 3 rounds
**And** meeting transcript exists in `.spec-graph/meetings/task-decomposition-meeting.yaml`
**And** tasks.md is produced from meeting convergence
**And** remaining stages complete normally
**And** state transitions to `completed`

### Scenario: specify gate correctly evaluates all 11 exit criteria

**Given** a proposal.md artifact
**When** specify exit gate is evaluated
**Then** all 11 criteria are checked:
- proposal-exists, proposal-structure, capabilities-enumerated
- user-personas-defined, user-stories-present, capabilities-map-to-stories
- capabilities-kebab-case, proposal-length, focuses-on-why
- scope-defined, risks-identified

### Scenario: implement gate requires validation-report.json

**Given** code artifacts exist in implement/ directory
**But** validation-report.json is missing
**When** implement exit gate is evaluated
**Then** `implement-validation-passed` fails
**And** gate does not pass

### Scenario: implement gate passes with validation-report.json

**Given** code artifacts exist in implement/ directory
**And** validation-report.json exists with `validation_passed: true`
**When** implement exit gate is evaluated
**Then** `implement-validation-passed` passes
**And** gate passes (assuming all other criteria pass)

### Scenario: machine-state reflects completed workflow

**Given** workflow has completed all 8 stages
**When** machine-state.yaml is read
**Then** all artifacts show `status: completed`
**And** checks are populated (if any were run)
**And** `last_updated` is recent

### Scenario: session state.yaml shows correct trace

**Given** workflow has completed all 8 stages
**When** session state.yaml is read
**Then** trace contains entries for every stage transition
**And** all transitions have `trigger: "gate-pass"`
**And** `state: "completed"`
**And** `readyForArchive: true`

## Implementation Notes

- Run in test-project directory
- Use setup.mjs to create session, then manually run dispatch→advance loop for each stage
- For scenario B, manually call `spec-graph meeting init/record/advance/complete`
- Validation: inspect state.yaml trace, machine-state.yaml, session artifact directories
