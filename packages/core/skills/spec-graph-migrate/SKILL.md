---
name: spec-graph-migrate
description: "Generate migration plan for existing projects: analyze codebase, identify gaps (linting, TypeScript, tests), suggest incremental steps."
---

# spec-graph migrate

Migration planning for legacy projects.

## Usage

```bash
spec-graph migrate [--json]
```

## What this does

- Scans existing codebase for linting, TypeScript, test frameworks
- Detects project structure (src/, components/, lib/, api/)
- Generates prioritized migration steps (high/medium/low)
