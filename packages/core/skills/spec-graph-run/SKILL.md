---
name: spec-graph-run
description: "Run the deterministic workflow loop with diff-select, retry, and periodic tier support. Auto-executes allowed actions until blocked or complete. Use for automated progression through the workflow."
---

# spec-graph run

Run the deterministic workflow loop until blocked or complete.

## What this does

The **run loop** is the core automation engine:

1. Computes the next plan (`spec-graph next`)
2. Checks if the action is allowed by permissions
3. Executes the action (run check, advance transition)
4. Repeats until done, blocked, or max steps reached

### Key features

- **Diff-select** — only runs checks for files changed since last green build (`--diff`)
- **Retry with backoff** — retries failed checks with configurable strategy (`--retries`, `--backoff`)
- **Periodic tier** — checks marked `tier: periodic` are skipped by default; opt-in with `--include-periodic`

Respects the permission level:

- `full-auto` — auto-executes everything
- `semi-auto` — auto-executes checks + gated transitions only
- `manual` — auto-executes nothing

## Usage

```bash
# Run with default settings (10 max steps, 120s timeout)
npx spec-graph run

# Limit steps
npx spec-graph run --max-steps 5

# Dry-run (execute checks as dry-run)
npx spec-graph run --dry-run

# Custom timeout per check
npx spec-graph run --timeout 60000

# Only run checks for changed files
npx spec-graph run --diff

# Retry failed checks up to 3 times with exponential backoff
npx spec-graph run --retries 3 --backoff exponential

# Include periodic-tier checks
npx spec-graph run --include-periodic
```

### Options

- `--max-steps <n>` — Maximum number of actions to execute (default: 10)
- `--timeout <ms>` — Timeout per check in milliseconds (default: 120000)
- `--dry-run` — Dry-run checks instead of executing commands
- `--diff` — Only run checks for files changed since last green build
- `--retries <n>` — Retry failed checks up to N times (default: 0)
- `--backoff <strategy>` — Backoff strategy: `fixed` (default), `linear`, `exponential`
- `--include-periodic` — Also run checks marked `tier: periodic`
- `--json` — Output as JSON

## Run results

| Status | Meaning |
|--------|---------|
| Complete | Workflow is finished |
| Blocked | Agent work or manual action required |
| Failed | A check failed or transition was blocked |

## When blocked

The run loop stops when it hits an action that requires agent work (produce artifact, verify trace, etc.). It tells you what's needed:

```
Next action: Produce and mark artifact 'plan/story' as completed
Suggested dispatch: spec-graph dispatch
```

Use `spec-graph dispatch` to hand off to an AI agent, then `spec-graph run` again to continue.
