---
name: spec-graph-check
description: "Run validation checks from the composed graph. Executes shell commands declared in checks (lint, test, typecheck, etc.). Use to run all checks or a specific layer."
---

# spec-graph check

Run validation checks from the composed graph.

## What this does

Executes the shell commands declared in `graph.yaml` checks:

- **Unit layer** — lint, typecheck, unit tests
- **Integration layer** — component integration, contract tests
- **System layer** — full system tests, Lighthouse, a11y
- **Deployment layer** — E2E browser tests, HIL tests

Each check updates the machine state (passed/failed) which gates evaluate.

## Usage

```bash
# Run all checks
npx spec-graph check

# Run a specific check
npx spec-graph check --id lint

# Run checks for a specific layer
npx spec-graph check --layer unit

# Dry-run (mark all as passed without executing)
npx spec-graph check --dry-run
```

### Options

- `--id <id>` — Run a specific check by ID
- `--layer <layer>` — Run checks for a layer: unit, integration, system, deployment
- `--dry-run` — Don't execute commands; mark selected checks as passed
- `--timeout <ms>` — Timeout per check in milliseconds (default: 120000)
- `--json` — Output as JSON

## Placeholder commands

Checks with commands like `<clarify-scan>` are **placeholders** — they represent LLM-driven analysis that can't be automated. Use `spec-graph prime --bootstrap` to auto-pass them, or replace with real commands.

## Integration with `spec-graph run`

`spec-graph run` automatically executes checks that are allowed by the permission level. Use `spec-graph check` directly when you want to run checks without the full run loop.
