---
name: spec-graph-install
description: "Install spec-graph skills into your IDE project (Claude Code, Cursor, OpenCode). Copies skill definitions for all commands."
---

# spec-graph install

Install skills into IDE project.

## Usage

```bash
spec-graph install                     # Auto-detect IDE
spec-graph install --ide claude-code   # Force Claude Code
spec-graph install --target ~/project  # Specific project
```

Installs skills to `.claude/skills/` (Claude Code), `.cursor/skills/` (Cursor), etc.
