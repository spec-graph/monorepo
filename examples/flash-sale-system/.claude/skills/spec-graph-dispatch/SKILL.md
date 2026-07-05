# spec-graph-dispatch

## State machine

```
spec-graph dispatch --json
    ↓
hook injects reminder
    ↓
Agent tool: dispatch sub-agent with prompt from manifest
    ↓
sub-agent returns status-report
    ↓
┌─────────────────────────────────────────┐
│ status-report value → action             │
│ DONE               → submit --stage      │
│ DONE_WITH_CONCERNS → submit --stage      │
│ NEEDS_CONTEXT      → ask user           │
│ BLOCKED            → escalate to user   │
└─────────────────────────────────────────┘
    ↓
submit --stage
    ↓
hook injects reminder: "advanced to X. re-run dispatch"
    ↓
spec-graph dispatch --json  (loop)
```

## Submit (when sub-agent completed)

```bash
spec-graph submit --session <id> --stage
```

If multiple artifacts (implement stage):
```bash
spec-graph submit --session <id> --result '{"artifacts":["a.md","b.md"]}'
```

## Parallel dispatch (implement stage, Wave 0)

When hook says "Wave 0 (PARALLEL — dispatch ALL sub-agents)":
Dispatch all sub-agents simultaneously via Agent tool. Wait for all. Then submit.

## Gate failed

Read `spec-graph status --json` → parse diagnosis → fix artifact → resubmit.
