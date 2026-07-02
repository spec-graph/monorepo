# spec-graph v3.0: Declaration Engine

## Context

spec-graph v2.0.0 was designed as an "automatic progression development brain" with three API surfaces: `auto` (full automatic), `stateless` (external orchestration), and `hook` (agent hook integration). However, the `auto` mode and `external-coordination` module violate the core "brain, not hands" principle by spawning child processes and directly invoking agents.

v3.0 repositions spec-graph as a **pure declaration engine**: a state machine manager, dispatch manifest generator, and gate evaluator that never executes. All agent invocation is delegated to external coordinators (Claude Code hooks, CI/CD systems, custom orchestrators).

### Current State Audit

```
Violations of brain-not-hands principle:
  external-coordination/   → spawn `claude -p` child_process
  prompt-construction/     → generates XML for invokeAgent
  cli/auto.ts              → calls autoRun + invokeAgent
  cli/next-prompt.ts       → outputs XML for agent invocation
  automator.autoRun()      → internally calls invokeAgent
  spec-graph-auto SKILL    → references auto command

Other issues:
  1. Two sub-agent dispatch paths coexist
     - Path A (auto + invokeAgent + child_process) ← violates principle
     - Path B (dispatch + hook) ← correct path, undocumented
  
  2. Two prompt formats coexist
     - XML format (prompt-construction module)
     - 9-section envelope (dispatch module) ← more complete, standard
  
  3. FSM stage 'plan' conflicts with CLI command 'spec-graph plan'
     - 'spec-graph plan' → strategic planning (capabilities)
     - FSM 'plan' stage → tactical decomposition (tasks.md)
  
  4. 'spec-graph init' is a stub
     - Only prints text, doesn't create .spec-graph/ directory
  
  5. compose doesn't support $or/$and operators
     - 3 packs using $or are incorrectly loaded (backend, api-design, ddd)
  
  6. tasks stage sub-agent can't see capabilities
     - plan.capabilities generated in strategic plan phase
     - FSM plan stage doesn't know which capabilities to plan
  
  7. implement stage gate always passes
     - evaluateGateStatus stageArtifacts dictionary missing implement entry
     - Any incomplete code is accepted
```

## Goals / Non-Goals

**Goals:**
- Enforce the "brain, not hands" principle: spec-graph never spawns child processes or invokes agents
- Make dispatch + hook the primary API surface for local agent integration
- Preserve stateless API for external orchestration systems (if it exists and only returns JSON)
- Fix critical bugs: init stub, implement gate always passing, stage naming collision
- Provide complete documentation for the dispatch workflow
- Maintain backward compatibility where possible (old sessions with stage: "plan")

**Non-Goals:**
- v3.0 will not add new features beyond fixing critical bugs
- v3.0 will not support compose `$or/$and` operators (deferred to v3.1)
- v3.0 will not inject capabilities into tasks stage prompts (deferred to v3.1)
- v3.0 will not include E2E tests with real sub-agents (deferred to v3.2)
- v3.0 will not provide an `auto` mode or any automatic progression
- v3.0 will not execute code, write documents, or run tests directly

## What Changes

### Deleted (violates brain-not-hands)

| Module | Reason |
|--------|--------|
| `packages/core/src/external-coordination/` | spawns `claude -p` via child_process |
| `packages/core/src/prompt-construction/` | generates XML prompts for invokeAgent |
| `packages/cli/src/commands/auto.ts` | calls autoRun + invokeAgent |
| `packages/cli/src/commands/next-prompt.ts` | outputs XML format (stateless JSON version preserved if exists separately) |
| `packages/core/src/automator/index.ts` → `autoRun()` function | internally calls invokeAgent |
| `packages/skills/spec-graph-auto/` | references auto command |

### Modified

| Change | Reason |
|--------|--------|
| FSM stage `plan` → `tasks` | eliminates naming collision with `spec-graph plan` CLI command |
| `spec-graph init` → real implementation | currently a stub that only prints text |
| implement gate → real code checking | currently always passes |
| hook auto-registration → in init | users should be able to use dispatch immediately after init |
| documentation → comprehensive update | remove auto references, add dispatch + hook workflow |

### Added

| Content | Purpose |
|---------|---------|
| `spec-graph-dispatch` SKILL | documents dispatch + hook workflow |
| `spec-graph-init` SKILL | documents init command |
| backward compatibility → dispatch | maps old stage name "plan" → "tasks" automatically |
| migration guide | `docs/migration-3.0.md` for v2 → v3 upgrade |

### Archived

| Change | Reason |
|--------|--------|
| `spec-graph-v2` proposal | core promise (auto command) is being deleted |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  spec-graph v3.0: Declaration Engine                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Core Responsibilities:                                         │
│  • FSM state management (state.yaml)                           │
│  • Dispatch manifest generation (9-section envelope)           │
│  • Gate evaluation (pass/fail + diagnosis)                      │
│  • Artifact tracking (machine-state.yaml)                       │
│  • Knowledge-base (methodologies, templates)                    │
│  • Pack composition (graph.yaml)                                │
│                                                                 │
│  Explicitly NOT Doing:                                          │
│  ❌ Spawning child processes                                    │
│  ❌ Invoking agents directly                                    │
│  ❌ Managing agent lifecycle                                    │
│  ❌ Generating prompts (only manifests)                         │
│  ❌ Automatic progression (no single-loop mode)                 │
│                                                                 │
│  One-liner:                                                     │
│  "spec-graph is the brain that produces instructions            │
│   (manifests), but never the hands that execute."               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

  Brain (spec-graph)         Hook                   Hands (Claude Code)
  ──────────────────         ─────                  ─────────────────────
  init                       │                      User action
  plan                       │                      Confirm plan
  confirm                    │                      User confirms
  compose                    │                      Auto-assembles graph
  dispatch --json ──────────▶│  Detects Bash output
  (produces manifest)        │  Injects system-reminder
                             │         │
                             │         ▼
                             │  Main agent uses Agent tool to dispatch sub-agent
                             │  Sub-agent produces artifact
                             │  Main agent runs advance
                             │         │
                             │         ▼
                             └──── advance ─────────▶ Gate evaluation
                                                     State progression
                                                     Machine-state update

  Repeat 8 times: dispatch → hook → advance
  Until state = "completed"
```

### API Surfaces

```
┌────────────────────────────────────────────────────────────────┐
│  API Surface 1: Hook (local agent integration)                │
│  ───────────────────────────────────────────                   │
│  • dispatch --json → manifest                                 │
│  • dispatch-watcher.mjs hook → injects system-reminder        │
│  • main agent uses Agent tool to dispatch sub-agent           │
│  • advance --result → gate evaluation + state progression     │
│  • Target users: Claude Code / Codex / Gemini CLI users       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  API Surface 2: Stateless (external orchestration)            │
│  ────────────────────────────────────────────────              │
│  • next-prompt --json → next prompt (stateless, JSON only)   │
│  • advance --result → gate evaluation + state progression     │
│  • Target users: CI/CD, custom orchestrators, remote agents   │
│  • Note: next-prompt is not auto; it returns once, no loop    │
└────────────────────────────────────────────────────────────────┘

Deleted:
  ❌ auto command (single-loop automatic progression)
  ❌ external-coordination module (spawn agent)
  ❌ prompt-construction module (XML prompt generation)
```

### 8-Stage FSM

```
┌─────────────┬──────────────┬───────────────────┬────────────────────────────────┐
│ Stage       │ Agent        │ Output            │ Gate (exit criteria)           │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ specify     │ pm           │ proposal.md       │ file exists + 4 sections       │
│             │ capable      │                   │ (Problem/Solution/Scope/Risks) │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ design      │ architect    │ design.md         │ file exists + 4 sections       │
│             │ capable      │                   │ + traceability to proposal     │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ tasks       │ developer    │ tasks.md          │ checkbox format + ≥3 tasks     │
│             │ standard     │                   │ (renamed from 'plan')          │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ implement   │ developer    │ src/**/*          │ source files exist             │
│             │ standard     │                   │ + tsc --noEmit pass (if avail) │
│             │ ★ parallel   │                   │ + tests pass (if available)    │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ review      │ reviewer     │ review.md         │ findings + resolutions         │
│             │ capable      │                   │                                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ test        │ qa           │ test.md           │ test results + coverage        │
│             │ standard     │                   │                                │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ accept      │ qa           │ verification.md   │ acceptance criteria + manual   │
│             │ standard     │                   │ confirmation                   │
├─────────────┼──────────────┼───────────────────┼────────────────────────────────┤
│ integrate   │ developer    │ pr.md             │ Summary + Test Plan            │
│             │ standard     │                   │                                │
└─────────────┴──────────────┴───────────────────┴────────────────────────────────┘

★ implement stage special handling:
  • If capabilities count > 1 → dispatch multiple sub-agents in parallel
  • Each sub-agent handles one capability
  • Same parallel_group → dispatch simultaneously
  • After all sub-agents return → single advance
```

### 9-Section Envelope

```
Dispatch manifest action.prompt field contains 9 sections:

┌────────────────────────────────────────┐
│ 1. Identity        → agent role        │
│ 2. System Prompt   → domain knowledge  │
│ 3. Task Context    → stage/intent/...  │
│ 4. Input Artifacts → upstream (RO)     │
│ 5. Output Spec     → exact path+format │
│ 6. File Scope      → read/write/forbid │
│ 7. Verification    → lint/test/cmd     │
│ 8. Status Report   → JSON protocol     │
│ 9. After Completion→ next_step         │
└────────────────────────────────────────┘

Advantages:
  • Structured, agent-friendly
  • Clear responsibility per section
  • Already implemented in dispatch module
  • Simpler than XML format
```

## Complete Workflow

```
Phase 0: Installation & Initialization
  $ npm install -g spec-graph@3
  $ cd /path/to/project
  $ spec-graph init
    → creates .spec-graph/ + registers hook

Phase 1: Strategic Planning
  $ spec-graph plan "Build JWT auth system"
    → LLM decomposes intent into capabilities
    → sessionId = "build-jwt-auth-system"

Phase 2: Confirmation
  $ spec-graph confirm build-jwt-auth-system
    → state = "running"

Phase 3: Composition (auto-done in init if packs/ exists)
  $ spec-graph compose
    → scans packs → graph.yaml

Phase 4-11: 8-Stage FSM Loop
  For each stage (specify → design → tasks → implement → review → 
                  test → accept → integrate):
  
  Step A: $ spec-graph dispatch --session <id> --json
    → produces DispatchManifest with 9-section envelopes
  
  Step B: dispatch-watcher hook auto-triggers
    → detects "spec-graph dispatch"
    → injects system-reminder to Claude Code
  
  Step C: Claude Code dispatches sub-agent(s)
    → uses Agent tool
    → sub-agent produces artifact(s)
    → returns status-report JSON
  
  Step D: $ spec-graph advance --session <id> --result '{...}'
    → gate evaluation
    → state progression
    → machine-state update
  
  Step E: Check result
    → advanced = true → continue to next stage
    → advanced = false → read diagnosis, fix, retry (max 4x)
    → done = true → workflow complete

Phase 12: Completion & Archive
  $ spec-graph status --session <id>
    → state = "completed"
    → readyForArchive = true
  
  $ spec-graph archive --session <id> (optional)
    → moves to .spec-graph/archive/
```

## File Structure

```
spec-graph/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── automator/              ✓ State machine core
│   │   │   ├── planning/               ✓ LLM intent decomposition
│   │   │   ├── gate-enforcement/       ✓ 5 rule types evaluation
│   │   │   ├── knowledge-base/         ✓ Knowledge工艺库
│   │   │   ├── recovery/               ✓ 4-level retry
│   │   │   ├── sense/                  ✓ Project feature detection
│   │   │   ├── composer/               ✓ Pack composition
│   │   │   ├── machine-state/          ✓ Artifact state tracking
│   │   │   ├── dispatch/               ✓ Manifest generation
│   │   │   ├── dependency-analyzer/    ✓ Topological sort
│   │   │   │
│   │   │   ├── external-coordination/  ✗ Deleted
│   │   │   └── prompt-construction/    ✗ Deleted
│   │   │
│   │   ├── knowledge/
│   │   │   └── stages/
│   │   │       ├── specify/
│   │   │       ├── design/
│   │   │       ├── tasks/              Renamed from plan/
│   │   │       ├── implement/
│   │   │       ├── review/
│   │   │       ├── test/
│   │   │       ├── accept/
│   │   │       └── integrate/
│   │   │
│   │   └── hooks/
│   │       └── dispatch-watcher.mjs    ✓ PostToolUse hook
│   │
│   ├── cli/
│   │   └── src/commands/
│   │       ├── init.ts                 ✓ Real implementation
│   │       ├── plan.ts                 ✓
│   │       ├── confirm.ts              ✓
│   │       ├── compose.ts              ✓
│   │       ├── dispatch.ts             ✓
│   │       ├── advance.ts              ✓
│   │       ├── status.ts               ✓
│   │       ├── intervene.ts            ✓
│   │       ├── diagnose.ts             ✓
│   │       ├── sessions.ts             ✓
│   │       ├── validate.ts             ✓
│   │       ├── config.ts               ✓
│   │       ├── machine.ts              ✓
│   │       ├── artifact-complete.ts    ✓
│   │       ├── check-run.ts            ✓
│   │       ├── completion.ts           ✓
│   │       ├── auto.ts                 ✗ Deleted
│   │       └── next-prompt.ts          ✗ Deleted (XML format)
│   │
│   └── skills/
│       ├── spec-graph-plan/            ✓
│       ├── spec-graph-dispatch/        ✓ New
│       ├── spec-graph-status/          ✓
│       ├── spec-graph-intervene/       ✓
│       ├── spec-graph-diagnose/        ✓
│       ├── spec-graph-validate/        ✓
│       ├── spec-graph-init/            ✓ New
│       └── spec-graph-auto/            ✗ Deleted
│
├── docs/
│   └── migration-3.0.md                ✓ New
│
└── openspec/changes/
    └── v3-declaration-engine/          Current proposal
```

## Implementation Plan

```
Phase 1: Analysis & Preparation (0.5 day)
  • Audit all code violating brain-not-hands
  • Identify all dependencies on violating code
  • Identify all 'plan' stage references
  • Verify dispatch module completeness
  • Confirm init/implement gate current state
  • List all test files to delete/modify

Phase 2: Core Cleanup — Delete Violating Code (1 day)
  • Delete external-coordination module
  • Delete prompt-construction module
  • Delete auto command
  • Delete next-prompt command (XML format)
  • Delete autoRun() function
  • Delete spec-graph-auto SKILL
  • Delete related tests
  • Update exports in index.ts files
  • Verify compilation
  • Run tests
  • Verify grep returns 0 matches

Phase 3: Stage Rename — plan → tasks (0.5 day)
  • Modify STAGES array
  • Modify Stage type union
  • Modify STAGE_OUTPUTS dictionary
  • Modify nextPrompt methodology selection
  • Modify dispatch STAGE_OUTPUT_MAP
  • Rename knowledge/stages/plan/ → tasks/
  • Modify pack agent_bindings
  • Modify pack actions arrays
  • Modify pack gate on_transition
  • Add backward compatibility (dispatch maps "plan" → "tasks")
  • Modify test files
  • Verify compilation
  • Run tests

Phase 4: Fix Critical Bugs (1 day)
  • Implement real init command
    - Create .spec-graph/ directory
    - Write config.yaml template
    - Create sessions/ directory
    - Auto-register hook to .claude/settings.json
    - Auto-compose if packs/ exists
    - Add --force and --skip-hook options
  
  • Implement real implement gate
    - Check source files exist (non-.md)
    - Run tsc --noEmit if available
    - Run tests if available
    - Provide diagnosis on failure
  
  • Add tests for init and implement gate
  • Verify compilation
  • Run tests

Phase 5: Dispatch Path Completion (0.5 day)
  • Verify 9-section envelope is complete
  • Verify parallel_group support
  • Verify dispatch-watcher.mjs hook logic
  • Add missing fields if needed
  • Verify compilation
  • Run tests

Phase 6: Documentation Update (0.5 day)
  • Update README.md
    - Add dispatch command documentation
    - Add compose command documentation
    - Add machine-state.yaml documentation
    - Add dispatch-watcher.mjs hook documentation
    - Rename plan stage → tasks stage
    - Update 8-stage FSM diagram
    - Update CLI command table
  
  • Create packages/skills/spec-graph-dispatch/SKILL.md
    - When to use
    - Prerequisites
    - Workflow (loop 8 times)
    - Parallel dispatch
    - Error handling
  
  • Create packages/skills/spec-graph-init/SKILL.md
    - When to use
    - Steps (create directory + register hook)
    - Verification
  
  • Create docs/migration-3.0.md
    - auto → dispatch + hook
    - plan stage → tasks stage
    - XML prompt → 9-section envelope
    - Breaking changes
    - Migration steps
  
  • Update packages/core/CLAUDE.md
    - Reflect new workflow
    - Remove external-coordination references

Phase 7: Testing & Validation (1 day)
  • Run full test suite
  • Verify all tests pass
  • Manual testing:
    - spec-graph init
    - spec-graph plan
    - spec-graph confirm
    - spec-graph compose
    - spec-graph dispatch --json
    - Verify hook auto-triggers
    - Verify manifest JSON is valid
  • Verify grep returns 0 matches for violating code
  • Verify backward compatibility (old session with stage:plan)
  • Verify compilation

Phase 8: Archive & Release (0.5 day)
  • Archive spec-graph-v2 proposal
  • Update CHANGELOG.md
  • Bump version to 3.0.0
  • Create git tag v3.0.0
  • Publish to npm
  • Announce breaking changes

Total: ~5.5 days (1 week)
```

## Change Breakdown

```
The current brain-not-hands-unification proposal should be split into 
4 independent changes:

Change 1: v3-declaration-engine (v3.0 core) — THIS PROPOSAL
  Scope: Delete violating code + complete dispatch path + fix critical bugs
  Version: v3.0.0

Change 2: compose-operators (v3.1)
  Scope: compose supports $or/$and operators
  Version: v3.1.0

Change 3: tasks-stage-capabilities (v3.1)
  Scope: tasks stage prompt includes capabilities
  Version: v3.1.0

Change 4: e2e-validation (v3.2)
  Scope: E2E test validation (mock sub-agent)
  Version: v3.2.0
```

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking change for v2 users | High | High | Clear migration docs + semantic versioning (v3.0.0) + migration guide |
| Old sessions with stage: "plan" break | Medium | Medium | Dispatch auto-maps "plan" → "tasks" (backward compatibility) |
| Hook auto-registration fails | Low | Medium | Manual check of .claude/settings.json + provide `spec-graph install --hook` command + documentation |
| Implement gate too strict | Medium | High | Only runs tsc/tests if available in package.json scripts + clear diagnosis on failure |
| Dispatch manifest incomplete | Low | High | Comprehensive testing + 9-section envelope validation |

## Impact

- **Deleted**: 6 modules/files
- **Modified**: 5 modules
- **Added**: 2 SKILLs + hook registration + migration guide
- **Renamed**: 1 stage + 1 knowledge directory
- **Archived**: 1 old change (spec-graph-v2)
- **Breaking changes**: auto command removed, XML prompts removed, external-coordination removed

## Migration Path

```
v2 → v3 migration:

  1. Delete .spec-graph/ (incompatible format)
  2. npm uninstall -g spec-graph
  3. npm install -g spec-graph@3
  4. spec-graph init (recreate .spec-graph/)
  5. spec-graph plan "<intent>" (start new session)

Breaking changes:
  ❌ auto command deleted → use dispatch + hook instead
  ❌ next-prompt XML format deleted → use dispatch --json instead
  ❌ external-coordination deleted → use hook instead

Preserved:
  ✅ stateless API (next-prompt --json + advance) if implemented
  ✅ hook API (dispatch --json + advance)
  ✅ all other commands (plan, confirm, compose, status, ...)
  ✅ 8-stage FSM
  ✅ knowledge-base
  ✅ gate-enforcement
```

## Open Questions

| Question | Answer | Rationale |
|----------|--------|-----------|
| **Q1: Should we preserve stateless API (next-prompt)?** | Yes, if it only returns JSON (not XML) | External orchestration systems need stateless access; but XML format is being deleted |
| **Q2: What if users rely on auto command?** | Provide clear migration guide + deprecation was not possible (v2 → v3 is breaking) | v3.0 is a major version bump; breaking changes are expected |
| **Q3: Should init auto-register hook by default?** | Yes | Users should be able to use dispatch immediately after init; can skip with --skip-hook |
| **Q4: What if implement gate fails due to missing dependencies?** | Gate only runs tsc/tests if available in package.json scripts | Graceful degradation; if no tsc/test scripts, only check file existence |
| **Q5: How do we test the complete workflow?** | v3.0 focuses on unit/integration tests; E2E with real sub-agents deferred to v3.2 | Keep v3.0 scope focused; E2E is a separate concern |

## Success Criteria

```
After v3.0 is complete:

  ✓ grep child_process = 0 matches in packages/core/src/
  ✓ grep invokeAgent = 0 matches in packages/
  ✓ grep autoRun = 0 matches in packages/
  ✓ spec-graph auto → "Unknown command"
  ✓ spec-graph next-prompt (XML) → "Unknown command"
  ✓ spec-graph init creates .spec-graph/ directory
  ✓ spec-graph init registers hook to .claude/settings.json
  ✓ dispatch --json produces complete 9-section envelope manifest
  ✓ implement gate checks source files + tsc + tests (if available)
  ✓ FSM stage 'tasks' (not 'plan') used throughout
  ✓ Old sessions with stage: "plan" auto-mapped to "tasks"
  ✓ All tests pass
  ✓ Documentation complete (README, SKILLs, migration guide)
  ✓ spec-graph-v2 proposal archived
  ✓ Version bumped to 3.0.0
  ✓ Published to npm
```

## Timeline

```
Week 1: v3.0 implementation
  Day 1: Analysis & preparation (0.5 day)
  Day 1-2: Core cleanup (1 day)
  Day 2: Stage rename (0.5 day)
  Day 3: Fix critical bugs (1 day)
  Day 4: Dispatch path completion (0.5 day)
  Day 4: Documentation update (0.5 day)
  Day 5: Testing & validation (1 day)
  Day 5: Archive & release (0.5 day)

Week 2+: v3.1+ (deferred changes)
  • compose-operators
  • tasks-stage-capabilities

Week 3+: v3.2 (deferred changes)
  • e2e-validation
```
