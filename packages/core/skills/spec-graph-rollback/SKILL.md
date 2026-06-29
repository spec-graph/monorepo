---
name: spec-graph-rollback
description: "Safely rollback a change to its pre-change state using safety-net snapshots. Use when a change needs to be undone."
---

# spec-graph rollback

Safely rollback a change.

## Usage

```bash
spec-graph rollback <change-id> [--dry-run]
```

## What this does

- Loads safety-net snapshot for the change
- Restores pre-change file state
- `--dry-run`: preview without restoring
