---
name: spec-graph-analyze
description: "Cross-artifact consistency analysis: detects duplication, coverage gaps, terminology drift, vague language, and AC gaps across all artifacts."
---

# spec-graph analyze

Cross-artifact consistency analysis.

## Usage

```bash
spec-graph analyze [--json]
```

## What this detects

- Duplication (same content in multiple artifacts)
- Coverage gaps (requirements with no design/stories)
- Terminology drift (same concept named differently)
- Vague language (fast, robust, scalable etc.)
- AC gaps (stories with acceptance criteria not covered by tasks)
