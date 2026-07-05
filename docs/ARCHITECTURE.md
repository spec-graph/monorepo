# spec-graph Architecture

Three-layer architecture: each layer has a distinct role and audience.

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1: Skills  (packages/skills/)                              │
│  Audience: Claude Code / AI agents                                │
│  Role: User-facing orchestration — slash commands                 │
│                                                                    │
│  spec-graph-init       project bootstrap                          │
│  spec-graph-plan       intent → structured plan                   │
│  spec-graph-auto       full automatic workflow                    │
│  spec-graph-status     inspect workflow state                     │
│  spec-graph-validate   evaluate current state against gates       │
│  spec-graph-diagnose   diagnose gate failure                      │
│  spec-graph-intervene  manual intervention                        │
│  spec-graph-task       task start/review/complete/list            │
│  spec-graph-run        auto-select + continue sessions            │
│                                                                    │
│  Principle: 1 skill orchestrates N CLI commands                    │
│             Only user-facing scenarios get a skill                 │
└──────────────────────────────┬───────────────────────────────────┘
                               │ calls bash commands
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 2: CLI  (packages/cli/)                                    │
│  Audience: Shell / AI agents via bash                             │
│  Role: Atomic operations — thin wrappers over core API            │
│                                                                    │
│  plan, dispatch, submit, status, validate, intervene,   │
│  diagnose, sessions, task, run, init, compose, config,  │
│  install, gate, check, machine, analyze                           │
│                                                                    │
│  Principle: 1 CLI command ≈ 1 core API function (+ formatting)     │
│             Each command is 20-40 lines of arg parsing + output    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ import * as core from '@spec-graph/core'
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3: Core  (packages/core/)                                  │
│  Audience: CLI, programmatic consumers                            │
│  Role: Business logic engine — no CLI awareness                   │
│                                                                    │
│  automator/            session lifecycle + task tracking          │
│  planning/             intent → capability decomposition          │
│  gate-enforcement/     entry/exit criteria evaluation             │
│  dispatch/             routing manifest + task lifecycle steps    │
│  session-index/        global CSV index, ID allocation, migration │
│  composer/             pack scanning + graph.yaml composition     │
│  recovery/             4-level progressive retry                  │
│  sense/                project profile inference                  │
│  machine-state/        artifact status tracking                   │
│  meeting/              MeetingManager lifecycle                   │
│  isolation/            WorktreeManager + ScopeLock + MergeQueue   │
│  context-sharing/      parallel context generation                │
│  dependency-analyzer/  task dependency waves                      │
│  file-conflict-analyzer/ file conflict detection                  │
│  integration-gate/     three-level integration gate               │
│  parallel-recovery/    failure attribution + recovery             │
│  types/                shared TypeScript types                    │
│  utils/                shared utilities                           │
│                                                                    │
│  Principle: core provides API, never CLI                           │
│             core does not contain SKILL.md files                   │
└──────────────────────────────────────────────────────────────────┘
```

## CLI → Core Module Mapping

| CLI Command | Core Module | Core Function |
|-------------|-------------|---------------|
| `plan` | `planning` + `automator` | `generatePlan()` + `startSession()` |
| `submit` | `automator` | `submitResult()` |
| `status` | `automator` | `status()` |
| `validate` | `gate-enforcement` | `evaluateGate()` |
| `diagnose` | `gate-enforcement` | `diagnoseFailure()` |
| `intervene` | `automator` | `intervene()` |
| `sessions list` | `session-index` | `list()` |
| `sessions info` | `session-index` + `automator` | `get()` + `status()` |
| `sessions delete` | `automator` | `deleteSession()` |
| `sessions migrate` | `session-index` | `migrateAll()` |
| `sessions doctor` | `session-index` | `reconcile()` |
| `task start` | `automator` | `startTask()` |
| `task review` | `automator` | `reviewTask()` |
| `task complete` | `automator` | `completeTask()` |
| `task list` | `session-index` + `automator` | `get()` + `getSessionData()` |
| `run` | `session-index` + `automator` | `getLatestRunningSession()` + `status()` |
| `init` | `sense` | `sense()` |
| `compose` | `composer` | `composeGraph()` |
| `dispatch` | `dispatch` | `generateDispatchManifest()` |
| `gate` | `gate-enforcement` | `evaluateGate()` |
| `check` | `gate-enforcement` | `evaluateGate()` |
| `machine` | `automator` | `status()`, `intervene()` |

## Skill → CLI Command Mapping

| Entry Skill | CLI Commands Orchestrated |
|-------------|--------------------------|
| `spec-graph-init` | `init`, `config`, `compose`, `status` |
| `spec-graph-plan` | `plan`, `intervene` |
| `spec-graph-auto` | `dispatch`, `submit`, `diagnose`, `intervene` |
| `spec-graph-status` | `status` |
| `spec-graph-validate` | `validate`, `gate` |
| `spec-graph-diagnose` | `diagnose`, `submit`, `intervene` |
| `spec-graph-intervene` | `intervene`, `machine`, `status` |
| `spec-graph-task` | `task list`, `task start`, `task review`, `task complete` |
| `spec-graph-run` | `run`, `task list`, `task start`, `dispatch` |

## Task Lifecycle Integration

The task management system integrates across all three layers:

```
Core:
  automator.startTask()     → taskStatus[id] = 'running'
  automator.reviewTask()    → taskStatus[id] = 'reviewing', taskReviews created
  automator.completeTask()  → taskStatus[id] = 'completed' (requires review pass)
  automator.getLatestRunningSession() → auto-select from CSV
  session-index.list()      → returns all sessions with task columns

CLI:
  spec-graph task start <id>    → wrappers over automator functions
  spec-graph task review <id>   → runs quality checks before completion
  spec-graph task complete <id> → requires review pass, returns next task
  spec-graph run                → auto-selects session, shows resume/next task
  spec-graph run --auto-next    → auto-starts next runnable task

Dispatch:
  implement stage actions include:
    pre_step:      spec-graph task start <task-id>
    post_step:     spec-graph task review <task-id>
    complete_step: spec-graph task complete <task-id>
```

## Session State Files

```
.spec-graph/sessions/<session-id>/
├── state.yaml               # FSM state + taskStatus + taskReviews
│   sessionId: fs-20260705-001
│   stage: implement
│   state: running
│   taskStatus:
│     user-model: completed
│     auth-endpoints: reviewing
│   taskReviews:
│     user-model:
│       passed: true
│       checks: ["✓ output", "⚠ tests manual"]
│       timestamp: "2026-07-05T10:00:00Z"
│   ...
├── tasks/tasks.md           # Updated on task transitions
│   - [x] 1.1 user-model
│   - [◎] 1.2 auth-endpoints
│   - [ ] 1.3 api-docs
└── implement/<task-id>.md   # Per-task output files
```

## Rules for Adding New Capabilities

1. **New core capability?** Add a module in `packages/core/src/<name>/`
2. **Need it accessible from CLI?** Add a thin wrapper in `packages/cli/src/commands/<name>.ts`
3. **Need an agent to orchestrate it?** Create a SKILL.md in `packages/skills/spec-graph-<name>/`
4. **Just documenting a CLI design?** Write a plain markdown file in `docs/cli-commands/`

Never:
- Put SKILL.md files in `packages/core/`
- Make core modules depend on CLI concepts (parameter names, output format)
- Create a separate skill for every CLI command
