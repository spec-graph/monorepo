---
name: spec-graph-merge
description: Guide the host agent through sequential merging of parallel worktree branches into main. Covers rebase strategy, conflict resolution, and merge queue ordering.
license: MIT
compatibility: Requires git CLI.
metadata:
  author: spec-graph
  version: "2.0"
---

Guide the host agent to merge parallel worktree branches into main one at a time.

## When to use

- After all sub-agents in a parallel wave complete
- Before integration gate evaluation
- As part of the parallel-execution workflow

## Steps

### 1. Verify all sub-agents completed

Check `spec-graph waves` to confirm all worktrees are done.

### 2. Merge worktrees one at a time

Process sub-agents in completion order (or any order for safety):

```bash
# For each worktree:
cd .spec-graph/worktrees/<task-id>

# 1. Rebase onto latest main
git fetch origin
git rebase main

# 2. If rebase succeeds, merge into main
cd <main-repo-root>
git merge --no-ff spec-graph/<session-id>/<task-id>

# 3. If merge fails, try to resolve or use parallel-recovery skill
```

### 3. Verify after each merge

After each merge, run the post-merge gate:
```bash
npm test  # all tests pass
npm run lint
npm run typecheck
npm run build
```

### 4. If conflicts occur

**Conflict types:**
- File conflicts: two worktrees modified the same file
- Rebase conflicts: main has changes that conflict with worktree's changes

**Resolution strategies:**
1. `git rebase --abort` if rebase becomes too complex
2. Use `git mergetool` for visual resolution
3. Defer to `spec-graph parallel-recovery` for automated analysis

## Edge cases

- **Rebase conflicts**: try `git rebase --abort` and resolve via merge instead
- **Merge already in main**: skip this worktree (already merged)
- **Force push issues**: never force push to shared branches; use `--force-with-lease` for own work

## Sequential merge queue

The merge queue processes one merge at a time to avoid race conditions. After each successful merge, the integration gate runs:
- Level 2 (Merge Gate) checks post-merge state
- Level 3 (System Gate) checks full integration

If Level 2/3 fails after a merge, parallel-recovery determines whether to:
- Retry with different rebase strategy
- Degrade this wave to serial
- Degrade entire workflow to serial
