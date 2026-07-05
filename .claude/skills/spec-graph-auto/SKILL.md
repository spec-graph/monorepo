---
name: spec-graph-auto
description: Start the spec-graph automatic workflow. After plan confirmation (via spec-graph-plan), this skill runs the full workflow from intent to integrated PR with minimal human intervention. spec-graph drives the 9-stage FSM: specify → specs → design → tasks → implement → review → test → accept → integrate.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed and dispatch-watcher hook registered (spec-graph init).
metadata:
  author: spec-graph
  version: "3.0"
---

Run the spec-graph automatic workflow end-to-end.

spec-graph is a **declaration engine** — it generates dispatch manifests and evaluates gates. It never invokes agents directly. You (the main agent) are the **coordinator**: dispatch sub-agents per the manifest, collect results, and advance state. The dispatch-watcher hook keeps the loop spinning.

---

## Prerequisites

Check before starting:

```bash
# 1. spec-graph CLI available
spec-graph --version

# 2. Hook is registered (spec-graph init has run)
cat .claude/settings.json | grep -q 'spec-graph hook dispatch' && echo "Hook OK" || echo "Run: spec-graph init"

# 3. Active session exists (from spec-graph-plan)
spec-graph status --json
```

If any check fails, run `spec-graph init` or `spec-graph plan <intent> --fallback --confirm` first.

---

## The Loop (hook-driven)

The dispatch-watcher hook is the engine. Each `dispatch --json` triggers a `PostToolUse` hook that runs `spec-graph hook dispatch`, which injects a system-reminder. The reminder tells you exactly what to do — you don't need to remember the loop yourself.

```
┌──────────────────────────────────────────────────────┐
│  A. spec-graph dispatch --session <id> --json        │
│     → DispatchManifest with actions + prompt         │
│     → Hook fires → system-reminder injected          │
│     → Reminder says: agent, model, execution steps   │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  B. Dispatch sub-agent(s) per the reminder            │
│     Single action: 1 Agent tool call                  │
│     Parallel wave: N Agent tool calls simultaneously  │
│     Meeting available? Consider if recommended        │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  C. spec-graph advance --session <id> --result '...' │
│     → Gate evaluates → pass/fail + diagnosis          │
└──────────────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         gate passed            gate failed
         next stage             read diagnosis → fix → retry
         loop to A              loop to A
              │                     │
              └──────────┬──────────┘
                         ▼
                  done === true
                  workflow complete
```

**You stop when:**
- `manifest.done === true` — all 9 stages complete
- `sub-agent returns BLOCKED` — escalate to user
- `gate blocked after 4 retries` — escalate to user

---

## The 9-Stage FSM

| # | Stage | Agent | Output | Gate checks |
|---|-------|-------|--------|-------------|
| 1 | specify | pm | proposal.md | capabilities enumerated, scope defined, user stories present |
| 2 | specs | pm | specs.md | requirements per capability, acceptance criteria, edge cases |
| 3 | design | architect | design.md | architecture decisions, trade-offs, component hierarchy |
| 4 | tasks | developer | tasks.md | tasks cover design, ordered by dependency, estimable |
| 5 | implement | developer | source code | lint, typecheck, tests pass per capability |
| 6 | review | reviewer | review.md | code correctness, style, security, performance |
| 7 | test | qa | test.md | test coverage, edge cases exercised, regression check |
| 8 | accept | qa | verification.md | acceptance criteria met, manual verification steps |
| 9 | integrate | developer | pr.md | all gates passed, PR description, migration notes |

---

## Parallel Dispatch (implement stage)

When the implement stage has multiple capabilities, the manifest produces parallel actions:

```json
{
  "actions": [
    { "id": "user-model", "parallel_group": 0 },
    { "id": "auth-endpoints", "parallel_group": 0 },
    { "id": "auth-middleware", "parallel_group": 0 }
  ]
}
```

Dispatch ALL actions with the same `parallel_group` simultaneously in a single message via parallel Agent tool calls. Wait for ALL to complete before advancing.

---

## Meeting Decision

When `manifest.meeting.recommended === true` AND the task involves trade-offs (security vs perf vs UX) or multi-perspective alignment, initiate: `spec-graph meeting init <id> --session <id>`. Skip meetings for simple, well-defined tasks with no ambiguity.

---

## Error Handling

### Gate failure

```bash
spec-graph diagnose --session <id> --json
```

Diagnosis contains: `failedCriteria`, `suggestedFix`, `retryLevel` (1-4).

- **Level 1**: Fix the specific issue, re-run advance
- **Level 2**: Use a different skill/methodology from knowledge-base
- **Level 3**: Decompose the task into smaller sub-steps
- **Level 4**: Escalate to user

After fixing, loop back to dispatch.

### Sub-agent returns NEEDS_CONTEXT

Provide the missing context, re-dispatch the SAME agent. Cap at 3 retries — if stuck, escalate.

### Sub-agent returns BLOCKED

Escalate to user immediately. Do NOT auto-retry.

### Max retries exhausted

Use `spec-graph intervene`:
- `force-advance` — skip gate, continue to next stage
- `rollback --to-stage <stage>` — go back and redo
- `modify-plan` — adjust capabilities in plan
- `resume` — continue from paused state

---

## Success Criteria

Workflow is complete when:
- `state === "completed"`
- All 9 artifacts produced
- `readyForArchive === true`

---
## Navigation

| Need | Skill |
|------|-------|
| Start new task | `/spec-graph-plan` |
| Check progress | `/spec-graph-status` |
| Debug gate failure | `/spec-graph-diagnose` |
| Pre-submit validation | `/spec-graph-diagnose` (see Pre-submit Check) |
| Skip gate / rollback | `/spec-graph-intervene` |
