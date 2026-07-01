---
name: spec-graph-parallel
description: Guide the host agent through parallel sub-agent execution. Covers three-level integration gate, dependency analysis, file conflict detection, and auto-degradation to serial on failure.
license: MIT
compatibility: Requires host agent with sub-agent tool (Claude Code Agent tool, Codex Subagents, Cursor parallel agents, etc.)
metadata:
  author: spec-graph
  version: "2.0"
---

Guide the host agent to execute tasks in parallel using sub-agents.

## When to use

- User has confirmed plan with multiple tasks
- User explicitly enabled parallel mode (`--mode parallel` or `--mode auto`)
- spec-graph's dependency-analyzer has produced an execution plan with waves

## Steps

### 1. Read the execution plan

```bash
spec-graph waves --json
```

Output: `{waves: [["A", "B"], ["C"]], edges: [...], serialTasks: [...]}`

### 2. For each wave, dispatch sub-agents in parallel

For wave 1 with tasks A and B:

**Claude Code:**
```
Call the Agent tool twice in parallel:
- Agent 1: task A's prompt (see spec-graph next-prompt)
- Agent 2: task B's prompt (see spec-graph next-prompt)
```

**Codex CLI:**
```
Subagents feature dispatches in parallel automatically
```

**Cursor:**
```
Use Composer mode with parallel sub-agents
```

### 3. Wait for all sub-agents to complete

Each sub-agent must:
- Pass Level 1 (Individual) gate: tests, lint, typecheck, build, self-review, functionality
- Produce artifacts (file changes)

### 4. Pass the three-level integration gate

The host agent runs the three-level gate via `spec-graph integration-status --json`:

- **Level 1 (Individual)**: Each sub-agent's own work passes gate
- **Level 2 (Merge)**: Merging to main passes tests, lint, typecheck, build, code review
- **Level 3 (System)**: Integration tests, style consistency, e2e tests, comprehensive review pass

If any level fails:
- Use `spec-graph diagnose` to identify the failure source
- Apply `spec-graph parallel-recovery` strategy
- If recovery fails: auto-degrade to serial mode

### 5. Merge results

```bash
# For each sub-agent's worktree (in completion order):
git rebase main  # or git pull --rebase
git merge --no-ff <branch>
```

If merge conflict: use `spec-graph parallel-recovery` strategy.

### 6. Report status

After all waves complete, report:
- Final state (success / partial / failed)
- All recovered failures
- Any tasks that were auto-degraded to serial

## Edge cases

- **Sub-agent fails Level 1 gate**: that specific sub-agent retries, others continue
- **Merge conflict**: parallel-recovery decides rebase vs degrade to serial
- **System gate fails**: parallel-recovery identifies failing sub-agent, retries or degrades
- **All retries fail**: auto-degrade to serial mode, preserve completed work
- **Host agent has no sub-agent tool**: fallback to serial mode automatically

## Recovery

When parallel fails, use `spec-graph parallel-recovery` to:
- Attribute failure to specific sub-agent
- Retry only the failing sub-agent
- Degrade to serial if attribution fails

See `spec-graph-parallel-recovery` skill for details.
