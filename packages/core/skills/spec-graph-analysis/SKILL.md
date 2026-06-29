---
name: spec-graph-analysis
description: "Manage phase analysis: persist decisions, key findings, and document paths for each workflow phase. Links tasks, artifacts, and templates."
---

# spec-graph analysis

Phase analysis persistence.

## Usage

```bash
spec-graph analysis --phase list                    # List all phases
spec-graph analysis --phase propose                 # Show propose phase analysis
spec-graph analysis --phase propose --content "..." # Write analysis
spec-graph analysis --phase propose --tasks "T-1,T-2" --docs "path.md"
```

Stored at `.spec-graph/analysis/<phase>.yaml`.
