---
name: spec-graph-plan
description: "Plan stage orchestrator. Single-shot command that reads graph.yaml + machine-state.yaml, runs dispatch once to get manifest, shows pending artifacts and gate status, and outputs clear agent instructions. Agent re-runs after each artifact completion to drive the plan forward. Use during the plan stage when artifacts need to be produced."
---

# spec-graph plan

Plan stage single-shot orchestrator. Shows what needs to be produced and outputs agent instructions.

## Architecture Principle

**spec-graph does NOT produce artifacts. It only shows status and instructions.**

- ❌ spec-graph does not write documents
- ❌ spec-graph does not auto-complete artifacts
- ❌ spec-graph does not loop — it is a single-shot command
- ✅ spec-graph reads graph.yaml + machine-state.yaml to determine what is pending
- ✅ spec-graph runs dispatch once to get the latest manifest
- ✅ spec-graph outputs artifact-by-artifact instructions for the agent

**The AI agent is responsible for producing every artifact.** The agent reads the pending list, looks up template_ref/document_guidance from the dispatch manifest, writes the document, and marks it complete.

## What this does

Plan is the **production orchestration command** for the plan stage. When the machine state is `plan`, it:

1. **Reads graph.yaml** — retrieves the full artifact declaration list
2. **Reads machine-state.yaml** — checks which artifacts are completed vs pending
3. **Runs dispatch once** — captures the dispatch manifest (gate status, actions, template refs)
4. **Shows plan status** — completed count, pending list grouped by kind in priority order
5. **Outputs agent instructions** — step-by-step for each pending artifact

Kind priority order: `requirement` → `design` → `plan` → `contract` → `verification` → `implementation` → `meta`

If the current stage is NOT `plan`, plan reports "Plan complete" and exits — no dispatch is run.

## Usage

```bash
# Standard status check + agent instructions
spec-graph plan

# JSON output (for programmatic consumption by coordinator)
spec-graph plan --json
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON: stage, gate, gate_passed, artifacts_total, artifacts_completed, artifacts_pending (with id + kind), and actions from dispatch manifest |

### JSON Output Structure

```json
{
  "stage": "plan",
  "gate": "plan-gate",
  "gate_passed": false,
  "artifacts_total": 8,
  "artifacts_completed": 3,
  "artifacts_pending": [
    { "id": "requirement/prd/PRD-001", "kind": "requirement/prd" },
    { "id": "design/architecture/ARCH-001", "kind": "design/architecture" }
  ],
  "actions": [ /* dispatch manifest actions */ ]
}
```

## Execution Rules

### ✅ When to use

- **Entering plan stage**: prime or transition moved machine to `plan`, need to see what to produce
- **After each artifact completion**: agent completes an artifact → re-run plan to check progress and get next instruction
- **After gate check**: gate blocked? → plan shows what's still missing
- **Coordinator auto-loop**: dispatch manifest says `current_stage: plan` → run plan to see artifact list

### ❌ When NOT to use

- **Not in plan stage**: plan will report "Plan complete" and suggest `spec-graph next`
- **Project not initialized**: plan requires `.spec-graph/graph.yaml` and `machine-state.yaml` — run `spec-graph init` first
- **As a loop replacement**: plan is single-shot. The agent must re-invoke it after each artifact. It does NOT auto-loop.

## Agent Workflow: Read → Produce → Complete → Re-check

The standard agent workflow for plan stage production:

### Step 1: Run plan for initial status

```bash
spec-graph plan
```

Agent reads the output and notes:
- How many artifacts total vs completed
- Which artifacts are pending (by kind, in priority order)
- Whether the gate is blocked
- The dispatch manifest's template_ref and suggested_doc_path for each pending artifact

### Step 2: Run dispatch for detailed context

For the highest-priority pending artifact, run dispatch to get its full context:

```bash
spec-graph dispatch --json
```

The manifest provides:
- `template_ref` — template to use for the artifact document
- `suggested_doc_path` — where to write the document
- `document_guidance` — what the document should contain
- `distilled_context` — relevant upstream artifacts (if any)
- `input_artifacts` — upstream completed artifacts to feed into this production

### Step 3: Produce the artifact document

Agent reads the template (if `template_ref` is set), collects input artifacts, and writes the document to `suggested_doc_path`.

### Step 4: Mark artifact complete

```bash
spec-graph artifact complete <artifact-id> --producer agent
```

### Step 5: Re-check progress

```bash
spec-graph plan
```

If pending artifacts remain → go to Step 2 for the next one.
If all artifacts completed → plan reports "Plan complete" → run `spec-graph next`.

### Gate Blocked Flow

If `plan` output shows `Gate blocked: <gate-name>`:
1. Run `spec-graph gate <gate-name>` to see gate requirements
2. Address the failures (missing artifacts, failed checks, missing traces)
3. Re-run `spec-graph plan` to check status

## Usage Scenarios

### Scenario 1: Fresh plan stage — all artifacts pending

```bash
$ spec-graph plan

 Plan Stage Status
  Stage: plan
  Artifacts: 0/8 completed

  Pending artifacts (8):

  ⬜ requirement/prd/PRD-001
      Role: analyst  →  .spec-graph/artifacts/prd/PRD-001.md
  ⬜ design/architecture/ARCH-001
      Role: architect  →  .spec-graph/artifacts/architecture/ARCH-001.md
  ...

  Agent — execute this:

  For each pending artifact above:
    1. Produce document at the suggested path
    2. Mark complete:
       spec-graph artifact complete <id> --producer agent
    3. Re-check progress:
       spec-graph plan

  Or run dispatch for detailed context:
       spec-graph dispatch --json
```

Agent follows the instructions and produces artifacts one by one, re-running `spec-graph plan` after each.

### Scenario 2: Mid-plan — some artifacts completed

```bash
$ spec-graph plan

 Plan Stage Status
  Stage: plan
  Artifacts: 3/8 completed

  Pending artifacts (5):

  ⬜ design/architecture/ARCH-001
      Role: architect  →  .spec-graph/artifacts/architecture/ARCH-001.md
  ⬜ plan/epic/EPIC-001
      Role: planner  →  .spec-graph/artifacts/epics/EPIC-001.md
  ...
```

Agent knows exactly which artifacts remain and in what priority order.

### Scenario 3: All plan artifacts completed

```bash
$ spec-graph plan

✓ Plan complete. Current: plan
```

Agent runs `spec-graph next` to transition to the next stage.

### Scenario 4: Plan not started — wrong stage

```bash
$ spec-graph plan

✓ Plan complete. Current: prime
```

Agent should NOT try to produce artifacts. The machine is not in plan stage.

### Scenario 5: Gate blocked during plan

```bash
$ spec-graph plan

 Plan Stage Status
  Stage: plan
  Artifacts: 5/8 completed

  Pending artifacts (3):
  ...

  Gate blocked: plan-gate
```

Agent runs `spec-graph gate plan-gate` to see what's missing, addresses the failures, then re-runs `spec-graph plan`.

### Scenario 6: JSON mode for coordinator auto-loop

```bash
$ spec-graph plan --json
{
  "stage": "plan",
  "gate": "plan-gate",
  "gate_passed": false,
  "artifacts_total": 8,
  "artifacts_completed": 2,
  "artifacts_pending": [
    { "id": "requirement/prd/PRD-001", "kind": "requirement/prd" },
    ...
  ],
  "actions": [ ... ]
}
```

Coordinator parses JSON, identifies next artifact to produce, reads its dispatch action for template/guidance, dispatches sub-agent, and loops.

### Scenario 7: Plan invoked outside spec-graph project

```bash
$ spec-graph plan
✗ Project not initialized. Run `spec-graph init` first.
```

Agent must initialize the project before plan can be used.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Project not initialized` | No `.spec-graph/` directory | Run `spec-graph init` |
| `Graph not found` (via dispatch) | compose not run yet | Run `spec-graph compose` |
| Dispatch internal error | graph.yaml or machine-state.yaml corrupted | Run `spec-graph doctor` to diagnose |
| Gate blocked | Missing artifacts, failed checks, or missing traces | Run `spec-graph gate <name>` for details, then address each failure |

## 衔接关系 (Transition Relationships)

- **前置 (prerequisite)**: `spec-graph prime` — machine must be primed and in plan stage
- **后续 (follow-up)**: `spec-graph next` — run when plan reports "Plan complete"
- **循环搭配 (loop pair)**: `spec-graph dispatch --json` — run dispatch to get detailed context before producing each artifact
- **artifact 生产闭环**: `plan` → read pending → `dispatch --json` → produce doc → `artifact complete` → `plan` (re-check) → ... → `next`
- **gate 检查**: `spec-graph gate <name>` — diagnose blocked gates that plan reveals
- **快速路径**: in `spec-graph init`, prime bootstraps directly into plan stage
