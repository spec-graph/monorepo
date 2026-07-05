# v3.2 Design: Workflow Audit Fixes

## 1. tasks stage agent binding

### Problem

FSM stage is `tasks` but foundation.pack `agent_bindings` declares `plan: developer` (old action name). `dispatch/index.ts` does `bindings[stage]` where `stage = 'tasks'` → returns `undefined`.

### Fix

Add `tasks: developer` to foundation.pack `agent_bindings`. Also check ddd.pack for any overriding bindings.

```
foundation.pack agent_bindings (change):
  plan: developer       # ← keep for backward compat (graph action name)
  tasks: developer      # ← NEW (FSM stage name)
```

All packs that declare `agent_bindings` should declare both `plan` (graph action) and `tasks` (FSM stage). The compose engine merges by action key; both keys produce separate entries in graph.yaml.

### Why not a stage→action mapping layer?

方案B would add a mapping function:

```typescript
// dispatch/index.ts — rejected approach
const stageToAction: Record<string, string> = {
  tasks: 'plan',
  // ... other mappings as stages diverge from actions
};
const agentId = bindings[stageToAction[stage] || stage];
```

This would work but adds another layer of indirection. The design principle (CLAUDE.md) already says "graph actions (12) > FSM stages (8) — by design". Adding a mapping layer makes this divergence harder to reason about. Explicit bindings for both action names and stage names are clearer.

## 2. Meeting按需触发模型

### Current state (v3-1 design)

v3-1 tasks 5.7-5.8 describe dispatch detecting meeting triggers and auto-generating meeting actions before the perform_stage action. This makes meetings **mandatory** when a trigger matches.

### New design: meeting as optional tool

```
┌──────────────────────────────────────────────────────────┐
│                  dispatch manifest                       │
│                                                          │
│  stage: tasks                                            │
│  actions: [{                                             │
│    type: "perform_stage",                                │
│    id: "tasks",                                          │
│    agent_id: "developer",                                │
│    ...                                                   │
│  }]                                                      │
│                                                          │
│  meeting: {              ← informational field           │
│    available: true,                                      │
│    recommended: false,    ← based on complexity/ambiguity│
│    reason: "",                                           │
│    template: {                                           │
│      id: "task-decomposition-meeting",                   │
│      purpose: "...",                                     │
│      participants: [...],                                │
│      min_rounds: 3,                                      │
│      max_rounds: 6                                       │
│    }                                                     │
│  }                                                       │
└──────────────────────────────────────────────────────────┘

Coordinator (main agent) decides:
  ┌─────────────────────────────────────────────┐
  │ manifest.meeting.recommended === true?      │
  │   → 向用户展示 meeting 选项                 │
  │                                             │
  │ manifest.meeting.recommended === false?     │
  │   → 静默走 single-agent 路径                │
  │                                             │
  │ Coordinator 自己判断有歧义?                  │
  │   → 可以主动发起 ad-hoc meeting             │
  │   → spec-graph meeting init <id> --purpose  │
  │     (ad-hoc: 不依赖 pack 声明)              │
  └─────────────────────────────────────────────┘
```

### Recommendation logic

```typescript
// dispatch/index.ts — new helper
function shouldRecommendMeeting(status, plan): { recommended: boolean; reason: string } {
  if (plan.complexity === 'high') return { recommended: true, reason: 'High complexity' };
  if (plan.capabilities?.length > 3) return { recommended: true, reason: 'Many capabilities' };
  if (plan.openQuestions?.length > 0) return { recommended: true, reason: 'Open questions remain' };
  if (plan.risks?.some(r => r.includes('security') || r.includes('brownfield')))
    return { recommended: true, reason: 'Security or brownfield risks' };
  return { recommended: false, reason: '' };
}
```

### Hook system-reminder when meeting is available

```
# recommended === true 时:
⚡ Meeting available: task-decomposition-meeting
   Recommended: YES (high complexity, 5 capabilities)
   → Consider initiating a meeting if you think multi-perspective
     discussion would improve task decomposition
   → spec-graph meeting init task-decomposition-meeting

# recommended === false 时:
(不显示 meeting 相关信息，静默走 single-agent)
```

## 3. task-decomposition-meeting

### Declaration (new in foundation.pack)

```yaml
meetings:
  - id: task-decomposition-meeting
    description: "Multi-perspective task decomposition"
    purpose: "Decompose design into implementable tasks with correct
              dependencies and verifiable acceptance criteria"
    on_actions: [plan, tasks]
    min_rounds: 3
    max_rounds: 6
    participants:
      - agent_id: pm
        role: core
        perspective: "user story coverage, acceptance criteria traceability"
      - agent_id: architect
        role: core
        perspective: "dependency correctness, interface contracts"
      - agent_id: developer
        role: core
        perspective: "feasibility, granularity, file scope"
      - agent_id: qa
        role: core
        perspective: "testability, edge case coverage, verification criteria"
    output_artifacts:
      - plan/tasks
    rounds:
      - number: 1
        phase: diverge
        objective: "Each participant shares their task decomposition perspective"
        prompt: |
          Based on the design.md and proposal.md:
          1. How would you decompose this work into tasks?
          2. What dependencies do you see between tasks?
          3. What's your estimate for each task?
          Share from your perspective.
      - number: 2
        phase: challenge
        objective: "Question assumptions, identify conflicts, find gaps"
        prompt: |
          Review the task decompositions shared by other participants:
          1. What do you disagree with? Why?
          2. What tasks are missing?
          3. What dependency is incorrect?
          4. Which task is too large or too small?
      - number: 3
        phase: converge
        objective: "Agree on final task list with dependencies and acceptance criteria"
        prompt: |
          Based on the discussion:
          1. List the final agreed tasks
          2. For each task: dependency, acceptance criteria, estimated effort
          3. Note any remaining disagreements
```

### Meeting → tasks.md conversion

After meeting completes, the facilitator (coordinator) synthesizes the convergence summary into `tasks.md`. The format follows the existing `tasks.md` template:

```markdown
## Tasks

- [ ] 1.1 task-name — description (AC: acceptance criteria)
- [ ] 1.2 task-name — description (depends on: 1.1)
...
```

The coordinator generates this from the meeting transcript. spec-graph does not auto-generate it — the coordinator is responsible for the final artifact.

## 4. coordinator-protocol.md

### Purpose

A single reference document for the main agent (coordinator) that explains:

1. **How to read a dispatch manifest** — which fields matter
2. **When to dispatch a single agent vs when to initiate a meeting** — decision framework
3. **How to handle parallel waves** — simultaneous Agent tool calls
4. **When to escalate** — BLOCKED, retry exhausted, unclear issue
5. **The auto-loop protocol** — don't stop between dispatch → advance → dispatch

### Location

`packages/core/packs/foundation.pack/agents/coordinator-protocol.md`

### Content structure

```markdown
# Coordinator Protocol

## Your role
[You are the main agent coordinating the spec-graph workflow...]

## Reading the manifest
[How to parse manifest fields, what each field means...]

## Dispatch modes

### Single agent (default)
[When to use: simple tasks, low complexity, clear specs]

### Meeting (optional)
[When to consider: high complexity, open questions, conflicting requirements]
[How to initiate: spec-graph meeting init]
[How to run: dispatch participants, record, advance, complete]

### Parallel waves (implement stage)
[How to dispatch parallel sub-agents simultaneously]

## Auto-loop protocol
[After advance: immediately re-run dispatch --json]
[Stop conditions: done=true, BLOCKED, all retries exhausted]

## Escalation
[When to escalate to user]
[How to use spec-graph intervene]
```

## 5. parseStateYaml → js-yaml

### Current code

`automator/index.ts` has ~880 lines total. About 200 lines are `formatStateYaml()` and `parseStateYaml()` — hand-written line-by-line parsers.

### Replacement

```typescript
// Before (880 lines, hand-written parser):
function parseStateYaml(yaml: string): Partial<SessionData> {
  // ... 200+ lines of line-by-line parsing ...
}

// After (~10 lines):
import * as yaml from 'js-yaml'; // already a dependency

function parseSessionState(raw: string): SessionData {
  const data = yaml.load(raw) as SessionData;
  if ((data.stage as string) === 'plan') data.stage = 'tasks';
  return data;
}

function formatSessionState(data: SessionData): string {
  return yaml.dump(data, { lineWidth: 120, noRefs: true });
}
```

### Migration

old `state.yaml` files use the hand-written format. js-yaml can parse them because the hand-written format is valid YAML. No migration step needed — js-yaml reads both.

### Risk

The hand-written parser has subtle behaviors (like parsing `"value"` strings with surrounding quotes differently). Need to verify with existing session files that js-yaml produces the same `SessionData` objects.

**Mitigation**: run existing test suite. If tests pass, the parser replacement is correct. The test suite includes state parsing tests.

## 6. dispatch CLI graphPath

### Current code

```typescript
// packages/cli/src/commands/dispatch.ts
const manifest = core.dispatch.generateDispatchManifest(
  sessionId,
  process.cwd(),
  undefined  // packsDir — not passed
  // graphPath — not passed at all
);
```

### Fix

```typescript
const graphPath = path.join(process.cwd(), '.spec-graph', 'graph.yaml');
const manifest = core.dispatch.generateDispatchManifest(
  sessionId,
  process.cwd(),
  undefined,   // packsDir — fallback, graph.yaml is primary
  graphPath    // graphPath — uses composed graph
);
```

`generateDispatchManifest` already supports `graphPath` as the 4th parameter and prioritizes it over pack scanning. The fix is just passing it from the CLI.

## 7. manifest meeting metadata

### New fields in DispatchAction

```typescript
interface DispatchAction {
  // ... existing fields ...
  
  meeting?: {
    available: boolean;
    recommended: boolean;
    reason: string;
    template?: {
      id: string;
      purpose: string;
      participants: Array<{
        agent_id: string;
        role: string;
        perspective: string;
      }>;
      min_rounds: number;
      max_rounds: number;
    };
  };
}
```

### Where it's set

In `dispatch/index.ts` `planActions()`: after creating the single action for a stage, check if any meeting in the composed graph has `on_actions` matching the current stage action. If so, populate `action.meeting`.

### Hook behavior

In `dispatch-watcher.mjs`: if `action.meeting?.available && action.meeting?.recommended`, include meeting info in the system-reminder. If available but not recommended, don't mention it (coordinator can still find it in the manifest if needed).

## 8. E2E Validation

### Test plan

Two scenarios in test-project:

**Scenario A: Simple task (single-agent path)**
```
intent: "Add input validation to user registration endpoint"
complexity: low, 1 capability, 0 open questions

Expected: all 8 stages pass with single-agent dispatch
  specify → design → tasks (single agent) → implement → review →
  test → accept → integrate
Meeting: not triggered (not recommended, coordinator doesn't initiate)
```

**Scenario B: Complex task (meeting path)**
```
intent: "Refactor user authentication to support OAuth2 + social login
         while maintaining existing password auth"
complexity: medium, 5 capabilities, 2 open questions

Expected: all 8 stages pass
  specify → design → tasks (coordinator initiates meeting) → implement →
  review → test → accept → integrate
Meeting: coordinator initiates task-decomposition-meeting at tasks stage
```

### Validation criteria

For each scenario:
1. Every stage produces the expected artifact
2. Every gate passes on actual evaluation (not force-advance)
3. Session trace shows `trigger: "gate-pass"` for all transitions
4. machine-state.yaml shows all artifacts as `status: completed`
5. No errors or warnings in dispatch output
6. Meeting transcript exists for scenario B
