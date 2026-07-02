---
name: spec-graph-intervene
description: Intervene in the current spec-graph workflow. Use when the user wants to modify the plan, force-advance past a gate, rollback a stage, or otherwise take manual control of the automatic workflow.
license: MIT
compatibility: Requires spec-graph CLI (v2+) installed.
metadata:
  author: spec-graph
  version: "2.0"
---

Intervene in a spec-graph workflow session.

Intervention is a powerful escape hatch. Use it only when the automatic workflow cannot proceed (e.g., stuck on a gate, user wants to change scope, plan needs adjustment).

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph intervene --session <id>` | Modify plan or force-advance state |
| `spec-graph machine --session <id> --transition advance` | Direct FSM transition |
| `spec-graph status --session <id>` | Check current state before intervention |

Backed by core modules: `automator`

---

## The Stance

- **Intervene deliberately.** Each intervention is recorded in the trace log. Prefer auto-progression when possible.
- **Explain to the user.** Before executing an intervention, confirm with the user what they want to do and what the consequences are.

---

## Intervention types

### Modify the plan

If the user wants to change scope after plan confirmation:

```bash
spec-graph intervene --action modify-plan --plan '<new plan JSON>'
```

spec-graph will re-evaluate which stages need to be re-run based on the new plan.

### Force-advance past a gate

If the user wants to skip a gate (e.g., they accept the risk):

```bash
spec-graph intervene --action force-advance --reason "<justification>"
```

The force-advance and reason are recorded in the trace log.

### Rollback to a previous stage

If the user wants to redo work from a previous stage:

```bash
spec-graph intervene --action rollback --stage <stage-name>
```

spec-graph will reset state to the specified stage. Note: work done after that stage is NOT automatically discarded; the user must manage file changes manually.

### Resume after pause

If the automator paused (e.g., after exhausting retries):

```bash
spec-graph intervene --action resume
```

spec-graph will resume from where it left off, typically after the user has manually fixed the blocking issue.

---

## Steps

### 1. Ask the user what they want to do

Intervention has multiple modes. Use AskUserQuestion to clarify:
- Modify plan
- Force-advance past a gate
- Rollback to a previous stage
- Resume after pause

### 2. Execute the intervention

Run the appropriate command.

### 3. Confirm the result

After intervention, run `spec-graph status` and show the user the new state.

---

## Edge cases

- **No active session**: nothing to intervene on. Suggest starting a new session with `spec-graph-plan`
- **Invalid action for current state**: spec-graph will reject the intervention with an error. Relay the error to the user
