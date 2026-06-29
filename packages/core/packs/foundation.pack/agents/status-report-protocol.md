# Sub-Agent Status Report Protocol

> Every sub-agent MUST end its response with a structured status report.
> The coordinator (Claude Code main agent) parses this deterministically —
> no LLM keyword guessing — to decide the next loop iteration.

## Why structured

The coordinator loop (see `coordinator-protocol.md`) needs to know:

- Did the sub-agent succeed, partially succeed, need more context, or hit a blocker?
- Which artifacts did it produce? (So the coordinator can mark them completed.)
- What concerns/observations does it have? (For DONE_WITH_CONCERNS.)
- What context is missing? (For NEEDS_CONTEXT — coordinator re-dispatches with the missing piece.)
- What's the blocker? (For BLOCKED — coordinator escalates to user.)

Free-text answers force the coordinator to LLM-parse, which is unreliable. A
structured block at the end of the response lets the coordinator use a regex +
`JSON.parse` to extract the answer deterministically.

## Format

End every response with a fenced code block tagged `status-report`:

````markdown
... your normal response text (analysis, reasoning, summary) ...

```status-report
{
  "status": "DONE",
  "artifacts_produced": ["requirement/proposal", "requirement/requirements"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Produced proposal and requirements specs from the user's stated intent."
}
```
````

The block MUST be the LAST thing in the response. Anything after it will be ignored.

## Status values

| Status               | When to use                                                                                                                   | What coordinator does                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DONE`               | All required artifacts produced, acceptance criteria met                                                                      | Marks each `artifacts_produced` id as completed, runs `next_step`                                                     |
| `DONE_WITH_CONCERNS` | Work completed but you noticed something the coordinator should weigh (technical debt, a risk, an alternative path not taken) | Reads `concerns[]`. If any has `severity: blocking`, addresses before `next_step`. Otherwise notes them and proceeds. |
| `NEEDS_CONTEXT`      | You cannot complete the work without information you don't have                                                               | Reads `missing_context`. Provides the context, re-dispatches the SAME agent.                                          |
| `BLOCKED`            | You hit a hard blocker that the coordinator cannot resolve without user input                                                 | Escalates to user. Does NOT auto-retry.                                                                               |

## Field reference

```typescript
interface StatusReport {
  status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";

  /** IDs of artifacts produced this turn. Coordinator marks each completed in machine-state. */
  artifacts_produced: string[];

  /** For DONE_WITH_CONCERNS only. Empty array for other statuses. */
  concerns?: Array<{
    severity: "observation" | "blocking";
    description: string;
    suggested_action?: string;
  }>;

  /** For NEEDS_CONTEXT only. Null for other statuses. */
  missing_context?: string | null;

  /** For BLOCKED only. Null for other statuses. */
  blocker?: string | null;

  /** One- or two-sentence summary of what you did. Always present. */
  summary: string;
}
```

## Examples

### DONE

```status-report
{
  "status": "DONE",
  "artifacts_produced": ["requirement/proposal"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Translated the user's 'build a thermostat' intent into a proposal with JTBD, scope, and 3 measurable ACs."
}
```

### DONE_WITH_CONCERNS

```status-report
{
  "status": "DONE_WITH_CONCERNS",
  "artifacts_produced": ["design/architecture"],
  "concerns": [
    {
      "severity": "observation",
      "description": "Chose REST over gRPC for the sensor API; revisit if latency budget slips.",
      "suggested_action": "Add a latency check at L2 integration."
    }
  ],
  "missing_context": null,
  "blocker": null,
  "summary": "Produced C4 model + ADR for the firmware/app split. Noted one open question on protocol choice."
}
```

### NEEDS_CONTEXT

```status-report
{
  "status": "NEEDS_CONTEXT",
  "artifacts_produced": [],
  "concerns": [],
  "missing_context": "Target deployment target: is this firmware burned to ESP32, STM32, or both? Affects HAL selection.",
  "blocker": null,
  "summary": "Cannot select HAL layer without knowing the target MCU family."
}
```

### BLOCKED

```status-report
{
  "status": "BLOCKED",
  "artifacts_produced": [],
  "concerns": [],
  "missing_context": null,
  "blocker": "Compliance check requires ISO 62304 documentation, but no regulatory SME is available in the agent registry. Needs user decision: ship without, or pause for SME.",
  "summary": "Compliance gate cannot be satisfied with current agent roster."
}
```

## Coordinator parsing logic

The coordinator (or hook) extracts the status block with:

````javascript
const match = response.match(/```status-report\s*\n([\s\S]*?)\n```/);
if (!match) {
  // Malformed response — treat as BLOCKED with blocker='no status-report block found'
}
const report = JSON.parse(match[1]);
switch (report.status) {
  case "DONE":
    /* mark artifacts, run next_step */ break;
  case "DONE_WITH_CONCERNS":
    /* check concerns[] */ break;
  case "NEEDS_CONTEXT":
    /* re-dispatch with missing_context */ break;
  case "BLOCKED":
    /* escalate to user */ break;
}
````

## What this is NOT

- This is NOT a way for the sub-agent to skip work. If you produce no artifacts and report DONE, the coordinator will still run `next_step` — and the next dispatch will reveal the work wasn't done (gate will fail). Be honest.
- This is NOT a substitute for writing artifacts to disk. `artifacts_produced` is metadata; the actual artifact files must exist at the paths declared in `file_scope.write`.
- This is NOT a place to dump your full reasoning. Use `summary` for a 1-2 sentence overview; put detailed reasoning in the body of your response above the block.
