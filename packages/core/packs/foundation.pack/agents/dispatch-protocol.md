# Coordinator Dispatch Protocol

> How spec-graph's coordinator automatically selects and dispatches specialized
> sub-agents at each pipeline stage.

## Overview

The **coordinator** is the main agent that orchestrates the pipeline. It reads
`graph.yaml`, follows the action sequence, and for each action dispatches the
appropriate **sub-agent** via the agent tool. Sub-agents work independently
with isolated context, communicate through artifacts, and are destroyed after
completing their work.

```
graph.yaml
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                   COORDINATOR                        │
│  (reads graph, dispatches agents, checks gates)     │
│                                                      │
│  for each action in pipeline:                        │
│    1. Look up agent_binding(action) → agent_id      │
│    2. Gather input artifacts (from agent.input_*)    │
│    3. Load agent prompt (from agent.prompt_ref)      │
│    4. Dispatch sub-agent via agent tool              │
│    5. Receive output → write artifacts to disk       │
│    6. Run gate checks                                │
│    7. If gate fails → retry or escalate              │
│    8. If gate passes → next action                   │
└──────────┬──────────────────────────────────────────┘
           │ dispatch(action, artifacts, prompt)
     ┌─────┼─────┬──────────┬──────────┐
     ▼     ▼     ▼          ▼          ▼
   [pm]  [arch] [dev]   [reviewer]  [qa]
   isolated context, specialized prompt,
   own model tier, artifact I/O only
```

## Agent Selection

The coordinator determines which agent to dispatch via **agent_bindings**
from the composed graph:

```yaml
# From graph.yaml (composed from all active packs)
agent_bindings:
  - { action: propose, agent_id: pm, provided_by: foundation }
  - { action: specify, agent_id: domain-expert, provided_by: ddd } # override!
  - { action: design, agent_id: domain-expert, provided_by: ddd }
  - { action: implement, agent_id: developer, provided_by: foundation }
  - { action: review, agent_id: reviewer, provided_by: foundation }
```

Priority rules:

1. Higher-priority packs override lower-priority bindings
2. If no binding exists for an action, coordinator uses itself (fallback)
3. Domain packs can override any foundation binding

## Dispatch Protocol

### Step 1: Gather Input Artifacts

The agent's `input_artifact_kinds` determines what context it receives.
The coordinator collects all completed artifacts matching those kinds:

```
agent: developer
input_artifact_kinds: [design/*, contract/*, plan/*]

→ coordinator collects:
  - design/c4.md (design/*)
  - contract/api-spec.yaml (contract/*)
  - plan/tasks.md (plan/*)
```

The sub-agent receives ONLY these artifacts. It does NOT see:

- User conversation history
- Other agents' outputs (unless declared as input)
- The full project codebase (unless the artifact kind includes it)

### Step 2: Construct Prompt

The coordinator builds the sub-agent prompt:

```
[System prompt: from agent.prompt_ref (e.g., agents/developer-agent.md)]

[Context: gathered input artifacts]

[Task: specific action to perform + any additional context from coordinator]

[Output: expected artifact format + status reporting protocol]
```

### Step 3: Dispatch via Agent Tool

The coordinator invokes the agent tool (e.g., Claude's Agent tool):

```
Agent({
  description: "Implement task-123",
  model: "standard",  // from agent.model_tier
  prompt: <constructed prompt>,
})
```

Key properties:

- **Isolated context**: the sub-agent starts with zero conversation history
- **Own model**: fast/standard/capable per agent declaration
- **Own scope**: only reads/writes files in its scope (enforced by scope-lock)

### Step 4: Receive Output

The sub-agent returns:

1. **Artifact content** — written to the appropriate paths
2. **Status** — DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
3. **Commit SHAs** — if the agent committed code

The coordinator:

- Writes artifacts to disk (if not already done by sub-agent)
- Records the dispatch in the change audit trail
- Evaluates the status

### Step 5: Gate Check

After the sub-agent completes, the coordinator:

1. Runs any checks associated with the transition gate
2. If gate passes → proceed to next action
3. If gate fails → enter retry/escalation protocol

### Step 6: Retry / Escalation

```
Gate fails
    │
    ▼
Is this a review gate (quality issue)?
    ├── Yes → dispatch developer to fix → re-dispatch reviewer
    │         (max_retries from pipeline_skeleton)
    │
    └── Is this a test gate (verification issue)?
        ├── Yes → dispatch developer to fix → re-dispatch qa
        │
        └── Retries exhausted?
            ├── Yes → escalate to human
            └── No → retry with stronger model tier
```

## Model Tier Selection

| Tier       | When                                     | Example agents                   |
| ---------- | ---------------------------------------- | -------------------------------- |
| `fast`     | Mechanical tasks, clear specs, 1-2 files | (future: simple code generators) |
| `standard` | Integration tasks, plan-following        | developer, qa                    |
| `capable`  | Judgment tasks, design, review           | pm, architect, reviewer          |

The coordinator can **upgrade** the model tier on retry:

- First attempt: use declared tier
- Second attempt: upgrade one level (fast → standard, standard → capable)
- Third attempt: use most capable available

## Multi-Agent Review (Parallel)

For complex reviews, multiple review agents can run **in parallel**:

```
Action: review
    │
    ├── reviewer (code quality)          ─┐
    ├── domain-reviewer (DDD boundaries)  ├─ parallel
    └── security-reviewer (future pack)  ─┘
    │
    ▼
Coordinator collects all review reports
    │
    ▼
Gate: all reviews must APPROVED (or warn-level only)
```

This is how gstack's CEO→design→eng pipeline maps to spec-graph:
instead of sequential review stages, parallel review agents with
different perspectives, coordinated by the gate.

## Traceability

Every dispatch is recorded for audit:

```json
{
  "action": "implement",
  "agent_id": "developer",
  "dispatched_at": "2026-06-27T10:00:00Z",
  "completed_at": "2026-06-27T10:15:00Z",
  "input_artifacts": ["plan/tasks.md", "contract/api.yaml", "design/c4.md"],
  "output_artifacts": ["src/api/handler", "src/api/handler.test"],
  "status": "completed",
  "model_tier": "standard",
  "retry_count": 0
}
```

This creates a full chain: who did what, when, with what context, producing
what output — fully traceable from requirement to commit.

## Comparison with Other Frameworks

| Framework       | How it handles agent coordination                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **superpowers** | coordinator dispatches subagents with prompt templates, 2-stage review loop. Roles are hardcoded (implementer/spec-reviewer/code-quality-reviewer).                                     |
| **BMAD**        | Personas (Bryn/Alex/Dev/Qwen) are sequential agents. Each reads the previous agent's output. Hardcoded chain.                                                                           |
| **gstack**      | CEO→design→eng review pipeline is sequential review agents. Review focus is hardcoded per stage.                                                                                        |
| **spec-graph**  | Agent registry is declarative (in pack.yaml). Bindings are overridable by priority. Any pack can add agents. Review can be parallel. Coordination is via gates, not prompt engineering. |

Key differences:

- **Declarative**: agents are data, not code. Add an agent by writing a YAML entry + prompt template.
- **Overridable**: domain packs override foundation agent bindings via priority.
- **Gate-enforced**: quality comes from deterministic checks, not "the agent was told to be careful".
- **Parallel-safe**: multiple review agents can run concurrently, coordinated by the gate.
