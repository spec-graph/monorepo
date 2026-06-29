---
name: spec-graph-show
description: "Display a summary of the current composed graph. Shows artifacts, checks, gates, tracks, and acceptance layers. Use for a quick overview of the workflow structure."
---

# spec-graph show

Display a summary of the current composed workflow graph.

## What this does

Reads `.spec-graph/graph.yaml` and renders a table showing:

- **Artifacts** — declared work products and their kinds
- **Checks** — validation commands and their layers
- **Gates** — transition guards and their requirements
- **Tracks** — parallel execution tracks
- **Acceptance layers** — L1 unit through L4 deployment
- **Pipeline stages** — the ordered workflow

## Usage

```bash
npx spec-graph show
```

### Options

- `--format <type>` — Output format: `table` (default) or `json`

## When to use

- After `spec-graph compose` to verify the graph looks correct
- To check which packs matched and what artifacts/checks they contributed
- Quick reference for what the workflow expects
