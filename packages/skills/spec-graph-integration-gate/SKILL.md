---
name: spec-graph-integration-gate
description: Apply three-level integration gate (Individual + Merge + System) to validate parallel execution. All three must pass.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-integration-gate

## Steps

1. **Level 1: Individual Gate** — per sub-agent:
   - Unit tests pass
   - Lint clean
   - Typecheck clean
   - Build succeeds
   - Self-review completed
   - Functionality matches specs

2. **Level 2: Merge Gate** — after merging each worktree:
   - All tests pass on main
   - Lint/typecheck/build clean
   - Code review passes
   - Functionality verified

3. **Level 3: System Gate** — after all merges:
   - Integration tests pass
   - E2E tests pass (if defined)
   - Style consistency
   - Cross-agent consistency
   - Comprehensive review passes

## Result

- All three pass → parallel wave successful
- Any level fails → use `spec-graph parallel-recovery`
