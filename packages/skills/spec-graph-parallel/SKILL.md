---
name: spec-graph-parallel
description: Guide parallel sub-agent execution with three-level integration gate. Covers sub-agent dispatch, dependency analysis, file conflict detection, recovery, and auto-degradation to serial.
license: MIT
compatibility: Requires host agent with sub-agent tool (Claude Code Agent tool, Codex Subagents, etc.)
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-parallel

## Steps

1. Read execution plan: `spec-graph waves --json`
2. For each wave, dispatch sub-agents in parallel
3. Wait for all sub-agents to complete
4. Run three-level integration gate:
   - Level 1: Individual gate per sub-agent
   - Level 2: Merge gate after merging to main
   - Level 3: System gate (full integration)
5. If gate fails, use `spec-graph parallel-recovery` strategy
6. If recovery fails, auto-degrade to serial

## Edge cases

- **Sub-agent fails Level 1**: retry that sub-agent only
- **Merge conflict**: analyze conflict source, rebase or degrade
- **System gate fails**: attribution identifies failing sub-agent
- **All retries fail**: auto-degrade to serial mode
- **No sub-agent tool**: fallback to serial automatically
