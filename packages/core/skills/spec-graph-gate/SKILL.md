---
name: spec-graph-gate
description: "Evaluate gates and show what is blocking workflow progression. Use when you need to know what artifacts, checks, or traces are missing before advancing to the next stage."
---

# spec-graph gate

Evaluate all gates in the composed graph against current machine state.

## What this does

The **Enforce engine** evaluates each enabled gate:

1. Checks **required artifacts** — are they marked `completed` in machine state?
2. Checks **required checks** — are they marked `passed` in machine state?
3. Checks **required traces** — do trace files satisfy the trace queries?
4. Checks **forbidden invariants** — are any listed violations present?

Reports which gates pass, which fail, and exactly what's missing.

## Usage

```bash
npx spec-graph gate
```

### Options

- `--phase <name>` — Evaluate a specific gate only (e.g., `--phase entry-phase4`)

## Output

For each gate, shows:

- Pass/fail status
- **Missing artifacts** — required artifacts not marked `completed`
- **Failed checks** — required checks not marked `passed`
- **Missing traces** — trace queries not satisfied
- **Forbidden violations** — invariant violations present

## Gates in the workflow

Gates guard state transitions. A transition is **blocked** until all required artifacts are completed, all required checks pass, and all required traces are verified.

Common gates:

- `entry-phase4` — gates the plan→implement transition
- `exit-merged` — gates the accept→integrate transition
- `requirements-clarified` — gates the specify→design transition
- `architecture-ready` — gates the design→plan transition
- `contract-frozen` — gates the contract→implement transition

## Gate evaluation details

Each gate declaration in `graph.yaml` specifies:

```yaml
gates:
  - id: entry-phase4
    requires:
      artifacts: [plan/story, plan/tasks]    # must be completed
      checks: [lint, typecheck]               # must be passed
      traces:                                 # trace queries with cardinality
        - query: "requirement→plan"
          cardinality: every
    forbids:                                  # invariant violations
      - duplicate_implementation
```
