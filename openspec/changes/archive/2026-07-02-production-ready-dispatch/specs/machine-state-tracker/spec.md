## ADDED Requirements

### Requirement: Artifact status tracking

The machine-state tracker SHALL maintain a YAML file `.spec-graph/machine-state.yaml` recording the status of every artifact and check in the workflow. Valid status values are `pending`, `in_progress`, `completed`, and `failed`.

#### Scenario: Artifact marked completed
- **WHEN** `trackArtifact("requirement/proposal", "completed", { path: "specify/proposal.md", producer: "pm" })` is called
- **THEN** machine-state.yaml SHALL contain `artifacts.requirement/proposal.status: completed` with `path`, `producer`, and `updated_at` fields

#### Scenario: Check marked failed
- **WHEN** `trackCheck("lint", "failed", { errors: 3 })` is called
- **THEN** machine-state.yaml SHALL contain `checks.lint.status: failed` with error details

### Requirement: Status query API

The machine-state tracker SHALL provide a query API that returns the current status of all artifacts and checks.

#### Scenario: Query after tracking
- **WHEN** an artifact is tracked and `getMachineState()` is called
- **THEN** the returned MachineState object SHALL contain the tracked artifact with its current status

### Requirement: Integration with automator

The automator's `submitResult()` SHALL call `trackArtifact()` when a gate passes, marking the stage's artifact as completed. The automator's `intervene()` SHALL also call `trackArtifact()` on `force-advance` and `rollback` actions to keep machine-state consistent with session state.

#### Scenario: Stage advancement triggers tracking
- **WHEN** specify stage gate passes and the automator advances to design
- **THEN** `trackArtifact("requirement/proposal", "completed", ...)` SHALL have been called

#### Scenario: Force-advance triggers tracking
- **WHEN** `intervene` is called with action `force-advance` from specify to design
- **THEN** `trackArtifact("requirement/proposal", "completed", ...)` SHALL have been called with details indicating the artifact was forced

#### Scenario: Rollback updates machine state
- **WHEN** `intervene` is called with action `rollback` from design to specify
- **THEN** the rolled-back stage's artifact SHALL be marked as `pending` in machine-state

### Requirement: Atomic write safety

The machine-state tracker SHALL use atomic write (write to temporary file then rename) when updating `machine-state.yaml` to prevent file corruption from concurrent writes.

#### Scenario: Atomic write prevents partial writes
- **WHEN** `trackArtifact` is called and the write is interrupted mid-stream
- **THEN** the existing `machine-state.yaml` SHALL remain intact (the temp file is discarded)

The dispatch manifest generator SHALL consult machine-state.yaml to determine `gate_passed`, `missing_artifacts`, and `failed_checks` fields in the manifest.

#### Scenario: Gate passed when all required artifacts complete
- **WHEN** machine-state shows all gate-required artifacts as completed
- **THEN** the dispatch manifest SHALL have `gate_passed: true` and `missing_artifacts: []`

#### Scenario: Gate failed when artifacts missing
- **WHEN** machine-state shows `proposal` as pending but the gate requires it
- **THEN** the dispatch manifest SHALL have `gate_passed: false` and `missing_artifacts` SHALL include `proposal`

### Requirement: check-run CLI security

The `check-run` CLI command SHALL validate check commands against the constitution's `security.command_whitelist` and `security.forbidden_patterns` before execution. Sentinel commands (wrapped in `<...>`) SHALL be dispatched to TypeScript functions, not executed as shell.

#### Scenario: Whitelisted command executes
- **WHEN** check-run is called for a check with command `npm test` and the whitelist includes `npm test`
- **THEN** the command SHALL execute

#### Scenario: Non-whitelisted command blocked
- **WHEN** check-run is called for a check with command `rm -rf /` and the whitelist does not include it
- **THEN** execution SHALL be refused with a security error

#### Scenario: Sentinel command dispatched safely
- **WHEN** check-run is called for a check with command `<lint-command>`
- **THEN** the sentinel SHALL be dispatched to the corresponding TypeScript handler, not executed as shell
