# spec-graph

**Declaration engine — dispatch manifest generator + gate evaluator**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

spec-graph is a development "brain, not hands." It manages a 9-stage FSM, generates lightweight routing manifests (path-based dispatch pointers) for sub-agents, and evaluates their outputs through strict quality gates. spec-graph never invokes agents directly — all execution is delegated to external coordinators (Claude Code skills, CI/CD, custom orchestrators).

## Philosophy

```
┌──────────────────────────────────────────────────────────────┐
│  spec-graph is a brain, not hands                             │
│                                                               │
│  ✓ Generates routing manifests (path-based dispatch)            │
│  ✓ Evaluates outputs through strict quality gates             │
│  ✓ Tracks state via 9-stage FSM                              │
│  ✓ Manages per-task review gates                             │
│  ✗ Never invokes agents directly                              │
│  ✗ Never spawns child processes                               │
│  ✗ Never writes code or documents                             │
│                                                               │
│  All agent invocation is delegated to external coordinators   │
│  via the dispatch + hook protocol.                            │
└──────────────────────────────────────────────────────────────┘
```

## Features

- **9-Stage FSM**: specify → specs → design → tasks → implement → review → test → accept → integrate
- **Strict Quality Gates**: Entry/exit criteria evaluated automatically at every transition
- **Task-level Review Gates**: Each task in the implement stage goes through `running → reviewing → completed`. Tasks cannot be marked complete without passing review.
- **Session CSV Index**: Global `.spec-graph/sessions/sessions.csv` tracks all sessions with task progress columns (`completed_tasks`, `running_tasks`, `reviewing_tasks`, `runnable_tasks`, `pending_tasks`).
- **Structured Session IDs**: `<task-abbrev>-<YYYYMMDD>-<NNN>` format (e.g. `fs-20260705-001`) — short, chronologically sortable, filesystem-friendly.
- **Dispatch Manifests**: Lightweight JSON routing manifests with absolute paths (agent, skills, upstream, output, checks). Implement-stage actions include `pre_step`/`post_step`/`complete_step` for task lifecycle automation.
- **Parallel Execution**: Multiple sub-agents per stage via parallel_group (implement stage only), with task-level tracking.
- **Hook Integration**: `spec-graph hook dispatch` PostToolUse hook auto-injects system-reminder with task lifecycle steps.
- **Pack Library**: Built-in packs (`packs/`) with stage gate configs, skills, and agent prompts. Composable via priority and gate_patches.
- **Progressive Recovery**: 4-level retry strategy with diagnosis-driven re-prompts
- **Session Persistence**: File-based state in `.spec-graph/sessions/<id>/state.yaml` + global CSV index. Three files auto-synced on every task transition: `tasks.md`, `state.yaml`, `sessions.csv`.
- **Real Gate Checks**: Implement gate runs tsc, tests, lint if configured

## Installation

```bash
# Clone with all submodules
git clone --recurse-submodules git@github.com:spec-graph/monorepo.git
cd monorepo

# Global install (CLI)
npm install -g spec-graph
```

## Quick Start

```bash
# 1. Initialize project
spec-graph init
  → creates .spec-graph/ + sessions.csv + registers hook

# 2. Plan the work
spec-graph plan "Build JWT authentication" --confirm
  → LLM decomposes intent into capabilities
  → session ID: jwt-auth-20260705-001
  → state = "running"

# 3. Compose graph from packs
spec-graph compose
  → produces graph.yaml

# 4. Run/continue session (auto-selects latest running)
spec-graph run
  → shows current state, next task, and blockers

# 5. Dispatch loop
spec-graph dispatch --session <id> --json
  → produces DispatchManifest with task lifecycle steps
  → hook auto-triggers
  → pre_step: spec-graph task start <task-id>
  → main agent dispatches sub-agent
  → post_step: spec-graph task review <task-id>
  → complete_step: spec-graph task complete <task-id>
  → repeat until done

# 6. Check session status
spec-graph sessions list
spec-graph sessions info --session <id>
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  spec-graph/monorepo  (meta-repo with git submodules)        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Skills (9 SKILL.md files)                            │    │
│  │  packages/skills/ — spec-graph/skills.git             │    │
│  │  init / plan / auto / dispatch / status / validate    │    │
│  │  / diagnose / intervene / task / run                 │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  CLI (25+ commands)                                   │    │
│  │  packages/cli/ — spec-graph/cli.git                   │    │
│  │  plan / dispatch / submit / status / validate         │    │
│  │  / task / run / sessions / intervene / diagnose       │    │
│  │  / init / compose / gate / check / ...                │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Core (12 modules)                                    │    │
│  │  packages/core/ — spec-graph/core.git                 │    │
│  │  automator / planning / gate-enforcement              │    │
│  │  dispatch / sessionIndex / composer / ...             │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Clone: git clone --recurse-submodules <url>                 │
└──────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|----------------|
| **automator** | Session lifecycle, 9-stage FSM, task tracking (start/review/complete), auto-select |
| **planning** | Intent → capabilities decomposition (LLM manifest + keyword fallback) |
| **gate-enforcement** | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| **dispatch** | Generate routing manifests with task lifecycle steps (`pre_step`/`post_step`/`complete_step`) |
| **sessionIndex** | Global session CSV index: read/write, ID allocation, legacy migration, reconcile |
| **composer** | Scan packs and compose graph.yaml (stages, gates, skills, agents) |
| **machine-state** | Track artifact status per stage and capability |
| **recovery** | 4-level progressive retry strategy with Jaccard similarity |
| **sense** | Project feature detection (language, framework, runtime) |
| **meeting** | MeetingManager lifecycle (create/record/advance/complete) |
| **isolation** | WorktreeManager + ScopeLock + MergeQueue |

### Packs

Packs are composable configuration units shipped in `packs/`:

```
packs/
├── foundation.pack/               # Always loaded — core stages + agents
│   ├── pack.yaml                  # Provides: artifacts, checks, gates, agents, bindings
│   ├── agents/                    # Agent prompt files (pm-agent.md, developer-agent.md, ...)
│   │   └── coordinator-protocol.md  # Session discovery + task lifecycle protocol
│   ├── shared/                    # Shared documents (prompt-schema.md, verification-format.md)
│   └── stages/                    # Per-stage gate.yaml + skills/
│       ├── specify/gate.yaml
│       ├── design/gate.yaml
│       ├── implement/gate.yaml
│       └── ... (9 stages)
├── requirement-analysis.pack/     # Loaded when planning stage needs requirement analysis
├── architecture.pack/             # Loaded for architecture design
├── ddd.pack/                      # Loaded when profile matches DDD conditions
└── ... (17 packs total)
```

## CLI Commands

### Workflow Commands

| Command | Description |
|---------|-------------|
| `plan <intent> [--confirm] [--abbrev <short>]` | Create a session + plan. `--abbrev` sets the task abbreviation for the session ID. |
| `dispatch --session <id> --json` | Generate dispatch manifest with task lifecycle steps. |
| `submit --result <json>` | Submit agent result for gate evaluation. |
| `status [--json]` | Show current session state (stage, progress, blockers, diagnosis). |
| `validate` | Validate current state against stage gates. |
| `intervene <action>` | Manual intervention: `force-advance`, `rollback`, `resume`, `modify-plan`. |
| `diagnose [--json]` | Show the most recent gate failure diagnosis. |

### Task Management Commands

| Command | Description |
|---------|-------------|
| `task list [--session <id>]` | List all tasks with status (completed ✓ / running ▶ / reviewing ◎ / runnable → / pending ○). |
| `task start <task-id> [--session <id>]` | Mark a task as running. Updates tasks.md, state.yaml, sessions.csv. |
| `task review <task-id> [--session <id>]` | Review a task (quality checks). Required before completion. |
| `task complete <task-id> [--session <id>]` | Mark a task as completed. Requires review to pass first. |

### Session Management Commands

| Command | Description |
|---------|-------------|
| `run [--session <id>] [--auto-next]` | Auto-select latest running session, show resume info. `--auto-next` starts the next task. |
| `sessions list` | List all sessions from the CSV index with task progress. |
| `sessions info --session <id>` | Show detailed session info from CSV + state.yaml. |
| `sessions delete --session <id>` | Delete session directory and CSV row atomically. |
| `sessions migrate` | Migrate legacy long-named session directories to structured IDs. |
| `sessions doctor [--fix]` | Verify CSV-directory consistency, repair orphans. |

### Setup Commands

| Command | Description |
|---------|-------------|
| `init [--force] [--skip-hook]` | Initialize .spec-graph/ with config.yaml + empty sessions.csv. |
| `compose` | Compose graph.yaml from installed packs. |
| `install` | Install spec-graph skills to .claude/skills/. |

## Task Lifecycle

```
                    ┌──────────────────┐
                    │     pending      │  Task exists in plan.order
                    └────────┬─────────┘
                             │ task start <id>
                    ┌────────▼─────────┐
                    │     running      │  Sub-agent is executing
                    └────────┬─────────┘
                             │ task review <id>
                    ┌────────▼─────────┐
                    │    reviewing     │  Quality checks running
                    └────┬────────┬────┘
                   pass  │        │ fail → fix → re-review
                    ┌────▼────┐   │
                    │completed│◄──┘
                    └─────────┘
                 task complete <id>
                 (only if review passed)
```

Each state transition auto-updates three files:
1. **tasks.md** — checkbox markers (`[ ]` → `[>]` → `[◎]` → `[x]`)
2. **state.yaml** — `taskStatus` field per task
3. **sessions.csv** — task-list columns (`completed_tasks`, `running_tasks`, `reviewing_tasks`, `runnable_tasks`, `pending_tasks`)

## Dispatch Flow with Task Lifecycle

When the coordinator runs `spec-graph dispatch --json` in the **implement** stage, each action includes:

```json
{
  "id": "user-model",
  "pre_step": "spec-graph task start user-model --session <id>",
  "post_step": "spec-graph task review user-model --session <id>",
  "complete_step": "spec-graph task complete user-model --session <id>"
}
```

The coordinator workflow:
1. Run `pre_step` → task status = `running`
2. Dispatch sub-agent via Agent tool
3. Sub-agent produces output → status-report
4. Run `post_step` → task status = `reviewing`
5. If review passes → run `complete_step` → task status = `completed`
6. Loop back to dispatch for next task/wave

## State Persistence

```
.spec-graph/
├── config.yaml                      # Project configuration
├── graph.yaml                       # Composed workflow graph
└── sessions/
    ├── sessions.csv                 # Global session index (11 columns)
    │   id, state, description, created_at, updated_at, stage,
    │   completed_tasks, pending_tasks, running_tasks,
    │   reviewing_tasks, runnable_tasks
    ├── .migration.log               # Legacy → structured ID mappings
    ├── .sessions.csv.lock           # Write lock for concurrent access
    └── <session-id>/                # e.g., fs-20260705-001/
        ├── state.yaml               # FSM state + taskStatus + taskReviews
        ├── specify/proposal.md
        ├── specs/specs.md
        ├── design/design.md
        ├── tasks/tasks.md           # Updated on task transitions
        ├── implement/<task-id>.md   # Per-task output files
        └── ...
```

### Session ID Format

```
<task-abbrev>-<YYYYMMDD>-<NNN>

Examples:
  fs-20260705-001       → Flash sale system, July 5, first session
  auth-20260706-002     → Authentication, July 6, second session
  migration-20260705-001 → Migration project, July 5, first session

- task-abbrev: 1-3 English words, kebab-case, max 24 chars
- YYYYMMDD: creation date (local timezone)
- NNN: 3-digit per-day sequence counter
```

## AI Agent Integration

### Via Skills (Claude Code)

```bash
spec-graph install  # copies skills to .claude/skills/
```

Then in Claude Code:
- `/spec-graph-plan "<intent>"` — start a planning session
- `/spec-graph-auto "<intent>"` — start automatic workflow
- `/spec-graph-task` — manage tasks (start/review/complete/list)
- `/spec-graph-run` — auto-select and continue sessions
- `/spec-graph-status` — check progress
- `/spec-graph-intervene <action>` — manual intervention

### Via CLI (any agent)

```bash
# Start
spec-graph plan "..." --confirm

# Continue (auto-select latest running)
spec-graph run

# Task execution
spec-graph task start user-model
# ... dispatch sub-agent, produce artifact ...
spec-graph task review user-model
spec-graph task complete user-model

# Or via dispatch (auto-injects task lifecycle)
spec-graph dispatch --session <id> --json
# pre_step → dispatch → post_step → complete_step → loop
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Link CLI globally for local dev
npm run link:cli
```

## License

MIT

## Contributing

Contributions welcome. See [docs/](docs/) for architecture, migration guides, and integration documentation.
