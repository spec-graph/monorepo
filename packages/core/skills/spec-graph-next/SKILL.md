---
name: spec-graph-next
description: 'Show the next required workflow step. Computes what must happen to advance past the current gate. Use as the primary "what do I do now?" command.'
---

# spec-graph next

Show the next required workflow step.

## What this does

The **Next engine** computes the immediate next action by:

1. Finding the next stage in the workflow
2. Finding gates that guard the transition to that stage
3. Evaluating what's missing (artifacts, checks, traces, forbidden violations)
4. Suggesting concrete actions to unblock the transition

## Usage

```bash
npx spec-graph next
```

### Options

- `--json` — Output as JSON

## Suggested action types

| Type                | Description                    | Auto-executable?   |
| ------------------- | ------------------------------ | ------------------ |
| `produce_artifact`  | Create a required work product | No (agent work)    |
| `run_check`         | Execute a validation check     | Yes (in semi-auto) |
| `verify_trace`      | Confirm traceability links     | No (agent work)    |
| `resolve_violation` | Fix a forbidden invariant      | No (agent work)    |
| `transition`        | Advance to next stage          | Yes (in semi-auto) |
| `perform_stage`     | Do the work of the next stage  | No (agent work)    |

## Workflow

```
spec-graph next  →  Do the work  →  spec-graph next  →  ...  →  Done
```

Use `spec-graph next` as a regular checkpoint to know what to do next.
