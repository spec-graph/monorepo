## ADDED Requirements

### Requirement: Single sub-agent dispatch path

spec-graph SHALL provide ONE mechanism: `dispatch --json` + `dispatch-watcher.mjs` hook.

#### Scenario: Dispatch produces manifest
- **WHEN** `spec-graph dispatch --session <id> --json` runs
- **THEN** output SHALL be a valid DispatchManifest with 9-section envelopes

#### Scenario: Hook injects reminder
- **WHEN** hook is registered and dispatch runs
- **THEN** Claude Code main agent SHALL receive system-reminder

### Requirement: Parallel wave execution

Dispatch SHALL support parallel execution within same wave.

#### Scenario: Implement stage parallel
- **WHEN** implement stage has N independent capabilities
- **THEN** manifest SHALL have N actions all with `parallel_group: 0`
