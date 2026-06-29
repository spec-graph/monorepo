---
name: spec-graph-scope
description: "Manage scope locks: declare allowed/protected/forbidden paths for isolation units. Detect scope overlaps between parallel worktrees."
---

# spec-graph scope

Scope lock management.

## Usage

```bash
spec-graph scope lock <unit-id> --allowed "src/a/**" --forbidden "src/secret/**"
spec-graph scope check --unit <id> --files "file1,file2"
spec-graph scope overlap    # Detect scope conflicts between active units
spec-graph scope list
