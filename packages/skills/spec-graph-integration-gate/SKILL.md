---
name: spec-graph-integration-gate
description: Apply the three-level integration gate (Individual + Merge + System) to validate parallel execution results. All three levels must pass for parallel execution to be considered successful.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Apply the three-level integration gate to validate parallel execution.

## When to use

- After all sub-agents in a parallel wave complete their work
- Before marking the wave as successful
- When verifying a partial merge result

## Steps

### 1. Level 1: Individual Gate (per sub-agent)

For each sub-agent, verify:

```bash
# Sub-agent's own work passes:
- Unit tests pass
- Lint clean
- Typecheck clean
- Build succeeds
- Self-review completed
- Functionality matches specs
```

Use `spec-graph diagnose --json` to see the most recent gate result.

### 2. Level 2: Merge Gate (post-merge)

After merging a worktree to main, verify:

```bash
- All tests pass (including merged sub-agent's tests and existing)
- Lint clean
- Typecheck clean
- Build succeeds
- Code review passes (no critical issues)
- Functionality verification passes
```

This is more than just "the merge succeeded" — the codebase must remain healthy.

### 3. Level 3: System Gate (full integration)

After all merges complete, verify:

```bash
- Integration tests pass (cross-sub-agent)
- E2E tests pass (if defined)
- Style consistency (all sub-agents used same naming/formatting)
- Cross-agent consistency (interfaces match between sub-agents)
- Comprehensive code review passes
```

### 4. Result handling

If all three pass:
```bash
spec-graph status --json  # shows: completedArtifacts increased
```

If any level fails:
- Run `spec-graph parallel-recovery` to plan recovery
- Either: retry the failing sub-agent
- Or: degrade to serial mode (preserving completed work)

## Edge cases

- **One sub-agent fails Individual gate**: retry that sub-agent only, others continue
- **Merge conflict after multiple merges**: parallel-recovery suggests rebase strategy
- **System gate fails with unclear cause**: parallel-recovery attempts attribution; if fails, degrade entire wave
- **All three pass but user has concerns**: manual re-run of the specific gate

## All three must pass

If any single level fails, the parallel wave is considered unsuccessful. Auto-degrade to serial mode is the safe default.
