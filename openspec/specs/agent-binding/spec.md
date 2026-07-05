# agent-binding: tasks stage agent binding

## Requirement: tasks stage has a valid agent binding

The tasks stage (FSM) MUST have a corresponding `agent_bindings` entry so `dispatch` can resolve an agent for the `planActions()` function.

### Scenario: foundation pack declares tasks binding

**Given** foundation.pack is active (applies_when: always)
**And** FSM stage is `tasks`
**When** dispatch generates a manifest
**Then** `bindings['tasks']` resolves to `developer`

### Scenario: compose graph includes tasks binding

**Given** `spec-graph compose` runs with foundation.pack active
**When** graph.yaml is generated
**Then** `agent_bindings` contains `{ action: "tasks", agent_id: "developer" }`

### Scenario: backward compat — plan action still works

**Given** graph.yaml agent_bindings has both `plan: developer` and `tasks: developer`
**When** legacy code references `bindings['plan']`
**Then** it still resolves to `developer`

### Scenario: dispatch tasks stage produces valid manifest

**Given** session stage is `tasks`
**When** `generateDispatchManifest()` runs
**Then** manifest.actions[0].agent_id is `developer`
**And** manifest.actions[0].model_tier is `standard`

## Implementation Notes

- File: `packages/core/packs/foundation.pack/pack.yaml`
- Add `tasks: developer` to `provides.agent_bindings`
- Keep existing `plan: developer` binding
- Run `spec-graph compose` to regenerate graph.yaml
- Verify with `spec-graph dispatch --session <id> --json`
