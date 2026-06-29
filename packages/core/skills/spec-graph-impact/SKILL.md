---
name: spec-graph-impact
description: "Analyze the blast radius of changes — identify all downstream artifacts, checks, and gates affected by a change. Use during planning or before implementing changes."
---

# spec-graph impact

Analyze downstream impact of artifact changes.

## Usage

```bash
spec-graph impact --artifact <id> [--mark-stale] [--json]
```

## What this does

- Traces all downstream dependencies (transitive closure)
- Identifies affected checks and gates
- `--mark-stale`: flags affected artifacts as stale in machine-state
