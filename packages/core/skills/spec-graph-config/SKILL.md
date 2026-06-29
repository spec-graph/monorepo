---
name: spec-graph-config
description: "Manage project-level config: inject context (tech stack, conventions), per-artifact validation rules, and external references into the workflow."
---

# spec-graph config

Project-level configuration.

## Usage

```bash
spec-graph config show          # View current config
spec-graph config init          # Create template
spec-graph config set <k>=<v>   # Set values
spec-graph config clear         # Remove config
```

Stored at `.spec-graph/config.yaml`. Context is injected into compose and dispatch.
