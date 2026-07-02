---
name: spec-graph-init
description: Initialize a new spec-graph project from scratch. Runs the full bootstrap pipeline: sense project profile → compose workflow graph → prime machine state → display ready status. Use when the user wants to set up spec-graph for a new or existing project.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed.
metadata:
  author: spec-graph
  version: "2.0"
---

Bootstrap spec-graph for a project.

spec-graph needs a `.spec-graph/` directory with a composed graph and primed state before any workflow can run. This skill walks through the one-time setup.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph init` | One-shot bootstrap: sense → compose → prime |
| `spec-graph config` | Inspect project profile |
| `spec-graph compose` | Re-compose graph after config changes |
| `spec-graph status` | Verify initialization |

Backed by core modules: `sense`, `knowledge-base`, `automator`

---

## The Stance

- **Analyze the project first.** spec-graph does NOT scan files. You (the agent) must determine the tech stack, conventions, and project type.
- **One-shot initialization.** init runs the full pipeline in a single invocation.
- **Idempotent.** Running init on an existing project is safe (use `--force` to overwrite).

---

## Steps

### 1. Sense the project

Run:

```bash
spec-graph init --json
```

If the project profile is incomplete or wrong, set it with:

```bash
spec-graph config --json
```

### 2. Compose the graph

spec-graph init runs compose automatically, but to re-compose after config changes:

```bash
spec-graph compose --json
```

This generates `.spec-graph/graph.yaml` with artifacts, checks, and gates for each FSM stage.

### 3. Verify

```bash
spec-graph status
```

Should show all 8 stages ready, all artifacts pending.

---

## What happens next

After initialization, run `spec-graph plan "<intent>"` to start the first workflow.

---

## Edge cases

- **Already initialized**: init detects existing `.spec-graph/` and refuses to overwrite unless `--force` is used
- **Brownfield project**: init works the same for existing and new projects — the agent is responsible for setting the correct profile
- **Missing tech stack info**: if the agent can't determine the tech stack, set reasonable defaults and note the ambiguity
