---
name: spec-graph-status
description: "Show the unified workflow dashboard — current stage, artifact statuses, check statuses, gate evaluations, and the next required action. Use as the primary status check during development."
---

# spec-graph status

Show the unified workflow dashboard.

## What this does

Combines information from the graph and machine state to show:

- **Current stage** — where the workflow is right now
- **Artifact statuses** — which are pending/completed/failed
- **Check statuses** — which are pending/passed/failed
- **Gate evaluations** — which gates block the next transition
- **Next action** — what needs to be done to advance

## Usage

```bash
npx spec-graph status
```

### Options

- `--json` — Output as JSON for programmatic consumption

## When to use

- **Primary status command** — use this to check workflow progress
- Before running `spec-graph run` to see what's pending
- After completing work to verify state is updated
- As a regular checkpoint during development
