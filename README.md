# spec-graph

**Declaration engine — dispatch manifest generator + gate evaluator**

[![npm version](https://img.shields.io/npm/v/spec-graph.svg)](https://www.npmjs.com/package/spec-graph)
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
- **Dispatch Manifests**: Lightweight JSON routing manifests with absolute paths (agent, skills, upstream, output, checks). Sub-agents read files from manifest paths at runtime.
- **Parallel Execution**: Multiple sub-agents per stage via parallel_group (implement stage only)
- **Hook Integration**: `spec-graph hook dispatch` PostToolUse hook auto-injects system-reminder
- **Pack Library**: Built-in packs (`packs/`) with stage gate configs, skills, and agent prompts. Composable via priority and gate_patches.
- **Progressive Recovery**: 4-level retry strategy with diagnosis-driven re-prompts
- **Session Persistence**: File-based state in `.spec-graph/sessions/<id>/state.yaml`
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
  → creates .spec-graph/ + registers dispatch-watcher hook

# 2. Plan the work
spec-graph plan "Build JWT authentication" --confirm
  → LLM decomposes intent into capabilities
  → state = "running"

# 3. Compose graph from packs
spec-graph compose
  → produces graph.yaml

# 4. Dispatch loop (repeat 8 times)
spec-graph dispatch --session <id> --json
  → produces DispatchManifest JSON
  → hook auto-triggers
  → main agent dispatches sub-agents via Agent tool
spec-graph submit --session <id> --result '<json>'
  → gate evaluation
  → state progression
  → repeat until state = "completed"
```

Or use the `/spec-graph-auto` SKILL for the full loop automation.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  spec-graph/monorepo  (meta-repo with git submodules)        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Skills (11 SKILL.md files)                           │    │
│  │  packages/skills/ — spec-graph/skills.git             │    │
│  │  init / plan / auto / dispatch / status / validate    │    │
│  │  / diagnose / intervene / meeting / worktree / e2e   │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  CLI (22 commands)                                    │    │
│  │  packages/cli/ — spec-graph/cli.git                   │    │
│  │  plan / dispatch / submit / status / validate         │    │
│  │  / intervene / diagnose / init / compose / ...        │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Core (12 modules)                                    │    │
│  │  packages/core/ — spec-graph/core.git                 │    │
│  │  automator / planning / gate-enforcement              │    │
│  │  dispatch / composer / ...                            │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Server + UI                                          │    │
│  │  packages/server/ + packages/ui/                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Clone: git clone --recurse-submodules <url>                 │
└──────────────────────────────────────────────────────────────┘
```

Each package is an independent git repository, linked via submodule.

- **Skills** orchestrate CLI commands for AI agents — 1 skill covers N CLI commands
- **CLI** provides atomic shell commands — thin wrappers over core API
- **Core** provides the programmatic API — the declaration engine

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full module mapping.

### Core Modules

| Module | Responsibility |
|--------|----------------|
| **automator** | Session lifecycle, 9-stage state machine loop |
| **planning** | Intent → capabilities decomposition (LLM manifest + keyword fallback) |
| **gate-enforcement** | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| **dispatch** | Generate lightweight routing manifests (path-based pointers) |
| **composer** | Scan packs and compose graph.yaml (stages, gates, skills, agents) |
| **machine-state** | Track artifact status per stage and capability |
| **recovery** | 4-level progressive Retry strategy with Jaccard similarity |
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

Compose merges packs by priority. Gates, checks, skills, and agent bindings are combined into `.spec-graph/graph.yaml`.
Users can extend by adding custom packs or overriding fields via `.spec-graph/pack-overrides.yaml`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `plan <intent> [--confirm] [--fallback]` | Create a session + plan. LLM mode by default, `--fallback` for offline keyword matching. |
| `dispatch --session <id> --json` | Generate dispatch manifest for external coordinator. |
| `submit --result <json>` | Submit agent result for gate evaluation. |
| `status [--json]` | Show current session state (stage, progress, blockers, diagnosis). |
| `validate` | Validate current state. |
| `intervene <action>` | Manual intervention: `force-advance`, `rollback`, `resume`, `modify-plan`. |
| `diagnose [--json]` | Show the most recent gate failure diagnosis. |

Auto-loop is driven by the `/spec-graph-auto` SKILL (external coordinator), not by the CLI. See [brain-not-hands principle](#philosophy).

## AI Agent Integration

spec-graph provides two ways for AI agents to consume it:

### Via Skills (Claude Code)

Install the SKILL.md files into Claude Code's skills directory:

```bash
# Copy skills
cp -r packages/skills/spec-graph-* ~/.claude/skills/
```

Then in Claude Code:
- `/spec-graph-plan "<intent>"` — start a planning session
- `/spec-graph-auto "<intent>"` — start automatic workflow (skill drives the loop)
- `/spec-graph-status` — check progress
- `/spec-graph-intervene <action>` — manual intervention

### Via CLI (any agent)

Any agent that can execute shell commands can drive spec-graph:

```bash
spec-graph plan "..." --fallback --confirm
spec-graph dispatch --session <id> --json
# ... coordinator dispatches sub-agent, produces artifact ...
spec-graph submit --session <id> --result '{"artifacts": [...]}'
# ... loop dispatch → submit until done ...
```

## State Persistence

All state is persisted in `.spec-graph/sessions/<session-id>/`:

```
.spec-graph/
└── sessions/
    └── add-jwt-authentication/
        ├── state.yaml           # Current stage, state, trace log
        ├── specify/
        │   └── proposal.md      # Artifact from specify stage
        ├── design/
        │   ├── specs.md         # specs from design stage
        │   └── design.md        # design from design stage
        └── ...
```

## Development

```bash
# Install dependencies
npm install

# Build core
npm run build --workspace=packages/core

# Run CLI
npx tsx packages/cli/src/index.ts --help

# Run tests (when available)
npm test
```

## License

MIT

## Contributing

Contributions welcome. Please read the architecture in `openspec/changes/v3-routing-dispatch/` for the current design rationale.
