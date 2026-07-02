---
name: spec-graph-sub-agent-methodology
description: Define sub-agent execution standards: code, tests, lint, typecheck, build, self-review, functionality verification.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-sub-agent-methodology

## Each sub-agent must complete

1. **Code**: Follow project conventions, JSDoc, no dead code
2. **Unit Tests**: Cover core logic + edge cases
3. **Lint + Typecheck**: All clean
4. **Build**: Project builds successfully
5. **Self-Review**: Read own diff, check naming/bugs
6. **Functionality Verification**: All spec scenarios pass

## All 6 must pass for Level 1 (Individual) gate
