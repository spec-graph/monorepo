## ADDED Requirements

### Requirement: Single sub-agent dispatch path

spec-graph SHALL provide exactly ONE mechanism for dispatching sub-agents: the `dispatch --json` command that produces a DispatchManifest consumed by the `dispatch-watcher.mjs` hook. The `auto` command, `next-prompt` command, `invokeAgent` function, and Claude Code adapter SHALL be removed.

#### Scenario: Dispatch command exists
- **WHEN** user runs `spec-graph dispatch --session <id> --json`
- **THEN** it SHALL output a valid DispatchManifest JSON

#### Scenario: Auto command removed
- **WHEN** user runs `spec-graph auto "..."`
- **THEN** it SHALL return "Unknown command" error

#### Scenario: Next-prompt command removed
- **WHEN** user runs `spec-graph next-prompt`
- **THEN** it SHALL return "Unknown command" error

### Requirement: Single prompt format (9-section envelope)

Dispatch SHALL produce prompt envelopes with exactly 9 sections: Identity, System Prompt, Task Context, Input Artifacts, Output Specification, File Scope, Verification, Status Report Protocol, After Completion. The XML-style prompt format from `prompt-construction` module SHALL be removed.

#### Scenario: Envelope contains all 9 sections
- **WHEN** a dispatch action has a sub-agent
- **THEN** the action's prompt field SHALL contain all 9 section headers

#### Scenario: Output spec has exact path
- **WHEN** a dispatch action is produced
- **THEN** `action.output_spec.path` SHALL be the exact file path for the artifact

#### Scenario: File scope has 3 arrays
- **WHEN** a dispatch action is produced
- **THEN** `action.file_scope` SHALL contain `read`, `write`, and `forbid` arrays

### Requirement: Parallel wave execution support

Dispatch SHALL support parallel execution of sub-agents within the same wave. Actions with the same `parallel_group` value can be dispatched simultaneously.

#### Scenario: Implement stage parallel waves
- **WHEN** implement stage has 3 independent capabilities
- **THEN** the manifest SHALL have 3 actions all with `parallel_group: 0`

#### Scenario: Sequential waves
- **WHEN** implement stage has dependencies between capabilities
- **THEN** capabilities shall be grouped into sequential waves based on dependency analysis
