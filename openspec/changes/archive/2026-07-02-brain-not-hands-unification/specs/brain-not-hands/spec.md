## ADDED Requirements

### Requirement: No child process invocation

spec-graph SHALL NOT spawn any child process under any circumstances. The `external-coordination` module, `invokeAgent` function, `createClaudeCodeAdapter`, `createCodexAdapter`, `runProcess`, and `spawn`/`exec` calls SHALL be removed.

#### Scenario: No child_process in code
- **WHEN** grep for `child_process` in `packages/core/src/`
- **THEN** zero matches SHALL be found

#### Scenario: No invokeAgent in code
- **WHEN** grep for `invokeAgent` in the entire repo
- **THEN** zero matches SHALL be found

#### Scenario: No auto command
- **WHEN** user runs `spec-graph auto "..."`
- **THEN** it SHALL return "Unknown command" error

#### Scenario: No next-prompt command
- **WHEN** user runs `spec-graph next-prompt`
- **THEN** it SHALL return "Unknown command" error

### Requirement: Single dispatch path via hook

spec-graph SHALL provide exactly ONE mechanism for agent dispatch: the `dispatch --json` command that produces a DispatchManifest consumed by the `dispatch-watcher.mjs` hook.

#### Scenario: Dispatch command exists
- **WHEN** user runs `spec-graph dispatch --session <id> --json`
- **THEN** it SHALL output a valid DispatchManifest JSON with 9-section envelopes

#### Scenario: Hook auto-triggers
- **WHEN** dispatch-watcher.mjs hook is registered in .claude/settings.json
- **THEN** running `spec-graph dispatch` SHALL trigger the hook via PostToolUse(Bash)

### Requirement: Single prompt format (9-section envelope)

Dispatch SHALL produce prompt envelopes with exactly 9 sections: Identity, System Prompt, Task Context, Input Artifacts, Output Specification, File Scope, Verification, Status Report Protocol, After Completion.

#### Scenario: All 9 sections present
- **WHEN** a dispatch action has a sub-agent
- **THEN** the action's prompt field SHALL contain all 9 section headers

#### Scenario: No XML prompt format
- **WHEN** grep for `<task level="MUST">` in the code
- **THEN** zero matches SHALL be found (prompt-construction module removed)
