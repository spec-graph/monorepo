# meeting-declaration: task-decomposition-meeting

## Requirement: task-decomposition-meeting exists in foundation.pack

Foundation pack MUST declare a `task-decomposition-meeting` for the tasks stage, enabling multi-perspective collaborative task decomposition when the coordinator decides it's needed.

### Scenario: meeting is declared with correct metadata

**Given** foundation.pack pack.yaml
**When** compose generates graph.yaml
**Then** graph.meetings contains an entry with:
- `id: "task-decomposition-meeting"`
- `on_actions: [plan, tasks]`
- `min_rounds: 3`
- `max_rounds: 6`

### Scenario: meeting has four core participants

**Given** task-decomposition-meeting declaration
**When** meeting is initiated
**Then** participants include:
- PM (core, perspective: user stories + acceptance criteria)
- Architect (core, perspective: dependencies + contracts)
- Developer (core, perspective: feasibility + granularity)
- QA (core, perspective: testability + edge cases)

### Scenario: meeting has three structured rounds

**Given** task-decomposition-meeting declaration
**When** meeting runs
**Then** round 1 is `diverge` (each shares perspective)
**And** round 2 is `challenge` (question and identify gaps)
**And** round 3 is `converge` (agree on final tasks)

### Scenario: meeting produces tasks artifact

**Given** meeting completes
**When** coordinator synthesizes output
**Then** output artifacts include `plan/tasks`
**And** tasks.md contains: task list, dependencies, acceptance criteria

### Scenario: meeting transcript is preserved

**Given** meeting completes
**When** coordinator calls `spec-graph meeting complete --summary "..."`
**Then** `.spec-graph/meetings/task-decomposition-meeting.yaml` exists
**And** contains all round transcripts and convergence summary

### Scenario: meeting respects max rounds

**Given** meeting is in progress and has reached `max_rounds`
**When** coordinator tries to advance again
**Then** meeting manager forces completion (or rejects advance)
**And** open questions are recorded

## Implementation Notes

- File: `packages/core/packs/foundation.pack/pack.yaml`
- Add to `provides.meetings` array (alongside existing `requirements-meeting`)
- Re-compose graph.yaml after changes
- Meeting state managed by `meeting/MeetingManager` (already implemented)
- Meeting → tasks.md conversion: coordinator responsibility (not auto-generated)
