# spec-graph v3.0 Migration Guide

This guide covers migrating from spec-graph v2 to v3.

## What's Changed

### v3.0 = Declaration Engine

spec-graph v3 is repositioned as a **declaration engine**: it generates dispatch manifests for sub-agents and evaluates quality gates, but never invokes agents directly. This is the core "brain, not hands" principle.

```
v2: spec-graph auto "<intent>"     → spec-graph invokes agents
v3: spec-graph dispatch --json     → external coordinator invokes agents
```

### Breaking Changes

| v2 | v3 | Notes |
|----|----|----|
| `spec-graph auto "<intent>"` | REMOVED | Use `dispatch + hook` workflow instead |
| `spec-graph next-prompt` | REMOVED | Replaced by `dispatch --json` |
| `external-coordination` module | REMOVED | Agent invocation delegated to external coordinators |
| `prompt-construction` module | REMOVED | Replaced by 9-section envelope in dispatch |
| `autoRun()` function | REMOVED | Use dispatch + advance loop |
| `spec-graph-auto` SKILL | REMOVED | Use `spec-graph-dispatch` SKILL |
| FSM stage `plan` | Renamed to `tasks` | Eliminates collision with `spec-graph plan` command |
| XML prompt format | REMOVED | Use 9-section envelope (in dispatch manifest) |

### What's Preserved

| Feature | Status |
|---------|--------|
| `spec-graph plan` command | ✅ Strategic planning (unchanged) |
| `spec-graph confirm` | ✅ Confirm plan |
| `spec-graph compose` | ✅ Compose graph from packs |
| `spec-graph dispatch` | ✅ Generate manifest (primary API) |
| `spec-graph advance` | ✅ Submit result + advance state |
| `spec-graph status` | ✅ Check state |
| `spec-graph intervene` | ✅ Manual intervention |
| `spec-graph diagnose` | ✅ Gate failure diagnosis |
| `spec-graph validate` | ✅ Validate state |
| 8-stage FSM | ✅ specify → design → tasks → implement → ... |
| knowledge-base | ✅ Methodologies and templates |
| gate-enforcement | ✅ Quality gates |
| dispatch-watcher hook | ✅ PostToolUse hook |

## Migration Steps

### 1. Delete old session state

```bash
# v3 uses a different internal structure
rm -rf .spec-graph/
```

### 2. Update spec-graph

```bash
npm uninstall -g spec-graph
npm install -g spec-graph@3
```

Or in a monorepo, update the workspace dependency.

### 3. Re-initialize

```bash
spec-graph init
```

This creates:
- `.spec-graph/` directory
- `.spec-graph/config.yaml` (project context)
- `.spec-graph/sessions/` (empty)
- `.claude/settings.json` (hook registration)
- `.spec-graph/graph.yaml` (if packs exist)

### 4. Start a new session

```bash
spec-graph plan "<your intent>" --confirm
```

### 5. Use dispatch workflow

Instead of `spec-graph auto`, use the dispatch loop:

```bash
# For each of the 8 stages:
spec-graph dispatch --session <id> --json
# → hook auto-triggers
# → dispatch sub-agent(s)
spec-graph advance --session <id> --result '<json>'
```

Or use the `/spec-graph-dispatch` SKILL to automate the loop.

## For SKILL Authors

Update your SKILL.md files:

```diff
- # spec-graph-auto
+ # spec-graph-dispatch

- Run: spec-graph auto "<intent>"
+ Run: spec-graph dispatch --session <id> --json
+ Then: dispatch sub-agents via Agent tool
+ Then: spec-graph advance --session <id> --result '<json>'
```

## For External Orchestrators

If you were using the stateless API:

```diff
- GET /next-prompt (XML)
+ GET /dispatch --json (JSON manifest with 9-section envelope)
```

The `advance` endpoint is unchanged.

## For Pack Authors

If your pack references the old stage name:

```diff
- agent_bindings:
-   plan: [developer]
+ agent_bindings:
+   tasks: [developer]

- gate:
-   on_transition: [[plan, implement]]
+ gate:
+   on_transition: [[tasks, implement]]
```

## Rationale

v2 tried to be an "automatic progression development brain" with spec-graph invoking agents directly. This violated the "brain, not hands" principle and created complex error handling, timeout, and retry logic.

v3 embraces the principle fully: spec-graph generates dispatch manifests, external coordinators invoke agents. This separation of concerns makes spec-graph:
- **Simpler**: No agent lifecycle management
- **More flexible**: Works with any external coordinator
- **More predictable**: Pure state machine + manifest generator
- **Easier to debug**: All execution happens outside spec-graph

## Timeline

- **v2 → v3** is a breaking change (major version bump)
- No deprecation period (v2's core promises violated principles)
- Migration takes ~5 minutes per project

## Questions?

- Check the updated `CLAUDE.md` for architecture overview
- Check `packages/skills/spec-graph-dispatch/SKILL.md` for workflow details
- Check `packages/core/knowledge/shared/prompt-schema.md` for the 9-section envelope format
