---
name: spec-graph-merge
description: Guide sequential merging of parallel worktree branches into main. Covers rebase strategy and conflict resolution.
license: MIT
compatibility: Requires git CLI.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-merge

## Steps

1. For each worktree (in completion order):
   - `cd .spec-graph/worktrees/<task>`
   - `git fetch origin && git rebase main`
   - If rebase succeeds: `git merge --no-ff spec-graph/<session>/<task>`
2. After each merge, run post-merge gate:
   - `npm test && npm run lint && npm run typecheck && npm run build`
3. If conflicts occur, use `spec-graph parallel-recovery`

## Edge cases

- **Rebase conflicts**: abort and resolve via merge
- **Merge already done**: skip
- **Force push issues**: never force push to shared branches
