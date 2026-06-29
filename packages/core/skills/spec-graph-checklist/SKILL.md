---
name: spec-graph-checklist
description: "Generate pre-implementation quality checklist for a story. 5 mechanical checks + 5 soft checks with automatic ambiguous adjective detection."
---

# spec-graph checklist

Quality checklist for stories.

## Usage

```bash
spec-graph checklist <story-id> [--json]
```

## Checks

**Mechanical (auto):** requirement mapping, scope atomicity, AC count, requirement resolution, path safety
**Soft (manual):** ambiguous adjectives (auto-detected), AC verifiability, edge cases, dependencies, out-of-scope
