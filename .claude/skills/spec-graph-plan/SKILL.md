---
name: spec-graph-plan
description: Start the spec-graph planning flow. Transforms a user intent into a structured plan (capabilities, dependencies, complexity, risks), presents it to the user for confirmation, and initializes the automatic workflow. Use when the user wants to start a new development task with spec-graph's automatic progression.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed.
metadata:
  author: spec-graph
  version: "3.0"
---

Start a planning flow with spec-graph.

spec-graph is a **declaration engine** — it generates dispatch manifests and evaluates gates. It never invokes agents directly. You (the main agent) are the **coordinator**: you dispatch sub-agents per the manifest, collect results, and advance state.

This skill walks you through the **planning phase** — the ONLY phase where human confirmation is mandatory. After plan confirmation, spec-graph can run automatically.

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

Run the plan command:

```bash
spec-graph plan "<intent>" --json
```

Parse the JSON output. It contains:
- `session_id` — the new session identifier
- `plan.capabilities` — list of capabilities with descriptions
- `plan.order` — dependency order
- `plan.complexity` — low / medium / high
- `plan.risks` — identified risks
- `plan.open_questions` — questions the planner had but couldn't resolve

### 3. Present the plan to the user

Format the plan clearly. Highlight:
- What will be built (capabilities)
- In what order (dependencies)
- Complexity estimate
- Risks
- Open questions (if any)

Ask the user to confirm, modify, or reject.

### 4. Handle the response

- **Confirm**: proceed to the `spec-graph-auto` skill, passing the `session_id`
- **Modify**: capture the user's modifications, re-run `spec-graph plan` with the updated intent or use `spec-graph intervene` to adjust the plan, then re-present
- **Reject**: abort. Do not proceed.

---

## What happens next

After plan confirmation, the user (or you) should switch to the `spec-graph-auto` skill to kick off the automatic workflow. From that point on, spec-graph drives the process through all 9 stages: specify → specs → design → tasks → implement → review → test → accept → integrate.

You will be invoked at gate failures that the automator cannot auto-recover from, and at the final acceptance stage.

---

## Edge cases

- **No intent provided**: use AskUserQuestion to ask what the user wants to build
- **Plan command fails**: check that spec-graph is installed (`spec-graph --version`). If not installed, guide the user to install it
- **Multiple active sessions**: the planner will refuse to start a new session if one is already active. Ask the user whether to resume or abort the existing session

---
## Navigation

| Need | Skill |
|------|-------|
| Run the workflow | `/spec-graph-auto` |
| Check progress | `/spec-graph-status` |
| Debug gate failure | `/spec-graph-diagnose` |
| Skip a gate / rollback | `/spec-graph-intervene` |
