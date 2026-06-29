# Meeting Protocol — Multi-Agent Collaborative Discussion

> How spec-graph supports structured multi-agent meetings where participants
> discuss, challenge, and refine requirements together — instead of working
> in isolation and passing artifacts sequentially.

## Philosophy

Traditional pipeline: PM works alone → produces proposal → hands to Architect →
Architect works alone → produces design → hands to Developer. Problems found late.

Meeting mode: PM + Architect + QA + Domain Expert sit at the same table.
They discuss together. Architect challenges PM's feasibility assumptions.
QA asks about testability before code is written. Domain expert brings
knowledge nobody on the team had. Problems found early.

This is inspired by BMAD's persona-based approach but fundamentally different:

- **BMAD**: Bryn → Alex → Dev → Qwen (sequential relay race)
- **spec-graph meeting**: All personas in the same room, broadcast-style (roundtable)

## Meeting Structure

### Participants

Each meeting declares participants with roles:

| Role          | Behavior                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `core`        | Speaks every round, must contribute. The meeting can't proceed without them. |
| `optional`    | Speaks when relevant. May be skipped in some rounds.                         |
| `invite_only` | Only speaks when explicitly invited (for domain experts).                    |
| `facilitator` | Manages rounds, synthesizes, doesn't contribute domain opinions.             |

The **facilitator** is always the coordinator (main agent). It doesn't have
domain opinions — its job is to manage the process.

### Rounds

Meetings proceed in rounds. The number of rounds is **not fixed** — it's
determined dynamically by the facilitator based on convergence signals.

Each round has a **phase**:

| Phase       | Purpose                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `diverge`   | Each participant shares their perspective. Broad exploration.             |
| `challenge` | Participants question and challenge each other's statements.              |
| `converge`  | Participants refine positions based on discussion. Move toward agreement. |
| `deep_dive` | Focus on a specific topic that emerged as contentious or important.       |

Phases can **repeat** in any order. A meeting might go:

```
diverge → challenge → deep_dive → diverge (deeper) → challenge → converge
```

Or simply:

```
diverge → converge
```

The facilitator decides the phase dynamically based on what happened in the
previous round.

### Dynamic Round Management

The facilitator (coordinator) manages rounds dynamically:

```
Round N completed
    │
    ▼
Convergence check:
  - Are there open questions?
  - Are there unresolved challenges?
  - Have all core participants spoken?
  - Has min_rounds been reached?
    │
    ├─ Not converged + rounds < max_rounds
    │   → Schedule next round (choose phase based on state)
    │
    ├─ Not converged + rounds >= max_rounds
    │   → Force convergence: synthesize with explicit "unresolved" markers
    │
    └─ Converged (or min_rounds reached + no blockers)
        → Synthesize output artifacts
```

The `min_rounds` and `max_rounds` bounds prevent:

- Too few rounds (nobody had time to think)
- Infinite loops (agents endlessly debating)

### Round Template

The meeting declaration provides a **round template** — the _expected_
structure. The facilitator can add extra rounds beyond the template:

```yaml
rounds:
  - {
      number: 1,
      phase: diverge,
      objective: "Each perspective on the requirements",
    }
  - {
      number: 2,
      phase: challenge,
      objective: "Question assumptions, find conflicts",
    }
  - { number: 3, phase: converge, objective: "Align on shared understanding" }
  # Facilitator may add rounds 4, 5, ... as needed
```

The template is a starting point. The facilitator decides in real-time
whether to follow it or diverge.

## Contribution Format

Each participant's contribution in a round is structured:

```typescript
{
  participant: "architect",
  type: "challenge",           // statement | question | challenge | refinement | synthesis
  content: "PM's proposal assumes single-tenant, but requirements mention multi-tenant...",
  targets: ["pm"],             // who this is directed at
  round: 2
}
```

Types:

- **statement**: Sharing a perspective or observation
- **question**: Asking another participant for clarification
- **challenge**: Disagreeing with or questioning another participant's position
- **refinement**: Building on / improving another participant's statement
- **synthesis**: Facilitator summarizing points of agreement

## Domain Expert Invitation

Domain experts are participants with `role: 'invite_only'`. They don't
speak unless invited. The invitation protocol:

1. **Detection**: During a round, a participant identifies a knowledge gap
   ("I don't know the regulatory requirements for financial data")
2. **Invitation**: The facilitator checks if a domain expert is available
   for that topic. If yes, the expert joins the next round.
3. **Contribution**: The expert provides their knowledge as a `statement`
4. **Integration**: Participants ask the expert questions in the next round

Experts can be:

- **Agent-based**: A specialized agent with domain knowledge (e.g., `domain-expert` from ddd.pack)
- **Human**: A real person who provides input (the facilitator pauses and waits)

The `expert_invite_protocol` field in MeetingDecl points to instructions
for how to identify and invite experts.

## Meeting Execution Flow

```
┌──────────────────────────────────────────────────────────────┐
│ MEETING: requirements-meeting                                 │
│                                                               │
│ Facilitator (coordinator)                                     │
│   │                                                           │
│   │ Check: which action triggered this meeting?               │
│   │ Check: which meeting declaration matches?                 │
│   │ Check: which agents are participants?                     │
│   │                                                           │
│   │ ═══ Round 1: diverge ═══                                 │
│   │                                                           │
│   │ Broadcast to all core participants:                       │
│   │   "Here is the user's request. Share your perspective.    │
│   │    What do you see? What concerns you? What's missing?"   │
│   │                                                           │
│   │ Collect contributions:                                    │
│   │   PM:        "User needs X to solve Y"                    │
│   │   Architect: "From tech perspective, Z constraint exists" │
│   │   QA:        "How do we test this? AC should include W"   │
│   │   Expert:    "In this industry, regulation R applies"     │
│   │                                                           │
│   │ ═══ Convergence check ═══                                 │
│   │   Open questions? YES (PM hasn't addressed Z)             │
│   │   Unresolved challenges? NO                               │
│   │   Min rounds reached? NO (1 < 2)                         │
│   │   → Schedule Round 2                                      │
│   │                                                           │
│   │ ═══ Round 2: challenge ═══                                │
│   │                                                           │
│   │ Broadcast all Round 1 contributions to all participants:  │
│   │   "Here's what everyone said. Challenge or refine."       │
│   │                                                           │
│   │ Collect contributions:                                    │
│   │   Architect → PM: "Is X really needed? Can we do X'?"    │
│   │   QA → Architect: "Does Z affect testability?"            │
│   │   PM → Expert: "Does R apply to all user tiers?"          │
│   │   Expert: "R applies to paid tier, not free tier"         │
│   │                                                           │
│   │ ═══ Convergence check ═══                                 │
│   │   Open questions? YES (PM needs to respond to Architect)  │
│   │   → Schedule Round 3                                      │
│   │                                                           │
│   │ ═══ Round 3: deep_dive (feasibility) ═══                  │
│   │                                                           │
│   │ Focus: PM responds to Architect's challenge               │
│   │   PM: "After considering, X is needed because... but     │
│   │         we can simplify to X' for v1"                     │
│   │   Architect: "X' works. Here's the adjusted design..."   │
│   │   QA: "X' is testable. Updated AC: ..."                  │
│   │                                                           │
│   │ ═══ Convergence check ═══                                 │
│   │   Open questions? NO                                      │
│   │   Unresolved challenges? NO                               │
│   │   Min rounds reached? YES (3 >= 2)                       │
│   │   → Converge                                              │
│   │                                                           │
│   │ ═══ Round 4: converge ═══                                 │
│   │                                                           │
│   │ Facilitator synthesizes:                                  │
│   │   "Agreements: X' for v1, Z constraint acknowledged,     │
│   │    R applies to paid tier only, AC includes W"            │
│   │                                                           │
│   │ Participants confirm:                                     │
│   │   PM: ✅  Architect: ✅  QA: ✅  Expert: ✅              │
│   │                                                           │
│   │ ═══ Output ═══                                            │
│   │                                                           │
│   │ Facilitator writes artifacts:                             │
│   │   proposal.md (incorporating all perspectives)            │
│   │   requirements.md (with challenges addressed)             │
│   │                                                           │
│   │ Meeting transcript saved for traceability.                │
└──────────────────────────────────────────────────────────────┘
```

## Multi-Round Flexibility

The number of rounds is **not predetermined**. The facilitator decides:

- **Minimum 2 rounds**: At least one diverge + one converge
- **Maximum configurable**: Default 10, can be set per meeting
- **Dynamic phase selection**: Based on what emerged in previous rounds
- **Early termination**: If convergence reached before max_rounds, stop
- **Extension**: If important issues emerge late, add rounds

Example meeting trajectories:

```
Simple feature (3 rounds):
  diverge → challenge → converge

Complex domain (7 rounds):
  diverge → challenge → deep_dive(feasibility) → diverge(deeper) →
  challenge → deep_dive(compliance) → converge

Expert needed mid-meeting (5 rounds):
  diverge → challenge → deep_dive(regulatory) → invite expert →
  expert contributes → converge
```

## Comparison with Other Approaches

| Approach               | Interaction Pattern                   | Round Structure          | Expert Support      |
| ---------------------- | ------------------------------------- | ------------------------ | ------------------- |
| **BMAD**               | Sequential relay (Bryn→Alex→Dev→Qwen) | Fixed per persona        | None                |
| **superpowers**        | Isolated subagents, no cross-talk     | 1 round per subagent     | None                |
| **gstack**             | Sequential review pipeline            | Fixed stages             | None                |
| **spec-graph meeting** | Broadcast roundtable                  | Dynamic, flexible rounds | invite_only experts |

## Integration with Agent Registry

Meetings use the agent registry for participants:

```yaml
# foundation.pack/pack.yaml
meetings:
  - id: requirements-meeting
    participants:
      - {
          agent_id: pm,
          role: core,
          perspective: "user needs and business value",
        }
      - {
          agent_id: architect,
          role: core,
          perspective: "technical feasibility and constraints",
        }
      - {
          agent_id: qa,
          role: core,
          perspective: "testability and acceptance criteria",
        }
    expert_invite_protocol: agents/expert-invite-protocol.md
```

The facilitator dispatches each participant as a sub-agent, but instead
of giving each one isolated context, it gives them **the full discussion
history** from previous rounds.

## Facilitator Prompt Construction

For each round, the facilitator constructs each participant's prompt:

```
[Agent's system prompt (from prompt_ref)]

[Meeting context: purpose, participants, what we're discussing]

[Discussion history: ALL contributions from previous rounds]

[Current round: phase, objective, facilitator's prompt for this round]

[Your task: contribute based on your perspective. You can:
 - Make a statement about the topic
 - Ask another participant a question
 - Challenge another participant's previous statement
 - Refine/build on another participant's idea]
```

Key: every participant sees ALL previous contributions. This is the
broadcast model — no information hiding between participants.

## Traceability

Every meeting produces a transcript:

```json
{
  "meeting_id": "requirements-meeting",
  "started_at": "...",
  "completed_at": "...",
  "participants": ["pm", "architect", "qa", "domain-expert( invited)"],
  "rounds": [
    {
      "round": 1,
      "phase": "diverge",
      "contributions": [...]
    }
  ],
  "convergence_summary": "Agreed on X' for v1...",
  "open_questions": ["Should we support tier 3?"]
}
```

This creates full traceability: who said what, when, how the discussion
evolved, and what was agreed upon.
