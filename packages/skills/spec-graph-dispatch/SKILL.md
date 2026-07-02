---
name: spec-graph-dispatch
description: Run the spec-graph workflow via dispatch + hook. Each dispatch --json produces a manifest; the dispatch-watcher hook injects a system-reminder; the main agent dispatches sub-agents via Agent tool; advance records results. Loop 8 stages until state = completed. Use when the user wants to run the full spec-graph workflow after confirming a plan.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed and dispatch-watcher hook registered.
metadata:
  author: spec-graph
  version: "3.0"
---

Run the spec-graph workflow through 8 stages: specify → design → tasks → implement → review → test → accept → integrate.

spec-graph is a declaration engine — it generates dispatch manifests but never invokes agents. The dispatch-watcher hook bridges spec-graph and the main agent: each `dispatch --json` triggers a system-reminder that instructs the main agent to dispatch sub-agents via the Agent tool.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph dispatch --session <id> --json` | Produce DispatchManifest for current stage |
| `spec-graph advance --session <id> --result '<json>'` | Submit sub-agent results, evaluate gate, advance state |
| `spec-graph status --session <id>` | Check current state and stage |
| `spec-graph diagnose --session <id>` | Inspect gate failure diagnosis |
| `spec-graph intervene <action>` | Manual intervention (force-advance, rollback, resume) |

Backed by core modules: `dispatch`, `automator`, `gate-enforcement`, `machine-state`

---

## Prerequisites

- spec-graph CLI v3+ installed (`spec-graph --version`)
- `.spec-graph/` directory exists (`spec-graph init` has run)
- Current session state = "running" (plan confirmed)
- dispatch-watcher hook registered in `.claude/settings.json`

---

## The Loop

Repeat the following 4-step cycle for each of the 8 stages:

```
┌─────────────────────────────────────────────────────────┐
│  Step A: spec-graph dispatch --session <id> --json      │
│  → Outputs DispatchManifest JSON                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step B: dispatch-watcher hook auto-triggers            │
│  → Injects system-reminder with manifest summary        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step C: Dispatch sub-agent(s) via Agent tool           │
│  → Single action: 1 sub-agent                           │
│  → Multiple actions with same parallel_group: parallel  │
│  → Sub-agent produces artifact(s)                       │
│  → Sub-agent returns status-report JSON                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step D: spec-graph advance --session <id> --result     │
│  → Gate evaluation (pass/fail)                          │
│  → State progression (next stage)                       │
│  → machine-state update                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
                    Next stage
```

Repeat 8 times total, until `state = "completed"`.

---

## Steps

### 1. Check current state

```bash
spec-graph status --session <id> --json
```

Confirm state = "running" and stage is set. If state = "paused", run `spec-graph plan "<intent>" --confirm` first.

### 2. Dispatch the current stage

```bash
spec-graph dispatch --session <id> --json
```

The hook auto-injects a system-reminder with:
- Number of actions in this wave
- Agent ID and model tier for each action
- The next_step command to run after sub-agents return

### 3. Dispatch sub-agent(s)

Based on the system-reminder:

**Single action (specify, design, tasks, review, test, accept, integrate):**
Dispatch 1 sub-agent:
```
Agent({
  description: "<agent_id> agent for <stage>",
  prompt: <manifest action prompt content>,
  model: "opus" | "sonnet" | "haiku"  // based on model_tier
})
```

**Multiple actions (implement with N capabilities):**
Dispatch N sub-agents simultaneously in a single message (parallel Agent tool calls). Each sub-agent handles one capability.

### 4. Collect results and advance

After all sub-agents return:

```bash
spec-graph advance --session <id> --result '{
  "artifacts": [
    {"path": "<stage>/<file>", "content": "..."},
    ...
  ],
  "selfCheck": {
    "acceptanceCriteriaMet": true,
    "notes": "..."
  }
}'
```

### 5. Interpret the result

```json
// Gate passed, advance to next stage:
{"advanced": true, "nextStage": "design", "done": false}

// Gate failed, diagnosis provided:
{"advanced": false, "diagnosis": {...}, "done": false}

// All stages complete:
{"advanced": true, "nextStage": null, "done": true}
```

- `advanced = true` → Continue loop (go to step 2)
- `advanced = false` → Read diagnosis, fix, retry (see Error Handling)
- `done = true` → Workflow complete! Run `spec-graph status` to confirm.

---

## Parallel Dispatch (implement stage)

When the implement stage has N capabilities:

```
Manifest:
{
  "currentStage": "implement",
  "actions": [
    {"id": "impl-cap-1", "parallelGroup": 0, ...},
    {"id": "impl-cap-2", "parallelGroup": 0, ...},
    {"id": "impl-cap-3", "parallelGroup": 0, ...}
  ]
}
```

All actions with the same `parallelGroup` are dispatched **simultaneously** via parallel Agent tool calls in a single message. Wait for all to complete before advancing.

---

## Error Handling

### Gate failure

```bash
# Read the diagnosis
spec-graph diagnose --session <id> --json
```

The diagnosis contains:
- `failedCriteria`: which criteria failed
- `suggestedFix`: what to fix
- `retryLevel`: 1-4 progressive retry level

Fix the failing artifact(s) and re-run dispatch + advance. The automator weaves the diagnosis into the next prompt automatically.

### Sub-agent returns BLOCKED

```json
{"status": "BLOCKED", "blocker": "Missing context for X"}
```

Report to the user and wait for guidance. May need `spec-graph intervene`.

### Hook didn't trigger

1. Verify `.claude/settings.json` has the hook configured:
   ```bash
   cat .claude/settings.json
   ```
2. Verify the hook script exists:
   ```bash
   ls $(cat .claude/settings.json | grep dispatch-watcher | sed 's/.*"\(.*\)".*/\1/')
   ```
3. Re-register: `spec-graph init` (or `spec-graph install`)

### Max retries exhausted

After 4 failed retries per stage, the automator escalates to the user. Use `spec-graph intervene` to:
- `force-advance` — skip the gate
- `rollback` — go back to previous stage
- `modify-plan` — adjust capabilities
- `resume` — continue from current state

---

## Edge Cases

- **No active sessions**: Run `spec-graph plan "<intent>" --confirm` first
- **Multiple sessions**: Specify `--session <id>` on every command
- **Stage already completed**: advance is idempotent for completed stages
- **Empty manifest**: If current stage has no agent bindings, manifest.actions = []

---

## Success Criteria

Workflow is complete when:
- state = "completed"
- All 8 artifacts produced (proposal.md, design.md, tasks.md, code, review.md, test.md, verification.md, pr.md)
- readyForArchive = true
