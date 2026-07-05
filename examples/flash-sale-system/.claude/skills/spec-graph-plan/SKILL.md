# spec-graph-plan

## Decision table

Check state with `spec-graph status --json`. Then run exactly one command:

```
STATE              STAGE              → COMMAND
──────────────────────────────────────────────────────────────
null               -                  → spec-graph start "<intent>"
paused             any                → ask user to confirm plan
running            specify..integrate → spec-graph dispatch --json
running            (has diagnosis)    → fix artifact → spec-graph submit --stage
completed          integrate          → Done. All 8 stages passed.
```

## After dispatch

The hook injects a system-reminder. Read it. It tells you:
- Which Agent to dispatch (id + model_tier)
- What to do: `Agent(description="...", prompt=actions[0].prompt)`
- How to submit: `spec-graph submit --stage`

## After sub-agent returns

Parse the `status-report` block from sub-agent output:
```
DONE               → spec-graph submit --stage
DONE_WITH_CONCERNS → spec-graph submit --stage
NEEDS_CONTEXT      → report missing context to user
BLOCKED            → report blocker to user
```

## After submit

The hook injects a reminder: "advanced to X. Re-run dispatch."

Run: `spec-graph dispatch --json`

## The cycle

```
status → dispatch → hook → Agent tool → status-report → submit → hook → dispatch → ...
```

Stop when `status → state = "completed"`.
