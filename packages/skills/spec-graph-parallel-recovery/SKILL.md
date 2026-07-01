---
name: spec-graph-parallel-recovery
description: Guide the host agent through failure attribution and targeted recovery when parallel execution fails. Covers precise failure detection, targeted retry, and auto-degradation to serial mode.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Recover from parallel execution failures with precise attribution.

## When to use

- An integration gate has failed
- A sub-agent has failed mid-execution
- A merge conflict has occurred

## Steps

### 1. Identify the failure

```bash
spec-graph diagnose --json
```

Output: gateId, failedCriteria, retryLevel, similarToPrevious.

### 2. Attribute to specific sub-agent

Use the failure trace to identify which sub-agent caused the issue:

```bash
# Check which worktree's files are involved
git diff main --stat
# Check which worktree was last updated
ls -lt .spec-graph/worktrees/
```

For multi-sub-agent failures:
- `spec-graph parallel-recovery analyze` to identify blamed tasks
- Returns the specific task IDs that caused the issue

### 3. Plan recovery

Based on attribution, recovery options:

**If single sub-agent failed:**
- Retry that specific sub-agent only
- Other sub-agents' work is preserved

**If multiple sub-agents failed (related cause):**
- Retry all blamed sub-agents
- Files may need re-coordination

**If cannot attribute (multiple failures, no clear cause):**
- Degrade entire wave to serial
- Preserve completed work in main
- Re-execute remaining tasks serially

**If failure count ≥ 3:**
- Auto-degrade to serial
- Stop retry attempts

### 4. Apply recovery

**Retry specific sub-agent:**
1. Keep the failed worktree
2. Re-dispatch the same sub-agent with new prompt including failure context
3. After re-completion, re-run integration gate

**Degrade to serial:**
1. Merge any already-completed worktrees to main
2. Mark parallel wave as "degraded to serial"
3. Continue with remaining tasks in serial mode

### 5. Verify recovery

```bash
spec-graph integration-status --json
# Check that all three gate levels now pass
```

## Edge cases

- **Failure persists after multiple retries**: continue retrying up to 3 times, then auto-degrade
- **Cannot determine root cause**: degrade entire workflow to serial mode
- **Merge conflict unresolvable**: abort merge, retry worktree with new branch from main

## Recovery action types

- `retry-specific`: retry just the failing sub-agent
- `retry-wave`: retry all sub-agents in the wave
- `degrade-serial`: switch to serial mode for this wave
- `no-action`: nothing needed (false alarm)
