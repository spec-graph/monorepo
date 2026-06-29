---
name: spec-graph-worktree
description: "Manage git worktree isolation: create, list, remove, merge. Supports enriched lifecycle states (self-verify, submit, accept, reject)."
---

# spec-graph worktree

Git worktree isolation.

## Usage

```bash
spec-graph worktree create <unit-id> --track <track-id>
spec-graph worktree list
spec-graph worktree self-verify <unit-id>
spec-graph worktree submit <unit-id>
spec-graph worktree accept <unit-id> --reviewed-by <name>
spec-graph worktree reject <unit-id> --reason "..."
spec-graph worktree merge <unit-id> --to main
