# @spec-graph/skills

SKILL.md collection for AI agents to orchestrate the spec-graph CLI.

Each skill is a `SKILL.md` file that Claude Code (or similar AI agents) reads
to understand how to use spec-graph for a specific task.

## Skills (7)

### spec-graph-init

Bootstrap a new or existing project for spec-graph.

```
/spec-graph-init
```

Creates `.spec-graph/` directory, writes config.yaml, registers dispatch-watcher hook.

### spec-graph-plan

Transform user intent into a structured plan.

```
/spec-graph-plan "<intent>"
```

Creates a session, generates a plan, and asks the user to confirm before proceeding.

### spec-graph-dispatch

Run the full dispatch workflow (8-stage FSM loop).

```
/spec-graph-dispatch
```

Loops: dispatch --json → hook → sub-agent → advance. Repeats 8 times until completed.

### spec-graph-status

Check the current workflow state.

```
/spec-graph-status
```

Returns current stage, progress, blockers, recent diagnosis.

### spec-graph-validate

Validate current state against stage gates.

```
/spec-graph-validate
```

Evaluates entry/exit criteria and reports pass/fail.

### spec-graph-diagnose

Diagnose a gate failure with root cause and fix suggestions.

```
/spec-graph-diagnose
```

Shows which criteria failed, why, and how to fix.

### spec-graph-intervene

Manual intervention in the workflow.

```
/spec-graph-intervene <action>
```

Actions: `force-advance`, `rollback`, `resume`, `modify-plan`.

## Architecture

Skills are the **orchestration layer** — they tell AI agents how to compose CLI commands into workflows. One skill covers N CLI commands. Not every CLI command needs a skill.

```
Skills  (7, orchestration)  →  CLI  (20+, atomic ops)  →  Core  (9 modules, API)
```

Each skill documents:
1. **Orchestrates** — which CLI commands it uses and which core modules back them
2. **Stance** — how the agent should think about this task
3. **Steps** — which CLI commands to invoke, in what order
4. **Response handling** — how to interpret CLI output
5. **Edge cases** — what to do on error

## Installation

```bash
# Global
node packages/skills/scripts/install-skills.mjs

# Project-local
node packages/skills/scripts/install-skills.mjs --local
```
