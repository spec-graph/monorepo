---
name: spec-graph-artifact
description: "List, inspect, and update graph artifacts. Manage the work products declared in the workflow — mark them as completed, check their status, or register new ones."
---

# spec-graph artifact

List, inspect, and update artifacts in the workflow graph.

## What this does

Artifacts are the declared work products in `graph.yaml` — PRDs, designs, contracts, implementations, verification reports, etc. This command lets you manage their lifecycle.

## Usage

```bash
# List all artifacts
npx spec-graph artifact list

# Show details of a specific artifact
npx spec-graph artifact show <artifact-id>

# Mark an artifact as completed
npx spec-graph artifact complete <artifact-id>

# Update artifact status
npx spec-graph artifact update <artifact-id> --status completed

# Register a new artifact
npx spec-graph artifact register <artifact-id> --producer <producer>
```

### Options

- `--status <status>` — Status for update/register: pending, in_progress, completed, failed
- `--producer <producer>` — Producer for registration
- `--json` — Output as JSON

## Artifact kinds (7 super types)

| Kind             | Description                                  |
| ---------------- | -------------------------------------------- |
| `requirement`    | What to solve                                |
| `design`         | How to solve                                 |
| `contract`       | Boundary specification (producer + consumer) |
| `plan`           | Task decomposition                           |
| `implementation` | Code + config + resources                    |
| `verification`   | Test/review/accept evidence                  |
| `change-record`  | Change trail (CR/changelog/archive)          |

## Special: Contract artifacts

Contract artifacts have **bilateral nature** — a producer side and consumer side. The producer creates the contract, consumers bind to it. Contract changes trigger ripple effects to all consumers.
