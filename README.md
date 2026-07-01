# spec-graph

**Strict-gate, prompt-driven, automatic progression development brain**

[![npm version](https://img.shields.io/npm/v/spec-graph.svg)](https://www.npmjs.com/package/spec-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

spec-graph is a development "brain, not hands." It generates rich layered XML prompts for external AI agents (Claude Code, Codex, Gemini CLI), evaluates their outputs through strict quality gates, and automatically advances through the 8-stage workflow — from intent to integrated PR.

## Philosophy

```
┌──────────────────────────────────────────────────────────────┐
│  spec-graph is a brain, not hands                             │
│                                                               │
│  ✓ Generates rich, layered prompts (MUST / SHOULD / MAY)      │
│  ✓ Evaluates outputs through strict quality gates             │
│  ✓ Advances state automatically when gates pass               │
│  ✗ Never writes code or documents directly                    │
│  ✗ Never runs tests or CI directly                            │
│                                                               │
│  All execution is delegated to external AI agents             │
│  via pluggable adapters.                                      │
└──────────────────────────────────────────────────────────────┘
```

## Features

- **8-Stage FSM**: specify → design → plan → implement → review → test → accept → integrate
- **Strict Quality Gates**: Entry/exit criteria evaluated automatically at every transition
- **Automatic Progression**: `spec-graph auto` runs the full loop without manual intervention
- **Rich Layered Prompts**: XML-style prompts with MUST/SHOULD/MAY priority levels
- **Methodology Library**: Built-in knowledge-base with 8 stages × multiple skills (OpenSpec + BMAD style)
- **Pluggable Agents**: Claude Code adapter (shipped), Codex adapter (stub), custom adapters welcome
- **Progressive Recovery**: 4-level retry strategy (lightweight fix → swap methodology → decompose → escalate to user)
- **Similarity Detection**: Avoids wasting retries on the same failing approach
- **Session Persistence**: File-based state in `.spec-graph/sessions/<id>/state.yaml`

## Installation

```bash
# From this monorepo (local development)
npm install
npm run build

# CLI available as:
npx tsx packages/cli/src/index.ts --help
```

## Quick Start

```bash
# Start a new workflow (plan → confirm → automatic progression)
npx tsx packages/cli/src/index.ts plan "Add JWT authentication" --confirm

# Get the next prompt for the external agent
npx tsx packages/cli/src/index.ts next-prompt

# Submit the agent's result and advance (if gate passes)
npx tsx packages/cli/src/index.ts advance --result '{"artifacts": [...]}'

# Check current state
npx tsx packages/cli/src/index.ts status

# Full automatic mode (delegates to Claude Code)
npx tsx packages/cli/src/index.ts auto "Add JWT authentication" --adapter claude-code
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer A: Skills (SKILL.md files for AI agents)              │
│   packages/skills/                                           │
│   └─ spec-graph-plan / auto / status / intervene             │
│                                                              │
│  Layer B: CLI (command-line tool, human + agent-orchestrated)│
│   packages/cli/                                              │
│   └─ 8 commands: plan, auto, status, next-prompt,            │
│                 advance, validate, intervene, diagnose        │
│                                                              │
│  Layer C: core (TypeScript library — the brain)              │
│   packages/core/                                             │
│   └─ automator / prompt-construction / planning /            │
│      gate-enforcement / external-coordination /              │
│      knowledge-base / recovery                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|----------------|
| **automator** | Session lifecycle, state machine loop, `autoRun` |
| **prompt-construction** | Build layered XML prompts with methodology weaving |
| **planning** | Intent → capabilities decomposition with topological ordering |
| **gate-enforcement** | Load gate.yaml, evaluate entry/exit criteria, produce diagnosis |
| **external-coordination** | Adapter registry + Claude Code / Codex adapters |
| **knowledge-base** | Directory tree loader, skill selection, local overrides |
| **recovery** | 4-level progressive retry strategy with Jaccard similarity |

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
│   ├── plan/
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
