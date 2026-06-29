---
name: spec-graph-safety-net
description: "Capture or compare baseline snapshots for refactoring safety. Detects removed exports, changed files, and test regressions."
---

# spec-graph safety-net

Refactoring safety baseline.

## Usage

```bash
spec-graph safety-net                   # Capture baseline snapshot
spec-graph safety-net --compare         # Compare against baseline, detect regressions
```

## When to use

- Before major refactoring: capture baseline
- After refactoring: `--compare` to ensure nothing broke
