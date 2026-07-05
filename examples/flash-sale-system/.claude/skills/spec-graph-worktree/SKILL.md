---
name: spec-graph-worktree
description: Manage git worktree isolation for parallel sub-agent execution. Create worktrees for parallel implement-stage actions, verify/merge results, handle conflicts. Use during the implement stage when spec-graph dispatch produces parallel actions.
license: MIT
compatibility: Requires spec-graph CLI v3+ with worktree subcommands. Requires git.
metadata:
  author: spec-graph
  version: "1.0"
---

Manage git worktree isolation for parallel sub-agent execution.

When spec-graph's implement stage produces multiple parallel actions, each sub-agent runs in its own git worktree. This prevents file conflicts between sub-agents working on different capabilities simultaneously.

---

## Prerequisites

- spec-graph CLI v3+ installed
- Git repository
- `.spec-graph/` initialized

---

## Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  1. dispatch produces parallel actions (implement stage)     │
│  2. create a worktree for each action                       │
│  3. each sub-agent works in its isolated worktree           │
│  4. verify each worktree (self-check)                       │
│  5. merge verified worktrees back (wave by wave)            │
│  6. cleanup worktree directories                            │
└─────────────────────────────────────────────────────────────┘
```

On failure:
```
  verify fails → abandon unit → cleanup worktree → report error
```

---

## Commands

### List worktree units

```bash
spec-graph worktree list
spec-graph worktree list --status prepared
spec-graph worktree list --json
```

### Show unit details

```bash
spec-graph worktree status <unit-id>
spec-graph worktree status <unit-id> --json
```

### Create a worktree for a parallel action

```bash
spec-graph worktree create \
  --session <session-id> \
  --action <capability-id> \
  --scope-allowed "src/auth/**,src/shared/**" \
  --scope-forbidden "*.env,secrets/**"
```

The unit ID becomes: `<session-id>-<action-id>`.

### Verify a completed unit

```bash
spec-graph worktree verify <unit-id>
```

Marks the unit as `self_verified` — ready for merge.

### Merge into main

```bash
spec-graph worktree merge <unit-id>
```

Merges the worktree's branch into the main branch. Merges must happen in wave order (Wave 0 before Wave 1).

### Abandon and cleanup

```bash
spec-graph worktree abandon <unit-id> --reason "sub-agent failed"
```

Removes the worktree + branch, marks unit as abandoned.

### Scope check

```bash
spec-graph worktree scope-check <unit-id> \
  --files "src/auth/login.ts,src/auth/middleware.ts" \
  --scope-forbidden "*.env,secrets/**" \
  --scope-protected "**/*.test.ts"
```

Checks that changed files don't violate scope rules.

---

## Parallel Dispatch Workflow

When the dispatch manifest shows parallel actions (same `parallel_group`):

1. Create one worktree per action:
   ```bash
   for action in parallel_actions:
     spec-graph worktree create --session $SID --action $action.id
   ```

2. Dispatch each sub-agent with its worktree path in the prompt

3. After all complete:
   ```bash
   spec-graph worktree verify <unit-1>
   spec-graph worktree merge <unit-1>
   spec-graph worktree verify <unit-2>
   spec-graph worktree merge <unit-2>
   ```

4. After all merged, submit the result:
   ```bash
   spec-graph submit --session $SID --result '{"artifacts": [...]}'
   ```
