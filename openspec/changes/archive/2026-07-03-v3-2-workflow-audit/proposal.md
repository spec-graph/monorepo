# v3.2 Workflow Audit — End-to-End Completeness

## Context

Deep audit of the spec-graph v3.0 declaration engine implementation. Traced every module, CLI command, hook, and skill file to determine whether the system can run a complete 8-stage workflow end-to-end.

**Finding: the engine is ~85% complete, but integration gaps prevent a real end-to-end run.**

Key evidence: the test-project session (`build-3-independent-typescript-utility-libraries-*`) was force-advanced through all stages — no gate was ever actually evaluated. The `tasks` stage has no agent binding. Meeting and isolation modules are implemented but never called from dispatch.

This change fixes the gaps identified in the audit. It does NOT duplicate work already tracked in `v3-1-complete-workflow` (which covers meeting runtime module, worktree isolation module, gate unification, planning LLM, propose stage, and knowledge cleanup).

## Scope

### In Scope

1. **tasks stage agent binding** — foundation.pack `agent_bindings` has `plan: developer` but FSM stage is `tasks`. `dispatch` looks up `bindings['tasks']` → undefined. Fix: add `tasks: developer` to agent_bindings.

2. **Meeting按需触发** — meetings should be available as a tool for the coordinator, not a mandatory pipeline step. Simple unambiguous tasks use single-agent path. Complex/ambiguous tasks trigger a meeting at coordinator's discretion. Dispatch manifest surfaces `meeting_available` + `recommended` as informational fields.

3. **task-decomposition-meeting** — new meeting declaration in foundation.pack for the tasks stage. 4 participants (PM, Architect, Developer, QA). 3 rounds: diverge → challenge → converge. Used only when coordinator decides the task decomposition needs multi-perspective discussion.

4. **coordinator-protocol.md** — new file in foundation.pack. Documents how the coordinator (main agent) should orchestrate: when to use single-agent vs meeting, how to handle parallel waves, when to escalate.

5. **parseStateYaml → js-yaml** — automator's hand-written 880-line YAML parser is fragile. Replace with `js-yaml` (already a dependency). Keep backward compat for existing state.yaml files.

6. **dispatch CLI graphPath** — `spec-graph dispatch` doesn't pass graphPath, causing pack scanning fallback. Fix: pass `.spec-graph/graph.yaml` explicitly.

7. **manifest meeting metadata** — dispatch manifest includes `meeting.available`, `meeting.recommended`, `meeting.template` fields. Hook system-reminder surfaces meeting availability to coordinator.

8. **E2E validation** — run a complete workflow in test-project with actual gate evaluation (no force-advance). Validate specify gate (11 exit criteria), design gate, tasks gate, implement gate.

### Out of Scope

- Worktree isolation wiring into dispatch (covered by v3-1 tasks 4.7-4.12)
- Meeting runtime module implementation (covered by v3-1 tasks 5.1-5.6)
- Gate unification (covered by v3-1 section 3, done)
- Planning LLM mode (covered by v3-1 section 2, done)
- propose stage addition (covered by v3-1 section 6, done)
- Knowledge cleanup (covered by v3-1 section 7, done)
- KNOWN_RULES pluggable architecture (P3, future)
- sense 9-dimension expansion (P3, future)

## Design Decisions

### Decision 1: tasks binding fix — 方案A

Add `tasks: developer` directly to foundation.pack `agent_bindings`. Do NOT add stage→action name mapping in dispatch. Rationale: explicit binding is clearer than implicit mapping. Other packs overriding bindings should also include `tasks`.

### Decision 2: Hook auto-loop, no `auto` command

The dispatch-watcher hook already injects a system-reminder telling the coordinator to re-run `dispatch --json` after each advance. This is the auto-loop mechanism. No need for a `spec-graph auto` CLI command — the hook drives the loop.

### Decision 3: Meeting is a tool, not a pipeline step

Meetings are NOT mandatory for every tasks stage. The coordinator decides based on:
- `plan.complexity == 'high'` → recommend meeting
- `capabilities.length > 3` → recommend meeting
- `openQuestions.length > 0` → recommend meeting
- Ambiguity detected by coordinator → recommend meeting
- Simple, clear task → single agent, no meeting

Dispatch manifest surfaces this as informational fields. The hook system-reminder tells the coordinator "a meeting is available if you think this needs multi-perspective discussion".

### Decision 4: Coordinator (main agent) runs meeting, not spec-graph CLI

方案X: the coordinator dispatches sub-agents for each meeting participant, collects contributions, calls `spec-graph meeting record/advance/complete`. spec-graph provides meeting state management; the coordinator orchestrates the flow. This is consistent with the "brain not hands" principle.

### Decision 5: task-decomposition-meeting structure

- Participants: PM (core), Architect (core), Developer (core), QA (core)
- min_rounds: 3, max_rounds: 6
- Round 1 (diverge): each shares perspective on task decomposition
- Round 2 (challenge): question assumptions, identify conflicts
- Round 3 (converge): agree on final task list, dependencies, acceptance criteria
- Output: tasks.md (from convergence summary), meeting transcript

## Verification

1. Build: `npm run build` — core + cli pass
2. Tests: all existing tests pass + new tests for meeting metadata in dispatch
3. E2E: test-project runs complete 8-stage workflow with real gate evaluation
4. Simple task: single-agent path for low-complexity intent
5. Complex task: meeting path triggers for high-complexity intent with open questions
