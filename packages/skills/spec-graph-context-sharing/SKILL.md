---
name: spec-graph-context-sharing
description: Guide shared context generation for parallel sub-agents. Ensures consistent understanding across wave.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-context-sharing

## What gets shared

1. **Project profile**: Language, framework, runtime, test framework, brownfield, existing features
2. **Project overview**: Architecture, key modules
3. **Other sub-agents' plans** (READ-ONLY): Each agent's task + files
4. **Shared methodology**: Naming, code structure, comments, test patterns

## Constraints

- Context must be < 2000 words
- JSON + Markdown format
- Sensitive information filtered
