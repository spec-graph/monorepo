---
name: spec-graph-plan
description: Start the spec-graph planning flow. Transforms a user intent into a structured plan (capabilities, dependencies, complexity, risks), presents it to the user for confirmation. After confirmation, proceed to the spec-graph-dispatch skill for the 8-stage workflow. Use when the user wants to start a new development task with spec-graph.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed globally or locally.
metadata:
  author: spec-graph
  version: "2.0"
---

Start a planning flow with spec-graph.

spec-graph is a declaration engine. It manages the 8-stage FSM, generates dispatch manifests for sub-agents, and evaluates outputs through strict quality gates. It does NOT write code or documents, and does NOT invoke agents directly — all execution is delegated to external coordinators.

This skill walks you through the **planning phase** — the ONLY phase where human confirmation is mandatory. After plan confirmation, proceed to the `spec-graph-dispatch` skill to kick off the 8-stage workflow.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph plan "<intent>" --json` | Transform intent into structured plan |
| `spec-graph intervene --session <id>` | Modify or force-advance if needed |

Backed by core modules: `planning`, `automator`

---

## The Stance

- **Plan first, act second.** Never jump into implementation without a confirmed plan.
- **Intent → structured plan → confirmation → auto execution.** This is the flow.
- **Scope discipline.** The plan defines what's in and what's out. Later stages respect this scope.
- **Risk-aware.** Surface complexity and risks early, not during implementation.

---

## When to use this skill

- User describes a feature, fix, refactor, or any development task that needs planning
- User explicitly asks to "plan", "spec-graph plan", or "use spec-graph"
- You want to kick off spec-graph's automatic workflow

---

## Steps

### 1. Clarify the intent

If the user's intent is ambiguous, ask one clarifying question. Do not over-interview — spec-graph's planner can infer scope from a reasonably clear intent.

If the intent is clear (e.g., "Add JWT authentication", "Refactor the user module"), skip to step 2.

### 2. Invoke the planner

**Default mode (LLM-based):**

```bash
spec-graph plan "<intent>" --json
```

This generates a **planning manifest** — a structured prompt for a planning agent. The manifest contains:
- `prompt` — the full prompt to send to the planning agent
- `schema` — JSON schema the agent's output must conform to
- `agent_config` — agent id (planner) and model tier (capable)
- `next_step` — the confirm command to run after validation

**Workflow:**
1. Run `spec-graph plan "<intent>" --json` → get manifest
2. Dispatch planning agent with `manifest.prompt`
3. Agent returns JSON conforming to `manifest.schema`
4. Validate JSON: `validatePlanOutput()` checks schema + semantics
5. On success: `spec-graph confirm <session-id>` to create session
6. On failure: retry with error feedback, or use `--fallback`

**Fallback mode (offline, keyword matching):**

```bash
spec-graph plan "<intent>" --fallback --json
```

Uses local keyword matching (no LLM). Output is a direct plan:
- `session_id` — the new session identifier
- `capabilities` — list of capabilities with descriptions
- `order` — dependency order
- `complexity` — low / medium / high
- `risks` — identified risks
- `openQuestions` — questions the planner had but couldn't resolve

Use `--fallback` when no LLM is available or for quick offline planning.

### 3. Present the plan to the user

Format the plan clearly. Highlight:
- What will be built (capabilities)
- In what order (dependencies)
- Complexity estimate
- Risks
- Open questions (if any)

Ask the user to confirm, modify, or reject.

### 4. Handle the response

- **Confirm**: proceed to the `spec-graph-dispatch` skill, passing the `session_id`
- **Modify**: capture the user's modifications, re-run `spec-graph plan` with the updated intent or use `spec-graph intervene` to adjust the plan, then re-present
- **Reject**: abort. Do not proceed.

---

## What happens next

After plan confirmation, the user (or you) should switch to the `spec-graph-dispatch` skill to kick off the dispatch workflow. From that point on, spec-graph drives the process through all 8 stages: specify → design → tasks → implement → review → test → accept → integrate.

The dispatch workflow is: `dispatch --json` → hook → sub-agent → `submit`. This loop repeats until state = "completed".

You will be invoked at gate failures that the automator cannot auto-recover from, and at the final acceptance stage.

---

## Edge cases

- **No intent provided**: use AskUserQuestion to ask what the user wants to build
- **Plan command fails**: check that spec-graph is installed (`spec-graph --version`). If not installed, guide the user to install it
- **Multiple active sessions**: the planner will refuse to start a new session if one is already active. Ask the user whether to resume or abort the existing session
