---
name: spec-graph-worktree
description: Guide git worktree creation and cleanup for parallel sub-agent tasks. Covers branch naming convention and isolation guarantees.
license: MIT
compatibility: Requires git CLI.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-worktree

## Steps

1. Create worktree: `git worktree add -b spec-graph/<session>/<task> .spec-graph/worktrees/<task>`
2. Verify: `git worktree list`
3. Sub-agent works in assigned worktree
4. After completion: `git worktree remove .spec-graph/worktrees/<task>`
5. Delete branch: `git branch -D spec-graph/<session>/<task>`

## Cleanup on failure

- Keep worktree for debugging
- User can manually cleanup: `git worktree list | grep .spec-graph | xargs git worktree remove`
