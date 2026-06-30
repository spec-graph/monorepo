# Coordinator Protocol

> The explicit contract between spec-graph and the external coordinator
> (Claude Code, Codex, any AI agent capable of dispatching sub-agents).

## Why this exists

spec-graph is a **declaration engine + dispatch manifest generator**. It does NOT
launch LLM sub-agents itself — by design. The kernel stays neutral: no API keys,
no embedded LLM calls, no opinion about which AI runtime executes the work.

The actual sub-agent execution lives in an **external coordinator** — typically
the Claude Code main session, but it could be Codex, Factory Droid, or any agent
runner that supports sub-agent dispatch.

This document is the **protocol** that ties them together. spec-graph outputs a
dispatch manifest; the coordinator consumes it, dispatches sub-agents, runs
follow-up commands, and loops back to spec-graph for the next step.

## The Loop

```
┌─────────────────────────────────────────────────────────────┐
│                  COORDINATOR LOOP                            │
│                                                              │
│   1. Run `spec-graph dispatch --json`                       │
│      → receives manifest with next action(s)                │
│      → PostToolUse hook injects a system-reminder           │
│        (minimal: agent_id, model_tier, requires_sub_agent,  │
│         next_step — full prompt is already in your          │
│         context from the Bash output, don't duplicate)      │
│                                                              │
│   2. Read actions[0]:                                        │
│      a. Check `requires_sub_agent`:                         │
│         - true → dispatch sub-agent via Agent tool           │
│         - false → run recommended_command directly via Bash │
│      b. (If sub-agent:) Read agent_id, agent_prompt_ref,     │
│         model_tier, meeting, prompt, file_scope,            │
│         input_artifacts                                      │
│                                                              │
│   3. If requires_sub_agent AND action.meeting is triggered:  │
│      a. For each round (1..N, dynamic):                     │
│         - For each core participant:                        │
│           * Construct sub-agent prompt:                     │
│             system prompt +                                 │
│             meeting purpose +                                │
│             ALL previous round contributions +              │
│             this round's phase + objective                  │
│           * Dispatch via Agent tool (isolated sub-agent)    │
│           * Collect contribution via `meeting record`       │
│         - Check convergence:                                │
│           * Open questions? → `meeting advance` + next      │
│           * Reached min_rounds + converged? → `meeting     │
│             complete` (synthesize)                           │
│           * Reached max_rounds? → force synthesize          │
│      b. Facilitator (coordinator itself) synthesizes        │
│         output artifacts from meeting transcript            │
│      c. Write artifacts to disk                             │
│                                                              │
│   4. If requires_sub_agent AND no meeting:                  │
│      a. Load system prompt from agent_prompt_ref            │
│      b. Construct sub-agent prompt from actions[0].prompt:  │
│         - Fill system prompt placeholder                    │
│         - Fill input artifact content placeholders          │
│         (only artifacts matching agent.input_artifact_kinds)│
│      c. Dispatch via Agent tool                             │
│      d. Sub-agent reports status-report block:              │
│         - DONE → mark artifacts, run next_step             │
│         - DONE_WITH_CONCERNS → read concerns, decide        │
│         - NEEDS_CONTEXT → provide context, re-dispatch      │
│         - BLOCKED → escalate to user                        │
│                                                              │
│   5. If NOT requires_sub_agent (deterministic):             │
│      a. Run actions[0].recommended_command via Bash          │
│         (e.g. the project's lint command, spec-graph machine           │
│          transition --from A --to B`)                       │
│      b. No sub-agent, no status-report — just check exit    │
│         code                                                │
│                                                              │
│   6. Run actions[0].next_step (advance the workflow):       │
│      - 'spec-graph artifact complete X --producer <agent>'  │
│      - 'spec-graph check --id Y'                            │
│      - 'spec-graph machine transition --from A --to B'     │
│                                                              │
│   7. Loop back to step 1                                     │
│      (until manifest.done === true OR manifest.blocked)     │
│                                                              │
│   8. If manifest.blocked:                                   │
│      - Read blocking_gate, missing_artifacts, failed_checks │
│      - Decide: dispatch more agents OR escalate to user     │
│      - For unclear issues: self-initiate ad-hoc meeting     │
│        (spec-graph meeting init ...)                        │
│                                                              │
│   9. If manifest.done:                                      │
│      - Workflow complete. Report to user.                   │
└─────────────────────────────────────────────────────────────┘
```

### Action types: sub-agent vs deterministic

| Action type         | `requires_sub_agent` | What coordinator does                                                   |
| ------------------- | -------------------- | ----------------------------------------------------------------------- |
| `produce_artifact`  | true                 | Dispatch sub-agent (LLM produces artifact)                              |
| `perform_stage`     | true                 | Dispatch sub-agent (LLM does stage work)                                |
| `resolve_violation` | true                 | Dispatch sub-agent (LLM resolves governance violation)                  |
| `run_check`         | false                | Run `check_command` directly via Bash (e.g. lint/test commands) — see below |
| `verify_trace`      | false                | Run `recommended_command` directly via Bash (deterministic trace query) |
| `transition`        | false                | Run `recommended_command` directly via Bash (state machine update)      |

Spawning a sub-agent to run tests is pure context waste — the sub-agent
would load a system prompt + task prompt just to execute a shell command.
The `requires_sub_agent` field tells the coordinator when to skip the
sub-agent and just run the command.

For `run_check` actions specifically, the manifest exposes the actual shell
command from `CheckDecl.command` as `actions[0].check_command`. The
coordinator runs this directly — no need to consult `graph.yaml` to find the
command body. (For other deterministic action types, use `recommended_command`.)

## Reading the Dispatch Manifest

The coordinator runs `spec-graph dispatch --json` and parses:

```json
{
  "version": "1",
  "current_stage": "propose",
  "next_stage": "specify",
  "blocking_gate": null,
  "gate_passed": true,
  "missing_artifacts": [],
  "failed_checks": [],
  "missing_traces": [],
  "forbidden_violations": [],
  "done": false,
  "actions": [
    {
      "index": 1,
      "type": "perform_stage",
      "id": "specify",
      "description": "Perform 'specify' stage work...",
      "requires_sub_agent": true,
      "agent_id": "pm",
      "agent_prompt_ref": "agents/pm-agent.md",
      "model_tier": "capable",
      "check_command": null,
      "meeting": {
        "meeting_id": "requirements-meeting",
        "purpose": "Transform user intent...",
        "participants": [
          { "agent_id": "pm", "role": "core", "perspective": "user needs" },
          { "agent_id": "architect", "role": "core", "perspective": "feasibility" }
        ],
        "min_rounds": 2,
        "max_rounds": 10,
        "output_artifacts": ["requirement/proposal", "requirement/requirements"],
        "rounds": [
          { "number": 1, "phase": "diverge", "objective": "...", "prompt": "..." }
        ]
      },
      "next_step": "spec-graph dispatch — complete this work then re-run dispatch",
      "prompt": "You are the pm agent...",
      "file_scope": { "read": [...], "write": [...] }
    }
  ]
}
```

### Field-by-field consumption

**Top-level (gate state):**

| Field                    | How coordinator uses it                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`                   | If true → workflow complete, stop                                                                                                                                                                                     |
| `gate_passed`            | If false → blocked, read failure arrays below to know WHAT failed                                                                                                                                                     |
| `missing_artifacts[]`    | Artifact ids not yet completed (each maps to a `produce_artifact` action)                                                                                                                                             |
| `failed_checks[]`        | Check ids that didn't pass (each maps to a `run_check` action)                                                                                                                                                        |
| `missing_traces[]`       | Required trace names not yet satisfied (each maps to a `verify_trace` action)                                                                                                                                         |
| `missing_contracts[]`    | Contract drift: consumers on stale/broken contract versions (each maps to a `resolve_violation` action). Fix via `spec-graph contract reverify <id>` or `spec-graph contract bind <id> --consumer <c> --version <v>`. |
| `forbidden_violations[]` | Forbidden invariants violated (each maps to a `resolve_violation` action)                                                                                                                                             |
| `blocking_gate`          | The gate id(s) currently blocking (informational — failure arrays tell you what)                                                                                                                                      |

**Per-action (`actions[0]`):**

| Field                 | How coordinator uses it                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires_sub_agent`  | **First check**. If false → deterministic, run `check_command` directly via Bash (no sub-agent). If true → dispatch sub-agent per below.                                                                                                                |
| `agent_id`            | Which sub-agent to dispatch (from Agent Registry)                                                                                                                                                                                                       |
| `agent_prompt_ref`    | Path to load system prompt template (relative to pack dir)                                                                                                                                                                                              |
| `model_tier`          | Which model class to use: `fast` / `standard` / `capable`                                                                                                                                                                                               |
| `check_command`       | For `run_check` actions: the actual shell command from CheckDecl (e.g. test/lint commands). Run this directly when `requires_sub_agent === false` — do NOT consult graph.yaml.                                                                                  |
| `trace_query`         | For `verify_trace` actions: the trace query that's missing (`from_kind`, `to_kind`, `via`, `cardinality`). Coordinator uses this to either create the trace manually (`spec-graph trace add`) or identify which artifact completion would auto-wire it. |
| `meeting`             | If present, run meeting protocol instead of single-agent dispatch                                                                                                                                                                                       |
| `prompt`              | The task-specific prompt (paste into sub-agent dispatch)                                                                                                                                                                                                |
| `file_scope`          | Constrain sub-agent's read/write paths                                                                                                                                                                                                                  |
| `next_step`           | Command to run AFTER sub-agent completes (advance workflow)                                                                                                                                                                                             |
| `recommended_command` | The specific `spec-graph` command that completes this action                                                                                                                                                                                            |

## Dispatching a Sub-Agent (No Meeting)

When `action.meeting` is absent, the coordinator dispatches a single sub-agent:

### Step 1: Load system prompt

Read the file at `action.agent_prompt_ref` (relative to the pack that declared
the agent — coordinator knows pack dir from `graph.meta.packs_used`).

```
Example: agents/pm-agent.md
→ "You are a Product Manager sub-agent in a spec-graph pipeline..."
```

### Step 2: Gather input artifacts

Look up the agent declaration in `graph.agents` (by `agent_id`).
The agent's `input_artifact_kinds` lists which artifact kinds it needs.

Coordinator collects all **completed** artifacts matching those kinds from
`.spec-graph/machine-state.yaml` (artifacts with status=completed).

### Step 3: Construct sub-agent prompt

The dispatch manifest's `action.prompt` field is already a **standardized envelope**
(see `agents/prompt-envelope.md`). The coordinator fills placeholders:

1. Copy `action.prompt` verbatim.
2. Replace the `--- BEGIN SYSTEM PROMPT ---` / `--- END SYSTEM PROMPT ---`
   block by pasting the content of `action.agent_prompt_ref`.
3. For each entry in `action.input_artifacts`, read the file at `path` and
   replace the corresponding `[paste content of {path} here]` placeholder.
4. Pass the assembled string to the Agent tool as `prompt`.

```
Agent({
  description: "{action.id} stage",
  model: "{action.model_tier}",
  prompt: <assembled envelope>,
})
```

The envelope guarantees the sub-agent sees: identity, system prompt, task
context, input artifacts, meeting orchestration (if any), constraints, and
the completion protocol (including the status-report requirement).

### Step 4: Dispatch via Agent tool

Use the coordinator's native sub-agent dispatch mechanism. In Claude Code:

```
Agent({
  description: "Implement specify stage",
  model: "capable",  // from action.model_tier
  prompt: <constructed prompt>,
})
```

### Step 5: Handle sub-agent status

Sub-agent MUST end its response with a `status-report` block (see
`agents/status-report-protocol.md` for the full format). Coordinator extracts
it with a regex + JSON.parse — no LLM keyword guessing.

````javascript
const match = response.match(/```status-report\s*\n([\s\S]*?)\n```/);
if (!match) {
  // Malformed — treat as BLOCKED, escalate
}
const report = JSON.parse(match[1]);
````

| Status               | Coordinator action                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DONE`               | For each `id` in `report.artifacts_produced`, mark completed in machine-state. Then run `action.next_step`.                                                                                                                                                                                                                                                                   |
| `DONE_WITH_CONCERNS` | Read `report.concerns[]`. Any `severity: blocking`? Address before `next_step`. Otherwise note them and proceed.                                                                                                                                                                                                                                                              |
| `NEEDS_CONTEXT`      | Read `report.missing_context`. Provide that context, re-dispatch the SAME agent with the additional context appended to the prompt. Do NOT advance workflow. **Retry cap: 3 attempts.** If the same action returns NEEDS_CONTEXT 3 times in a row, treat as BLOCKED (the sub-agent is unable to make progress without user input — escalating is cheaper than another retry). |
| `BLOCKED`            | Escalate to user. Show `report.blocker`. Do NOT auto-retry — the sub-agent has already judged that more attempts won't help without user input.                                                                                                                                                                                                                               |

### Step 6: Advance workflow

Run `action.next_step` — typically:

- `spec-graph artifact complete <id> --producer <agent_id>`
- `spec-graph check --id <check_id>`
- `spec-graph machine transition --from <stage> --to <stage>`

This updates machine-state, then coordinator loops back to `spec-graph dispatch`.

## Dispatching a Meeting

When `action.meeting` is present, the coordinator runs the meeting protocol.

### Meeting State Machine

```
START
  │
  ▼
Round 1 (diverge)
  │
  ├─ For each core participant:
  │    - Construct prompt:
  │      [agent system prompt]
  │      [meeting purpose + participants]
  │      [round 1 phase + objective + prompt]
  │    - Dispatch via Agent tool (isolated)
  │    - Collect contribution
  │
  ▼
Convergence check:
  - Open questions? → NEXT ROUND (challenge or deep_dive)
  - Unresolved challenges? → NEXT ROUND
  - Reached min_rounds AND no open issues? → SYNTHESIZE
  - Reached max_rounds? → FORCE SYNTHESIZE
  - Otherwise → NEXT ROUND
  │
  ▼
Round N+1 (chosen phase)
  │
  ├─ For each core participant:
  │    - Construct prompt:
  │      [agent system prompt]
  │      [meeting purpose + participants]
  │      [ALL contributions from rounds 1..N]   ← broadcast
  │      [round N+1 phase + objective + prompt]
  │    - Dispatch via Agent tool
  │    - Collect contribution
  │
  ▼
Convergence check → (loop or synthesize)
  │
  ▼
SYNTHESIZE (facilitator = coordinator itself)
  │
  ├─ Read all contributions
  ├─ Identify agreements
  ├─ Identify open questions
  ├─ Write output_artifacts to disk
  │    (one file per artifact in output_artifacts list)
  │
  ▼
END → run action.next_step to advance workflow
```

### Dynamic Round Management

The number of rounds is **not predetermined**. Coordinator decides:

1. **After each round**, check convergence signals:
   - Did any participant ask a question that wasn't answered?
   - Did any participant challenge another's statement without response?
   - Did a participant flag a knowledge gap requiring an expert?

2. **If not converged**:
   - Choose next phase based on what happened:
     - Many unanswered questions → `challenge` round
     - One topic dominating → `deep_dive` round on that topic
     - Refining after deep_dive → `diverge` round (deeper)
     - Approaching agreement → `converge` round
   - Increment round counter
   - If round > max_rounds → force converge

3. **If converged** (or max reached):
   - Coordinator (as facilitator) synthesizes all contributions
   - Writes output artifacts
   - Runs `action.next_step`

### Inviting Domain Experts

During any round, if a participant identifies a knowledge gap:

1. Participant says: "I don't know the regulatory requirements for..."
2. Coordinator checks if a domain expert is available:
   - Look in `graph.agents` for an agent with matching expertise
   - Or check if a human expert should be consulted (pause + ask user)
3. If expert available:
   - Add expert as `invite_only` participant for next round
   - Construct expert prompt: full discussion history + specific question
   - Dispatch expert sub-agent
4. Other participants can ask expert questions in subsequent rounds
5. Once expertise integrated, expert can be dismissed

### Broadcast Model

**Critical**: every participant sees ALL prior contributions. This is what
makes it a meeting, not sequential handoff.

When constructing a participant's prompt for round N, include:

- All contributions from rounds 1 to N-1
- Each contribution labeled: `[Round K, participant X, type Y]: content`
- The current round's objective and prompt

This is the difference from BMAD's sequential persona handoff.

## Ad-Hoc Meetings (Coordinator-Initiated)

The coordinator (Claude Code main agent) can spontaneously convene a meeting
for ANY issue that needs multi-perspective discussion — not only when a pack
declares one. This is the "when in doubt, convene" escape hatch.

### When to self-initiate

- A sub-agent returns `NEEDS_CONTEXT` and the missing context is a judgment
  call (not a fact lookup) — e.g. "should we use REST or gRPC?" needs the
  architect AND the pm, not just one.
- A gate is blocked and the resolution requires trade-off discussion.
- The coordinator itself is uncertain how to proceed.
- Multiple suggested actions have interdependencies that need alignment.

### How to self-initiate

```
spec-graph meeting init <meeting-id> \
  --purpose "<the question to resolve>" \
  --participants "<agent1>:<perspective1>,<agent2>:<perspective2>" \
  [--min-rounds <n>] [--max-rounds <n>]
```

- `meeting-id`: coordinator-generated, e.g. `ad-hoc-auth-strategy-20260627`.
- `--participants`: comma-separated. Each entry is `agent_id:perspective` or
  `agent_id` (perspective defaults to "contributing to discussion"). For
  domain experts not in the Agent Registry, use `expert_role:perspective`.
- Default rounds: 1 min, 5 max (sensible for most discussions).

### After init

The ad-hoc meeting uses the SAME record/advance/complete protocol as
declared meetings:

1. `spec-graph meeting record <id> --participant <agent> --type <statement|question|...> --content <text>`
2. `spec-graph meeting advance <id>` (broadcast prior contributions to next round)
3. `spec-graph meeting complete <id> --summary "<conclusion>"`

The ad-hoc meeting declaration is stored in the runtime file's `ad_hoc_decl`
field. `spec-graph meeting show/advance/complete` automatically resolve it
via `resolveMeetingDecl` (checks graph first, then falls back to runtime).

### When NOT to self-initiate

- The question is a fact lookup (e.g. "what's the type of X?") — read the code,
  don't convene a meeting.
- The sub-agent returned `BLOCKED` — that's an escalation to the USER, not a
  meeting (a meeting of agents can't resolve a missing human decision).
- You've already had 2+ ad-hoc meetings on the same issue — escalate to user
  instead of looping.

The coordinator stops the loop when:

1. **`manifest.done === true`** — workflow complete
2. **`manifest.gate_passed === false`** — blocked on a gate:
   - Missing artifacts → dispatch agents to produce them
   - Failed checks → dispatch agents to fix and re-run
   - Missing traces → dispatch agents to verify
3. **Sub-agent returns `BLOCKED`** — escalate to user
4. **User interrupts** — coordinator yields control

## File Scope Enforcement

Each sub-agent has a `file_scope` (read globs + write globs). Coordinator
should enforce these when dispatching:

- Pass as constraints to the sub-agent's prompt
- In Claude Code: configure the sub-agent's allowed tools + paths
- Sub-agent should refuse to read/write outside its scope

This is the **security boundary** — without it, a sub-agent could modify
files belonging to another track or stage.

## Termination Conditions

The coordinator stops the loop when:

1. **`manifest.done === true`** — workflow complete
2. **`manifest.gate_passed === false`** — blocked on a gate:
   - Missing artifacts → dispatch agents to produce them
   - Failed checks → dispatch agents to fix and re-run
   - Missing traces → dispatch agents to verify
3. **Sub-agent returns `BLOCKED`** — escalate to user
4. **User interrupts** — coordinator yields control

## What spec-graph Does NOT Do

To stay neutral, spec-graph intentionally does NOT:

1. **Call any LLM API** — no `@anthropic-ai/sdk`, no OpenAI client
2. **Dispatch sub-agents** — that's the coordinator's job
3. **Manage LLM context windows** — coordinator decides what to include
4. **Handle sub-agent failures** — coordinator decides retry/escalate
5. **Know which AI runtime is running it** — Claude Code, Codex, etc. are equivalent

spec-graph only:

1. Declares the workflow (pack.yaml → graph.yaml)
2. Computes what's next (dispatch manifest, including gate failure details)
3. Validates work (checks, gates, traces)
4. Tracks state (machine-state.yaml, change descriptors)
5. Appends dispatch entries to the active change's audit_log (best-effort —
   spec-graph records WHAT was dispatched at WHAT time, not the running/
   completed/failed status of sub-agents, which is the coordinator's job)

The **coordinator** does everything else.

## Example Coordinator Pseudocode

```python
# Pseudocode for an external coordinator (e.g., Claude Code main agent)

needs_context_retries = {}  # action_id → count, capped at 3

while True:
    manifest = run("spec-graph dispatch --json")

    if manifest.done:
        report_complete()
        break

    if not manifest.gate_passed:
        # Blocked — failure arrays tell us WHAT failed
        # (missing_artifacts, failed_checks, missing_traces, forbidden_violations)
        # The manifest's actions[] already include the right actions to resolve each
        pass  # fall through to action dispatch below

    for action in manifest.actions:
        if not action.requires_sub_agent:
            # Deterministic — run shell command directly via Bash, no sub-agent
            cmd = action.check_command or action.recommended_command
            run_shell(cmd)  # e.g. lint/test commands
            continue

        if action.meeting:
            run_meeting(action.meeting)
        else:
            report = run_single_agent(action)

            if report.status == 'NEEDS_CONTEXT':
                needs_context_retries[action.id] = needs_context_retries.get(action.id, 0) + 1
                if needs_context_retries[action.id] >= 3:
                    escalate_to_user(f"{action.id} stuck in NEEDS_CONTEXT loop")
                    break
                # Re-dispatch with additional context (do NOT advance workflow)
                re_dispatch_with_context(action, report.missing_context)
                continue
            elif report.status == 'BLOCKED':
                escalate_to_user(report.blocker)
                break
            # DONE / DONE_WITH_CONCERNS — fall through to advance

        # Advance workflow
        run(action.next_step)
```

## Integration with Claude Code

Claude Code's main agent IS the coordinator. The integration:

1. **Session start**: Claude Code reads `.spec-graph/graph.yaml` to understand
   the workflow
2. **Each turn**: Claude Code runs `spec-graph dispatch --json` to get the
   manifest, then uses the `Agent` tool to dispatch sub-agents per the protocol
3. **Sub-agent completion**: Claude Code runs the `next_step` command, then
   re-runs `spec-graph dispatch` to see what's next
4. **Meeting**: Claude Code uses `Agent` tool to dispatch each participant
   per round, accumulating the transcript in its own context, then synthesizes
5. **Gate blocked**: Claude Code reads the blocking reason and dispatches
   agents to resolve, or asks the user for guidance

No special integration code is needed — Claude Code's existing `Agent` tool
and `Bash` tool are sufficient. The protocol is the contract.
