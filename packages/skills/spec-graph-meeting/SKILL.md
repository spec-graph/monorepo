---
name: spec-graph-meeting
description: Manage spec-graph multi-agent meetings. Create ad-hoc meetings or run declared ones. Record contributions, advance rounds, complete synthesis. Use when the coordinator wants to resolve ambiguity through multi-perspective discussion.
license: MIT
compatibility: Requires spec-graph CLI v3+ with meeting subcommands.
metadata:
  author: spec-graph
  version: "1.0"
---

Manage spec-graph multi-agent collaborative meetings.

Meetings bring multiple agents (PM, Architect, Developer, QA, etc.) together in structured rounds (diverge → challenge → converge). Instead of one agent producing artifacts in isolation, participants discuss from their perspectives and converge on shared understanding.

---

## Prerequisites

- spec-graph CLI v3+ installed
- `.spec-graph/graph.yaml` exists (for declared meetings) OR use ad-hoc mode

---

## Meeting Lifecycle

```
init → round 1 (diverge) → advance → round 2 (challenge) → advance → complete
                                                                  or abandon
```

---

## Declared Meetings (from graph.yaml)

List meetings declared in the project graph:

```bash
spec-graph meeting list
```

Start one:

```bash
spec-graph meeting init <meeting-id> --session <session-id>
```

---

## Ad-Hoc Meetings

Initiate without a graph declaration — use when you need a discussion that
wasn't pre-planned:

```bash
spec-graph meeting init <id> \
  --purpose "Should we use REST or gRPC for this service?" \
  --participants "architect:technical-tradeoffs,pm:user-impact,qa:testability" \
  --min-rounds 2 --max-rounds 5
```

Participants: comma-separated `agent_id:perspective` pairs. The coordinator
is always the facilitator (manages rounds, synthesizes output).

---

## Running a Meeting

### For each round

Dispatch each core participant as a sub-agent. Their prompt should include:
- System prompt (if agent is declared)
- Meeting purpose
- ALL previous round contributions (broadcast model)
- Current round's phase + objective + prompt

### Recording contributions

After each participant returns:

```bash
spec-graph meeting record <id> \
  --participant <agent-id> \
  --type statement|question|challenge|refinement|synthesis \
  --content "the contribution text"
```

### Advancing

After all participants in a round have contributed:

```bash
spec-graph meeting advance <id>
```

Check convergence after each round:
- No new questions/challenges → ready to synthesize
- Reached min_rounds → can synthesize
- Reached max_rounds → MUST synthesize (force converge)

### Completing

Synthesize all contributions (coordinator does this):

```bash
spec-graph meeting complete <id> \
  --summary "Agreed on: REST with OpenAPI 3.1. Open questions: auth mechanism remains unresolved."
```

### Abandoning

```bash
spec-graph meeting abandon <id> --reason "escalated to user for decision"
```

---

## Viewing Transcript

```bash
# Full transcript
spec-graph meeting show <id>

# JSON output
spec-graph meeting show <id> --json
```

---

## When to Use Meetings

**Use:**
- High complexity, many capabilities, open questions
- Cross-cutting concerns (security × performance × UX)
- Design decisions with genuine trade-offs
- Task decomposition needs multi-perspective alignment

**Skip (single-agent is better):**
- Simple, well-defined tasks
- Low complexity, 1-2 capabilities
- Factual questions (read code, don't convene a meeting)
