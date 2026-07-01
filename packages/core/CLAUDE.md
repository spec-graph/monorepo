# CLAUDE.md — spec-graph core

> spec-graph is a strict-gate, prompt-driven, automatic progression development brain.
> It generates rich layered XML prompts for external AI agents and evaluates their
> outputs through strict quality gates. It is a **brain, not hands** — all execution
> is delegated to external agents via pluggable adapters.

## Core Modules

The core library (`packages/core/`) provides seven modules:

| Module | Responsibility |
|--------|----------------|
| `automator` | Session lifecycle (start / confirm / next / submit / status / intervene / autoRun) |
| `prompt-construction` | Build layered XML prompts with methodology weaving (MUST/SHOULD/MAY) |
| `planning` | Intent → capability decomposition with topological ordering |
| `gate-enforcement` | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| `external-coordination` | Agent adapter registry + Claude Code / Codex adapters |
| `knowledge-base` | Directory tree loader, skill selection, local override support |
| `recovery` | 4-level progressive retry strategy with Jaccard similarity detection |

All modules are accessible via `require('@spec-graph/core').<moduleName>`.

## 8-Stage FSM

```
specify → design → plan → implement → review → test → accept → integrate
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

// 3. Generate next prompt for agent
const prompt = core.automator.nextPrompt(plan.sessionId);
// prompt.xml contains the layered XML prompt

// 4. Agent executes (via Claude Code adapter, Codex adapter, etc.)
const response = await core.externalCoordination.invokeAgent(prompt.xml, {
  adapterId: 'claude-code',
});

// 5. Submit result → gate evaluates → state advances if passed
const result = core.automator.submitResult(plan.sessionId, response);
// result.advanced = true/false
// result.diagnosis = { ... } if failed

// 6. Repeat steps 3-5 until result.done === true
```

The `autoRun` function wraps this into a single call.

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

## Development Discipline

- spec-graph is a library — it should NOT write to user project files directly
- All execution is delegated to external agents
- State is persisted to `.spec-graph/` (gitignored in user projects)
- The knowledge-base is shipped with the package
