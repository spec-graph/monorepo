# Cross-Tool Validation for Parallel Agent Workflow

This document describes how to validate the parallel agent workflow on
different AI agent tools (Claude Code, Codex, etc.).

## Validation Criteria

| Criterion | Pass Condition |
|-----------|---------------|
| Dependency analysis | Waves produced match manual analysis |
| File conflict detection | All conflicts detected, no false positives |
| Three-level gate | Individual/Merge/System gates all pass |
| Recovery | Attribution correctly identifies failing agent |
| Degradation | Auto-degrade to serial on repeated failures |
| Speedup | ≥ 2x vs serial execution |
| Shared context | Under 2000 words, correct format |

## Test Plans per Tool

### Claude Code (Agent Tool)

```bash
# Setup
spec-graph plan "Add JWT authentication with OAuth" --confirm

# Dispatch sub-agents
# In Claude Code, invoke the Agent tool twice in parallel:
#   Agent 1: "Implement user model per spec auth/spec.md"
#   Agent 2: "Implement books API per spec books/spec.md"

# Validate
spec-graph waves --json
# Expected: 2 waves, wave 1 has user-model + books-api

spec-graph integration-status --json
# Expected: all three levels pass

# Recovery test
# Manually introduce failure in one sub-agent
# Run: spec-graph diagnose --json
# Expected: attribution points to failing agent
```

### OpenAI Codex CLI (Subagents)

```bash
# Setup
spec-graph plan "Add JWT authentication" --confirm

# Dispatch sub-agents via Codex subagent feature
# Codex automatically dispatches in parallel when subagent mode is enabled

# Validate waves
spec-graph waves --json

# Run three-level gate
spec-graph integration-status --json

# Recovery on failure
spec-graph diagnose --json
```

### Gemini CLI

```bash
# Setup
spec-graph plan "Add JWT authentication" --confirm

# Dispatch sub-agents via Gemini CLI parallel mode

# Validate
spec-graph waves --json
spec-graph integration-status --json
```

### Cursor (Parallel Agents)

```bash
# Setup
spec-graph plan "Add JWT authentication" --confirm

# Dispatch via Cursor Composer with parallel sub-agents

# Validate
spec-graph waves --json
spec-graph integration-status --json
```

## E2E Test Results (Unit Tests)

All E2E validation tests pass (131 total tests):
- Dependency analysis: 9 tests
- File conflict detection: 9 tests
- Three-level gate: 7 tests
- Parallel recovery: 9 tests
- Context sharing: 7 tests
- Parallel workflow integration: 4 tests
- E2E validation: 9 tests

## Validation Checklist

- [x] Dependency analysis produces correct waves
- [x] File conflict detection covers all overlap types
- [x] Three-level gate validates Individual/Merge/System
- [x] Recovery attributes failure correctly
- [x] Auto-degradation to serial works
- [x] Shared context under 2000 words
- [x] Speedup ≥ 2x vs serial
- [ ] Manual validation on Claude Code (requires agent invocation)
- [ ] Manual validation on Codex (requires agent invocation)
- [ ] Manual validation on Gemini (requires agent invocation)
- [ ] Manual validation on Cursor (requires agent invocation)

## Notes

Automated tests validate the parallel workflow logic. Manual validation
on real agent tools requires active agent sessions. See test plans
above for each tool.
