# CLAUDE.md — spec-graph core

> spec-graph v3 is a **declaration engine**: it manages the 8-stage FSM,
> generates dispatch manifests for sub-agents, and evaluates quality gates.
> It is a **brain, not hands** — all execution is delegated to external
> coordinators (Claude Code hooks, CI/CD systems, custom orchestrators).

## Core Modules

The core library (`packages/core/`) provides nine modules:

| Module | Responsibility |
|--------|----------------|
| `automator` | Session lifecycle (start / confirm / submit / status / intervene) |
| `planning` | Intent → capability decomposition with topological ordering |
| `gate-enforcement` | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| `knowledge-base` | Directory tree loader, skill selection, local override support |
| `recovery` | 4-level progressive retry strategy with Jaccard similarity detection |
| `sense` | Project feature detection (language, framework, runtime, etc.) |
| `dispatch` | Generate structured dispatch manifests with 9-section envelopes |
| `composer` | Scan packs and compose graph.yaml |
| `machine-state` | Track artifact status per stage and capability |

All modules are accessible via `require('@spec-graph/core').<moduleName>`.

## 8-Stage FSM

```
specify → design → tasks → implement → review → test → accept → integrate
```

Each stage has:
- `entry criteria` — what must be true to ENTER the stage
- `exit criteria` — what must be true to LEAVE the stage (→ advancing to next)

Gate configuration is in `knowledge/stages/<stage>/gate.yaml`.

## Session Lifecycle

```typescript
// 1. Create session with plan
const plan = core.automator.startSession(intent);

// 2. Confirm plan (human-in-the-loop, once)
core.automator.confirmPlan(plan.sessionId, plan);

// 3. Generate dispatch manifest (via CLI)
// $ spec-graph dispatch --session <id> --json
// Produces DispatchManifest with 9-section envelope for each action

// 4. External coordinator dispatches sub-agent(s)
// Claude Code main agent uses Agent tool per manifest actions
// Sub-agent produces artifact(s)

// 5. Submit result → gate evaluates → state advances if passed
const result = core.automator.submitResult(plan.sessionId, response);
// result.advanced = true/false
// result.diagnosis = { ... } if failed

// 6. Repeat steps 3-5 until result.done === true
```

**Note:** spec-graph never invokes agents directly. The dispatch command
produces a manifest; external coordinators (hooks, orchestrators) invoke
agents with the manifest's prompt content.

## File State

Sessions are persisted to `.spec-graph/sessions/<session-id>/`:
- `state.yaml` — current stage, state, plan, trace log
- `<stage>/` — directory with the artifact from that stage

The file format is a minimal YAML (custom parser, no js-yaml dependency).

## Gate Configuration

Each stage has a `gate.yaml` at `knowledge/stages/<stage>/gate.yaml`:

```yaml
entry:
  - id: plan-confirmed
    description: Plan has been confirmed
    verification: rule

exit:
  - id: proposal-exists
    description: proposal.md has been created
    verification: rule
  - id: proposal-structure
    description: Contains Why / What Changes / Capabilities / Impact sections
    verification: rule
  - id: capabilities-enumerated
    description: At least one capability in - `name`: desc or - **name**: desc format
    verification: rule
  ...
```

Verification methods:
- `rule` — deterministic check (file exists, content matches pattern, etc.)
- `traceability` — check that artifacts reference each other correctly
- `llm-judge` — defer to LLM with rubric (not yet implemented)
- `downstream-executability` — can the next stage be executed? (not yet implemented)
- `human` — requires manual confirmation

## Knowledge Base

The knowledge-base at `knowledge/` contains methodology guidance for each stage:

```
knowledge/
├── stages/
│   └── <stage>/
│       ├── gate.yaml
│       └── skills/
│           └── <skill>/
│               ├── instruction.md
│               └── templates/
└── shared/
    ├── prompt-schema.md
    ├── project-context.md
    └── verification-format.md
```

Load via: `core.knowledgeBase.loadKnowledgeBase(knowledgeBasePath)`.
Select via: `core.knowledgeBase.selectSkill(kb, stage, intent)`.

Users can extend/override by placing files in `.spec-graph/knowledge/`.

## Recovery

When a gate fails, the automator uses the recovery module:

1. **Level 1: Lightweight fix** — re-prompt with the diagnosis woven in
2. **Level 2: Swap methodology** — use a different skill from knowledge-base
3. **Level 3: Decompose task** — break into smaller subtasks
4. **Level 4: Escalate to user** — pause and request human intervention

Similarity detection (Jaccard index ≥ 0.8) prevents wasting retries on the same failing approach.

## Dispatch Manifest

The dispatch module produces a JSON manifest for external coordinators:

```typescript
interface DispatchManifest {
  sessionId: string;
  currentStage: Stage;
  actions: DispatchAction[];  // One or more sub-agent tasks
  meetings?: DispatchMeeting[];
}

interface DispatchAction {
  id: string;
  agentId: string;
  modelTier: 'capable' | 'standard' | 'fast';
  parallelGroup: number;      // Same group = dispatch simultaneously
  prompt: string;             // 9-section envelope
  outputSpec: { path, format, template? };
  fileScope: { read[], write[], forbid[] };
  verification?: { commands[], expectedExitCode };
  nextStep: string;           // CLI command to run after completion
}
```

## 9-Section Envelope

Each action.prompt contains 9 sections:

1. **Identity** — agent role and model tier
2. **System Prompt** — domain knowledge from pack
3. **Task Context** — stage, session, intent, action
4. **Input Artifacts** — upstream artifacts (READ-ONLY)
5. **Output Specification** — exact path + format (MUST)
6. **File Scope** — read/write/forbid globs (MUST)
7. **Verification** — lint/test/typecheck commands (MUST)
8. **Status Report Protocol** — JSON response format (MUST)
9. **After Completion** — next step command

## Development Discipline

- spec-graph is a declaration engine — it generates manifests, not execution
- All agent invocation is delegated to external coordinators
- State is persisted to `.spec-graph/` (gitignored in user projects)
- The knowledge-base is shipped with the package
- spec-graph never spawns child processes or calls LLM APIs directly
