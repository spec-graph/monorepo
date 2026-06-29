---
name: spec-graph-machine
description: "Manage the workflow state machine. Initialize, inspect, transition, restart-stage, and track artifact/check statuses. Use for direct state machine control."
---

# spec-graph machine

Manage the workflow state machine.

## What this does

The state machine is the workflow engine's core:

- Tracks the **current stage** (e.g., implement, review, test, accept)
- Records **stage history** (audit trail of transitions)
- Tracks **artifact statuses** (pending → in_progress → completed)
- Tracks **check statuses** (pending → running → passed/failed)
- Supports **restart-stage** — reset incomplete artifacts/checks to pending without losing completed work

## Usage

```bash
# Show current machine state
npx spec-graph machine status

# Initialize machine state
npx spec-graph machine init --stage implement

# Transition between stages
npx spec-graph machine transition --from plan --to implement --action "completed planning"

# View transition history
npx spec-graph machine history

# Update artifact status
npx spec-graph machine update --artifact plan/story --status completed

# Update check status
npx spec-graph machine update --check lint --status passed

# Restart current stage (reset incomplete items to pending)
npx spec-graph machine restart-stage
```

### Options

- `--stage <stage>` — Initial stage for init
- `--from <stage>` — Source stage for transition
- `--to <stage>` — Target stage for transition
- `--action <action>` — Action/actor that triggered the transition
- `--artifact <id>` — Artifact ID to update
- `--check <id>` — Check ID to update
- `--status <status>` — Status for update: pending, in_progress, completed, failed (artifacts) or pending, running, passed, failed (checks)

## restart-stage

When a gate fails and you need to redo the current stage without losing progress:

```bash
npx spec-graph machine restart-stage
```

This preserves completed artifacts/checks and resets only incomplete/pending ones. Use when:
- A gate check fails and you need to re-run the current stage
- You want to retry from the current stage without full re-dispatch
- Partial progress exists and should be preserved

## Transition rules

Transitions are validated against:

1. **Current stage** — can only transition from the current stage
2. **Valid transitions** — must follow the graph's declared stage order
3. **Gate conditions** — all required artifacts, checks, traces, and forbidden invariants must be satisfied

If a gate blocks the transition, the machine state is **not updated**.

## State file

Machine state is persisted in `.spec-graph/machine-state.yaml`.
