# CLAUDE.md — spec-graph core

> spec-graph v3 is a **declaration engine**: it manages the 9-stage FSM,
> generates dispatch manifests for sub-agents, and evaluates quality gates.
> It is a **brain, not hands** — all execution is delegated to external
> coordinators (Claude Code hooks, CI/CD systems, custom orchestrators).

## Core Modules

The core library (`packages/core/`) provides twelve modules:

| Module | Responsibility |
|--------|----------------|
| `automator` | Session lifecycle (start / confirm / submit / status / intervene) |
| `planning` | Intent → capability decomposition, LLM manifest + keyword fallback |
| `gate-enforcement` | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| `knowledge-base` | Directory tree loader, skill selection, local override support |
| `recovery` | 4-level progressive retry strategy with Jaccard similarity detection |
| `sense` | Project feature detection (language, framework, runtime, etc.) |
| `dispatch` | Generate structured dispatch manifests with 9-section envelopes |
| `composer` | Scan packs and compose graph.yaml |
| `machine-state` | Track artifact status per stage and capability |
| `meeting` | MeetingManager — lifecycle (create/record/advance/complete/abandon) |
| `isolation` | WorktreeManager + ScopeLock + MergeQueue for parallel execution |
| `integration-gate` | 3-level gate (individual → merge → system) for parallel execution |

All modules are accessible via `require('@spec-graph/core').<moduleName>`.

## 9-Stage FSM

```
specify → specs → design → tasks → implement → review → test → accept → integrate
```

Each stage has:
- `entry criteria` — what must be true to ENTER the stage
- `exit criteria` — what must be true to LEAVE the stage (→ advancing to next)

Gate configuration is in `knowledge/stages/<stage>/gate.yaml`.

## FSM Stages ≠ Graph Actions

**FSM stages 和 graph actions 是两套不同的概念，通过 `dispatch` 模块映射。**

```
 FSM stages (管道)：               graph actions (能力)：
 ─────────────────────────         ─────────────────────────
 定义"什么时候做什么"               定义"agent 能做什么"
 线性顺序，强制依赖                 声明式，不强制顺序
 gate 绑定在 stage 上              agent 绑定在 action 上

 specify ──── stage ────────▶      propose  ──── action ────▶ pm agent 执行
                                   specify  ──── action ────▶ pm agent 执行
                                   
 specs ─────── stage ────────▶     (no direct action — specs stage produces specs.md)

 design ───── stage ────────▶      design   ──── action ────▶ architect agent 执行
                                   contract ──── action ────▶ architect agent 执行

 tasks ────── stage ────────▶      plan     ──── action ────▶ developer agent 执行
                                   (v3.0 stage rename, action 名保留)

 implement ── stage ────────▶      implement── action ────▶ developer agent 执行

 review ───── stage ────────▶      review   ──── action ────▶ reviewer agent 执行

 test ─────── stage ────────▶      test     ──── action ────▶ qa agent 执行

 accept ───── stage ────────▶      accept   ──── action ────▶ qa agent 执行

 integrate ── stage ────────▶      integrate── action ────▶ developer agent 执行
                                   release  ──── action ────▶ developer agent 执行
                                   archive  ──── action ────▶ pm agent 执行
```

**⚠️ graph 有 12 个 actions，FSM 只有 9 个 stages。这是正确的设计。**
多余 bindings (propose, contract, archive, release, diagnose) 用于非管道场景 — 不要加 stage 让它们对齐，也不要删除它们。

## Session Lifecycle

```typescript
// 1. Create session with plan
const plan = core.automator.startSession(intent);

// 2. Confirm plan (human-in-the-loop, once)
core.automator.confirmPlan(plan.sessionId, plan);

// 3. Generate dispatch manifest (via CLI or hook-driven loop)
// $ spec-graph dispatch --session <id> --json
// → PostToolUse hook runs spec-graph hook dispatch
// → system-reminder injected → main agent dispatches sub-agent(s)

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
produces a manifest; the hook (`spec-graph hook dispatch`) injects a
system-reminder telling the coordinator what to do next.

## Hook Architecture

The dispatch loop is driven by a Claude Code PostToolUse hook:

```
settings.json:
  "PostToolUse": [{ "matcher": "Bash", "command": "spec-graph hook dispatch" }]

Flow:
  1. Main agent runs: spec-graph dispatch --json
  2. Hook fires → calls spec-graph hook dispatch
  3. CLI command reads stdin (hook context), parses manifest
  4. Builds system-reminder with agent/model/execution steps
  5. Main agent sees reminder → dispatches sub-agent(s)
  6. After completion: spec-graph submit --result '...'
  7. Loop back to step 1 (auto-loop protocol in reminder)
```

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

## Meeting Model

Meetings are an **optional tool** for the coordinator, not a mandatory pipeline step.

### CLI Commands

```bash
spec-graph meeting init <id> [--purpose ...] [--participants ...]
spec-graph meeting record <id> --participant <id> --type <type> --content <text>
spec-graph meeting advance <id>
spec-graph meeting complete <id> --summary <text>
spec-graph meeting abandon <id> [--reason ...]
spec-graph meeting show <id>
spec-graph meeting list
```

### Decision Flow

- Pack-declared meetings appear in the dispatch manifest as `meeting.available`
- The `meeting.recommended` field is a suggestion based on complexity signals
- The **coordinator decides** whether to initiate a meeting or use single-agent dispatch
- Simple unambiguous tasks → single-agent path (default)
- Complex/ambiguous tasks → coordinator can initiate meeting via CLI

### Ad-Hoc Meetings

For any unclear issue, the coordinator can self-initiate:
```bash
spec-graph meeting init <id> --purpose "the question" \
  --participants "agent1:perspective1,agent2:perspective2"
```

The ad-hoc meeting declaration is stored in the runtime file's `ad_hoc_decl` field.

See: `packs/foundation.pack/agents/coordinator-protocol.md`

## Worktree Isolation

Parallel sub-agents (implement stage with multiple capabilities) run in isolated git worktrees.

### CLI Commands

```bash
spec-graph worktree list [--status <status>]
spec-graph worktree status <unit-id>
spec-graph worktree create --session <id> --action <id> [--scope-*]
spec-graph worktree verify <unit-id>
spec-graph worktree merge <unit-id>
spec-graph worktree abandon <unit-id> [--reason ...]
spec-graph worktree scope-check <unit-id> --files <list> [--scope-*]
```

### Lifecycle

```
create → sub-agent works → verify → merge → cleanup
create → sub-agent works → verify fails → abandon → cleanup
```
