---
name: spec-graph-compose
description: "Compose the workflow graph from profile and packs. Compose is the second step — it matches packs to the profile and generates graph.yaml with artifacts, checks, gates, and tracks. Use after sense or when profile changes."
---

# spec-graph compose

Compose the workflow graph from `profile.yaml` and pack library.

## What this does

The **Compose engine** takes the frozen profile and:

1. **Matches domain packs** — evaluates each pack's `applies_when` against profile facts
2. **Matches intent pack** — selects the change-intent pack (feature/bugfix/refactor/...)
3. **Merges artifacts, checks, gates** — union of all matching packs' declarations
4. **Applies gate patches** — planning packs inject requirements into foundation gates
5. **Assembles tracks** — collects parallel execution tracks from domain packs
6. **Detects conflicts** — reports missing artifact/check references

Output: `.spec-graph/graph.yaml` — the **single source of truth** for the workflow.

## Usage

```bash
npx spec-graph compose
```

### Options

- `--change-type <type>` — Change intent: `feature` (default), `bugfix`, `refactor`, `spike`, `performance`, `migration`, `deprecation`
- `-o, --output <file>` — Output file path (default: `.spec-graph/graph.yaml`)

## After compose

1. **Review the graph** — run `spec-graph show` for a summary
2. **Check for warnings/errors** — compose reports missing references
3. **Run `spec-graph prime`** to seed the machine state with graph declarations
4. **Run `spec-graph gate`** to verify entry gates

## When to re-compose

- After editing `profile.yaml`
- When changing change type (e.g., feature → bugfix)
- When adding/updating custom packs in `packs/` directory
