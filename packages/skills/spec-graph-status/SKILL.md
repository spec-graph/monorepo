---
name: spec-graph-status
description: Inspect the current spec-graph workflow state. Shows the active stage, progress, completed artifacts, blockers, and recent gate failures. Use when the user wants to know where things stand.
license: MIT
compatibility: Requires spec-graph CLI (v2+) installed.
metadata:
  author: spec-graph
  version: "2.0"
---

Check the status of a spec-graph workflow session.

---

## Steps

### 1. Query status

```bash
spec-graph status --json
```

### 2. Parse and present

The JSON output contains:

```json
{
  "session_id": "...",
  "intent": "...",
  "stage": "design",
  "progress": {
    "current_stage_index": 1,
    "total_stages": 8,
    "completed_artifacts": 3
  },
  "blockers": [],
  "recent_diagnosis": null,
  "trace_tail": [...]
}
```

Present to the user in a clear format:
- Current stage (with human-readable name)
- Progress (X of 8 stages complete)
- Blockers (if any)
- Most recent diagnosis (if a gate recently failed)

### 3. Handle no active session

If no session exists, inform the user and suggest starting one with `spec-graph-plan`.

---

## Edge cases

- **Multiple sessions**: spec-graph v2 supports one active session at a time. If the user has an archived session, point them to `openspec list` (if integrated) or the archive directory
