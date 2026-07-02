# spec-graph

**Declaration engine — dispatch manifest generator + gate evaluator**

[![npm version](https://img.shields.io/npm/v/spec-graph.svg)](https://www.npmjs.com/package/spec-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

spec-graph is a development "brain, not hands." It manages an 8-stage FSM, generates dispatch manifests with 9-section envelopes for sub-agents, and evaluates their outputs through strict quality gates. spec-graph never invokes agents directly — all execution is delegated to external coordinators (Claude Code hooks, CI/CD, custom orchestrators).

## Philosophy

```
┌──────────────────────────────────────────────────────────────┐
│  spec-graph is a brain, not hands                             │
│                                                               │
│  ✓ Generates dispatch manifests (9-section envelopes)         │
│  ✓ Evaluates outputs through strict quality gates             │
│  ✓ Tracks state via 8-stage FSM                              │
│  ✗ Never invokes agents directly                              │
│  ✗ Never spawns child processes                               │
│  ✗ Never writes code or documents                             │
│                                                               │
│  All agent invocation is delegated to external coordinators   │
│  via the dispatch + hook protocol.                            │
└──────────────────────────────────────────────────────────────┘
```

## Features

- **8-Stage FSM**: specify → design → tasks → implement → review → test → accept → integrate
- **Strict Quality Gates**: Entry/exit criteria evaluated automatically at every transition
- **Dispatch Manifests**: JSON output with 9-section envelopes for sub-agents
- **Parallel Execution**: Multiple sub-agents per stage via parallel_group
- **Hook Integration**: dispatch-watcher.mjs PostToolUse hook auto-injects system-reminder
- **Methodology Library**: Built-in knowledge-base with 8 stages × multiple skills
- **Progressive Recovery**: 4-level retry strategy with diagnosis-driven re-prompts
- **Session Persistence**: File-based state in `.spec-graph/sessions/<id>/state.yaml`
- **Real Gate Checks**: Implement gate runs tsc, tests, lint if configured

## Installation

```bash
# Global install
npm install -g spec-graph@3

# From this monorepo (local development)
npm install
npm run build
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
  → dispatch-watcher hook auto-triggers
  → main agent dispatches sub-agents via Agent tool
spec-graph advance --session <id> --result '<json>'
  → gate evaluation
  → state progression
  → repeat until state = "completed"
```

Or use the `/spec-graph-dispatch` SKILL for the full loop automation.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: Skills (SKILL.md files for AI agents)              │
│   packages/skills/  (7 entry skills)                         │
│   └─ init / plan / dispatch / status / validate / diagnose   │
│      / intervene                                             │
│                                                              │
│  Layer 2: CLI (command-line tool, shell commands)            │
│   packages/cli/  (20 commands)                               │
│   └─ plan, status, advance, validate, intervene,             │
│      diagnose, sessions, init, compose, config, install,     │
│      dispatch, gate, check, machine, analyze, completion,    │
│      artifact-complete, check-run                            │
│                                                              │
│  Layer 3: Core (TypeScript library — the engine)             │
│   packages/core/  (9 modules)                                │
│   └─ automator / planning / gate-enforcement /               │
│      knowledge-base / recovery / sense /                     │
│      dispatch / composer / machine-state                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **Skills** orchestrate CLI commands for AI agents — 1 skill covers N CLI commands
- **CLI** provides atomic shell commands — each is a thin wrapper over core API
- **Core** provides the programmatic API — the declaration engine

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full module mapping.

### Core Modules

| Module | Responsibility |
|--------|----------------|
| **automator** | Session lifecycle, state machine loop |
| **planning** | Intent → capabilities decomposition with topological ordering |
| **gate-enforcement** | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| **dispatch** | Generate dispatch manifests with 9-section envelopes |
| **composer** | Scan packs and compose graph.yaml |
| **machine-state** | Track artifact status per stage and capability |
| **knowledge-base** | Directory tree loader, skill selection, local overrides |
| **recovery** | 4-level progressive retry strategy with Jaccard similarity |
| **sense** | Project feature detection (language, framework, runtime) |

### Knowledge Base

The knowledge-base is a directory tree shipped with spec-graph:

```
knowledge/
├── stages/
│   ├── specify/
│   │   ├── gate.yaml                # Entry/exit criteria
│   │   └── skills/
│   │       └── requirement-analysis/
│   │           ├── instruction.md   # Methodology guidance
│   │           └── templates/
│   │               └── proposal.md
│   ├── design/
│   │   ├── gate.yaml
│   │   └── skills/
│   │       ├── specs-authoring/     # OpenSpec-style specs
│   │       └── design-authoring/    # OpenSpec-style design
│   ├── tasks/
│   ├── implement/
│   ├── review/
│   ├── test/
│   ├── accept/
│   └── integrate/
└── shared/
    ├── prompt-schema.md             # XML prompt format specification
    ├── project-context.md           # Project profile template
    └── verification-format.md       # Agent response format
```

Users can override or extend by placing files in `.spec-graph/knowledge/` within their project.

## CLI Commands

| Command | Description |
|---------|-------------|
| `plan <intent> [--confirm]` | Create a session + plan. Use `--confirm` to auto-confirm. |
| `auto <intent>` | Start + confirm + run the full automatic workflow loop. |
| `status [--json]` | Show current session state (stage, progress, blockers, diagnosis). |
| `next-prompt` | Get the next XML prompt for the external agent. |
| `advance --result <json>` | Submit agent result; evaluate gate; advance state if passed. |
| `validate` | Validate current state. |
| `intervene <action>` | Manual intervention: `force-advance`, `rollback`, `resume`, `modify-plan`. |
| `diagnose [--json]` | Show the most recent gate failure diagnosis. |

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
- `/spec-graph-auto "<intent>"` — start automatic workflow
- `/spec-graph-status` — check progress
- `/spec-graph-intervene <action>` — manual intervention

### Via CLI (any agent)

Any agent that can execute shell commands can drive spec-graph:

```bash
spec-graph plan "..." --confirm --json
spec-graph next-prompt                    # returns XML prompt
# ... agent does the work ...
spec-graph advance --result '{"artifacts": [...]}'
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

Contributions welcome. Please read the architecture in `openspec/changes/spec-graph-v2/` for the full design rationale.
