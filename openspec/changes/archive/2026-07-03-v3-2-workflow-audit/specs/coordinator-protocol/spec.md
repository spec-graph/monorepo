# coordinator-protocol: coordinator decision framework

## Requirement: coordinator-protocol.md exists and is referenced

A single reference document MUST exist that guides the main agent (coordinator) on how to orchestrate the spec-graph workflow. The dispatch-watcher hook references this document in its system-reminder.

### Scenario: protocol document exists at expected path

**Given** foundation.pack is installed
**When** coordinator searches for protocol guidance
**Then** `packs/foundation.pack/agents/coordinator-protocol.md` exists
**And** is readable

### Scenario: protocol defines single-agent dispatch mode

**Given** coordinator reads protocol
**When** manifest has a simple single action with no meeting recommendation
**Then** protocol instructs: dispatch one sub-agent via Agent tool

### Scenario: protocol defines meeting decision framework

**Given** coordinator reads protocol
**When** manifest shows meeting is available and recommended
**Then** protocol instructs:
- Present the meeting option to the user (or auto-initiate if pre-authorized)
- If user agrees, call `spec-graph meeting init task-decomposition-meeting`
- Run meeting rounds by dispatching all participants
- Collect contributions via `spec-graph meeting record`
- Advance rounds via `spec-graph meeting advance`
- Complete via `spec-graph meeting complete`

### Scenario: protocol defines parallel wave dispatch

**Given** coordinator reads protocol
**When** implement stage has N actions with same parallel_group
**Then** protocol instructs: dispatch ALL N sub-agents simultaneously in a single message

### Scenario: protocol defines auto-loop rules

**Given** coordinator reads protocol
**When** advance returns `advanced: true, done: false`
**Then** protocol instructs: immediately re-run `spec-graph dispatch --json` without waiting for user input

### Scenario: protocol defines stop conditions

**Given** coordinator reads protocol
**When** one of these occurs:
- `done: true`
- sub-agent returns `BLOCKED`
- gate fails after 4 retries (retryLevel = 4)
**Then** protocol instructs: stop the loop and escalate to user

### Scenario: protocol defines ad-hoc meeting initiation

**Given** coordinator detects ambiguity not covered by pack-declared meetings
**When** coordinator needs to discuss
**Then** protocol instructs: `spec-graph meeting init <id> --purpose <text> --participants <list>`
**And** ad-hoc meeting runs without a pack declaration

### Scenario: hook references protocol correctly

**Given** dispatch-watcher.mjs injects system-reminder
**When** reminder references coordinator protocol
**Then** the path `packs/foundation.pack/agents/coordinator-protocol.md` resolves to an existing file

## Implementation Notes

- File: `packages/core/packs/foundation.pack/agents/coordinator-protocol.md`
- Content: ~80-120 lines, concise, decision-focused (not tutorial)
- dispatch-watcher.mjs already references this path — no change needed
