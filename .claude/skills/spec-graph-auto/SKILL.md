---
name: spec-graph-auto
description: Start the spec-graph automatic workflow. After plan confirmation (via spec-graph-plan), this skill runs the full workflow from intent to integrated PR with minimal human intervention. spec-graph drives the 8-stage FSM: specify → design → plan → implement → review → test → accept → integrate.
license: MIT
compatibility: Requires spec-graph CLI (v2+) installed. Requires a confirmed plan (session_id from spec-graph-plan).
metadata:
  author: spec-graph
  version: "2.0"
---

Run the spec-graph automatic workflow end-to-end.

spec-graph is the development brain — it generates prompts for you (the agent) to execute, evaluates your outputs through strict gates, and advances state automatically. You do the hands-on work; spec-graph does the thinking.

---

## The Stance

- **Follow the prompts.** spec-graph's prompts are carefully layered (MUST / SHOULD / MAY). Respect the priority levels.
- **One stage at a time.** Do not jump ahead. Each stage has entry criteria that must be met.
- **Submit structured results.** When spec-graph asks for a result, respond in the requested structured format. This is how spec-graph evaluates your work.
- **Self-check against acceptance criteria.** Each prompt includes acceptance criteria. Check your own output against them before submitting.

---

## Two operating modes

### Mode A: Single-command auto (simplest)

If the user wants fully automatic execution:

```bash
spec-graph auto "<intent>"
```

spec-graph will drive the loop. You will be invoked by spec-graph's CLI at each stage that requires agent work (via the configured agent adapter). You do not need to manage the loop yourself.

### Mode B: Stateless step-by-step (more control)

For finer control, or when operating via skills in a Claude Code session:

Loop through the following:

```bash
# 1. Get the next prompt
spec-graph next-prompt --json
# Returns: { prompt, stage, acceptance_criteria, context }

# 2. Execute the prompt (do the work)
# You (the agent) generate the artifact per the prompt

# 3. Submit the result
spec-graph advance --result '<json result>'
# Returns: { advanced: true/false, next_stage, diagnosis (if failed) }

# 4. If advanced: loop back to step 1
#    If not advanced: read the diagnosis, fix, re-submit
```

Continue until spec-graph reports `done: true` (integrate stage passed).

---

## Steps for Mode B

### 1. Get the first prompt

```bash
spec-graph next-prompt --json
```

Parse the output. The `prompt` field contains a layered XML-style prompt:
- `<task>` — what to do
- `<acceptance_criteria level="MUST">` — must satisfy
- `<project_constraint level="MUST">` — must respect
- `<methodology level="SHOULD">` — should follow
- `<context level="MAY">` — reference information

### 2. Execute the prompt

Do the work described in the prompt. The prompt tells you:
- Which stage you're in (specify / design / plan / implement / review / test / accept / integrate)
- What artifact to produce
- What methodology to follow (woven from the knowledge-base)
- What to include / avoid

Write the artifact to the specified location.

### 3. Submit the result

Package your result as JSON:

```json
{
  "artifacts": [
    { "path": "path/to/artifact.md", "content": "..." }
  ],
  "self_check": {
    "acceptance_criteria_met": true,
    "notes": "..."
  }
}
```

Run:

```bash
spec-graph advance --result '<json>'
```

### 4. Handle the response

- If `advanced: true` → loop back to step 1 (next stage)
- If `advanced: false` → read the `diagnosis`, fix the issue, re-submit
- If diagnosis indicates you've exhausted retries → spec-graph will escalate to the user

### 5. Termination

The loop ends when:
- All 8 stages pass → spec-graph reports `done: true`
- A gate fails after all retry levels → spec-graph pauses, escalates to user
- User explicitly interrupts

---

## Edge cases

- **No session exists**: you must run `spec-graph-plan` first to create a session and confirm the plan
- **Gate failure that requires user input**: spec-graph will emit a structured failure report. Relay it to the user clearly, do not attempt to fix on your own
- **Agent timeout**: spec-graph treats this as a gate failure and will retry. If you cannot complete in time, communicate this to spec-graph via a structured error response
