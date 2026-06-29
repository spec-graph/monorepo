---
name: spec-graph-prime
description: "Seed machine state with graph-declared artifacts and checks. Initializes the state machine with all artifacts from the graph as pending, and all checks as pending. Use after compose to initialize the workflow state."
---

# spec-graph prime

Seed machine state with graph-declared artifacts and checks.

## What this does

After `spec-graph compose` creates the graph, `prime` initializes the machine state:

1. **Seeds artifacts** — adds all graph artifacts as `pending` in machine state
2. **Seeds checks** — adds all graph checks as `pending` (or `passed` if bootstrapping placeholders)
3. **Creates trace skeletons** — generates trace files for gate-required queries
4. **Bootstraps placeholders** — auto-passes checks with `<placeholder>` commands

## Usage

```bash
# Prime with real checks pending
npx spec-graph prime

# Prime and auto-pass placeholder checks
npx spec-graph prime --bootstrap
```

### Options

- `--bootstrap` — Auto-pass placeholder checks (commands like `<clarify-scan>`)
- `--json` — Output as JSON

## When to use

- **After `spec-graph compose`** — to initialize the workflow state
- **After profile changes** — if you re-composed the graph
- **When machine state is corrupt** — re-prime to reset

## Don't re-prime if

- You have in-progress work — re-prime would reset statuses
- You've already run checks — re-prime doesn't overwrite existing state
- Machine state exists and is valid

## Quick bootstrap flow

```bash
npx spec-graph init --quick  # init + compose + prime --bootstrap
```
