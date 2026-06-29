---
name: spec-graph-merge-queue
description: "Manage merge queue: enqueue isolation units, detect overlaps, and merge sequentially with atomic commit-or-abort protection."
---

# spec-graph merge-queue

Sequential merge management.

## Usage

```bash
spec-graph merge-queue enqueue <unit-id> --files "src/a.ts,src/b.ts"
spec-graph merge-queue list
spec-graph merge-queue overlaps    # Detect overlapping file changes
spec-graph merge-queue mark-merged <unit-id>
