# @spec-graph/skills

SKILL.md collection for AI agents to orchestrate the spec-graph CLI.

Each skill is a `SKILL.md` file that Claude Code (or similar AI agents) reads
to understand how to use spec-graph for a specific task.

## Skills

### spec-graph-plan

Transform user intent into a structured plan.

```
/spec-graph-plan "<intent>"
```

Creates a session, generates a plan, and asks the user to confirm before
proceeding.

### spec-graph-auto

Start the full automatic workflow.

```
/spec-graph-auto "<intent>"
```

Creates a session, confirms the plan, and runs the automatic loop:
generate prompt → invoke agent → submit result → advance state.

### spec-graph-status

Check the current workflow state.

```
/spec-graph-status
```

Returns: current stage, progress, blockers, recent diagnosis.

### spec-graph-intervene

Manual intervention in the workflow.

```
/spec-graph-intervene <action>
```

Available actions: `force-advance`, `rollback`, `resume`, `modify-plan`.

## Installation

Copy the skill directories to your Claude Code skills location:

```bash
# Global installation
cp -r packages/skills/spec-graph-* ~/.claude/skills/

# Or project-local
cp -r packages/skills/spec-graph-* .claude/skills/
```

## How Skills Work

Each SKILL.md contains:

1. **Stance** — how the agent should think about this task
2. **Steps** — which CLI commands to invoke, in what order
3. **Response handling** — how to interpret CLI output
4. **Edge cases** — what to do on error

Skills are "编排层" (orchestration layer) — they tell the agent how to use
the CLI commands in sequence to accomplish a workflow.
