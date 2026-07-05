# v3.0 Bugfix: Gate & Backward Compatibility

## Context

Audit of the v3.0 declaration engine implementation found three issues:

1. **dispatch `evaluateGateStatus()` uses stale `'plan'` key** — the `stageArtifacts` dictionary has `plan: 'plan/tasks.md'` instead of `tasks: 'tasks/tasks.md'`, causing the tasks stage gate to always show as passed in dispatch manifests.

2. **Missing `normalizeStage()` backward compatibility** — the v3.0 design specifies auto-mapping old `stage: "plan"` → `"tasks"` for backward compat with v2 sessions. This was never implemented.

3. **Test fixtures reference `'plan'` as FSM stage** — composer, gate-enforcement, and e2e-production tests still use `'plan'` in agent actions and stage arrays.

## Changes

### Fix 1: dispatch/index.ts — stageArtifacts key
- `plan: 'plan/tasks.md'` → `tasks: 'tasks/tasks.md'`

### Fix 2: Backward compatibility
- Add `normalizeStage()` function in dispatch module
- Add stage normalization in automator's `loadSession()` for broad coverage
- Old sessions with `stage: "plan"` auto-map to `"tasks"`

### Fix 3: Test fixtures
- `composer/composer.test.ts`: `'plan'` → `'tasks'` in actions, input_artifact_kinds
- `gate-enforcement/index.test.ts`: `'plan'` → `'tasks'` in stages array
- `e2e-production.test.ts`: `'plan'` → `'tasks'` in actions, agent_bindings

## Verification
- Build: core + cli pass
- Tests: 212/212 passing (189 core + 23 CLI)
- No breakage to existing behavior
