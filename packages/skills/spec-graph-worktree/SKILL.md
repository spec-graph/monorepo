---
name: spec-graph-worktree
description: Guide the host agent through git worktree creation and cleanup for parallel sub-agent tasks. Covers branch naming conventions, isolation guarantees, and cleanup options.
license: MIT
compatibility: Requires git CLI.
metadata:
  author: spec-graph
  version: "2.0"
---

Guide the host agent to manage git worktrees for parallel tasks.

## When to use

- Before dispatching parallel sub-agents
- After sub-agents complete their work
- During cleanup

## Steps

### 1. Create worktree for each parallel task

Before dispatching sub-agents, create a worktree for each task:

```bash
# Branch naming convention: spec-graph/<session>/<task>
git worktree add -b spec-graph/<session-id>/<task-id> .spec-graph/worktrees/<task-id>
```

Example:
```bash
git worktree add -b spec-graph/add-jwt-auth/login-feature .spec-graph/worktrees/login-feature
```

### 2. Verify worktree setup

```bash
git worktree list
# Should show all worktrees including the newly created one
```

### 3. Sub-agents work in worktrees

Each sub-agent works within its assigned worktree:
- Files modified in worktree A don't affect worktree B
- Sub-agent can run `npm test`, `git diff` etc. within its worktree

### 4. After sub-agent completes: optional cleanup

By default, worktrees are KEPT on failure for debugging.

To manually clean up successful worktrees:
```bash
# Remove worktree and delete branch
git worktree remove .spec-graph/worktrees/<task-id>
git branch -D spec-graph/<session-id>/<task-id>
```

## Edge cases

- **Branch already exists**: append a timestamp, e.g., `spec-graph/<session>/login-feature-1234567890`
- **Path conflicts**: use a different path, e.g., `.spec-graph/worktrees/<task-id>-<unique-suffix>`
- **Permission errors**: verify git config and worktree path permissions

## Cleanup script

To clean up all spec-graph worktrees at once:
```bash
git worktree list | grep '.spec-graph/worktrees/' | awk '{print $1}' | xargs -I {} git worktree remove --force {}
git branch | grep 'spec-graph/' | xargs git branch -D
```
