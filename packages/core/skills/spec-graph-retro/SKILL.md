---
name: spec-graph-retro
description: "Generate a retrospective document for a completed change. Captures what worked, what didn't, and action items for future changes."
---

# spec-graph retro

Generate retrospective for a completed change.

## Usage

```bash
spec-graph retro <change-id>
```

## When to use

Run after `spec-graph change archive` to capture lessons learned.
Output: `.spec-graph/retros/<change-id>-retro.md`
