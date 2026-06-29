# spec-graph

**Domain-neutral spec-driven workflow orchestration kernel**

[![npm version](https://img.shields.io/npm/v/spec-graph.svg)](https://www.npmjs.com/package/spec-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

spec-graph automatically analyzes your project structure and composes customized governance workflows. It provides 38 CLI commands, 17 packs, and an 8-stage FSM with quality gates to ensure specification-driven development.

## Features

- **6 Primitives**: Work-unit, Artifact, Contract, Check, Gate, Trace-edge
- **8-Stage FSM**: specify → design → plan → implement → review → test → accept → integrate
- **38 CLI Commands**: Full lifecycle management from init to archive
- **17 Packs**: Domain packs (API, frontend, backend, embedded, DDD) + intent packs (feature, bugfix, refactor)
- **22-Dimension Sense**: Automatic project analysis (40+ signals)
- **Quality Gates**: 7 gates + 23 checks with automatic enforcement
- **Traceability**: Bidirectional requirement tracking with impact analysis
- **Brownfield Support**: Deep integration with existing projects
- **AI Agent Ready**: Dispatch manifests for Claude Code, Codex, and other AI agents
- **Multi-Agent Collaboration**: Meeting protocols, expert invites, status reports

## Installation

```bash
# Global install (recommended)
npm install -g spec-graph

# Or use npx (no install needed)
npx spec-graph --version

# Or add to your project
npm install --save-dev spec-graph
```

## Quick Start

```bash
# Initialize a new project (one-command bootstrap)
spec-graph init --quick

# Or step by step
spec-graph init --description "My awesome project"
spec-graph compose
spec-graph prime --bootstrap

# Check project health
spec-graph doctor

# View workflow status
spec-graph status

# See what to do next
spec-graph next

# Generate dispatch manifest for AI agents
spec-graph dispatch --json

# Auto-run checks and transitions
spec-graph run

# View dashboard
spec-graph dashboard

# Generate visualization
spec-graph visualize --format mermaid
```

## Core Concepts

### Two-Axis Composition

spec-graph composes workflows using two types of packs:

1. **Domain Packs** - What you're building (API, frontend, backend, embedded, DDD, etc.)
2. **Intent Packs** - How you're modifying it (feature, bugfix, refactor, migration, etc.)

The system automatically matches packs based on your project profile and change type, then merges their artifacts, checks, gates, and tracks into a unified workflow graph.

### 8-Stage FSM

```
specify → design → plan → implement → review → test → accept → integrate
   ↑                                                          ↓
   └──────────────────── feedback loop ────────────────────────┘
```

Each transition is guarded by quality gates that check:
- Required artifacts are completed
- Required checks pass
- Required traces are verified
- No forbidden invariants are violated

### Dispatch Manifest

The dispatch manifest is a structured JSON/YAML that tells AI agents what to do next:

```json
{
  "done": false,
  "gate_passed": true,
  "current_stage": "implement",
  "next_stage": "review",
  "actions": [
    {
      "id": "produce-impl-code",
      "agent_id": "developer-agent",
      "template_ref": "packs/foundation.pack/templates/implementation.md",
      "suggested_doc_path": ".spec-graph/artifacts/implementation/code.md",
      "document_guidance": "...",
      "distilled_context": {
        "relevant_artifacts": [...],
        "total": 5
      }
    }
  ],
  "constitution_principles": [...],
  "active_change": {...},
  "codebase_summary": "..."
}
```

## Commands Overview

### Workflow Commands

| Command | Description |
|---------|-------------|
| `spec-graph init` | Initialize project (creates .spec-graph/, runs sense, compose, prime) |
| `spec-graph sense` | Analyze project structure (22 dimensions, 40+ signals) |
| `spec-graph compose` | Generate workflow graph from profile + packs |
| `spec-graph prime` | Initialize machine state with graph declarations |
| `spec-graph status` | Show unified workflow dashboard |
| `spec-graph next` | Show next required step |
| `spec-graph dispatch` | Generate agent dispatch manifest |
| `spec-graph run` | Auto-execute checks and transitions |
| `spec-graph dashboard` | Rich terminal/HTML/JSON dashboard |

### Quality Commands

| Command | Description |
|---------|-------------|
| `spec-graph gate` | Evaluate quality gates |
| `spec-graph check` | Run validation checks |
| `spec-graph checklist` | Run 5 mechanical + 5 soft checks |
| `spec-graph constitution` | Manage governance constitution |
| `spec-graph doctor` | Diagnose project health |
| `spec-graph analyze` | Cross-document analysis |

### Traceability Commands

| Command | Description |
|---------|-------------|
| `spec-graph trace` | Trace requirements ↔ implementation |
| `spec-graph impact` | Analyze change impact (ripple tracking) |
| `spec-graph trace add` | Add trace edges |

### Change Management

| Command | Description |
|---------|-------------|
| `spec-graph change create` | Create change descriptor + plan MD |
| `spec-graph change apply` | Begin change execution |
| `spec-graph change complete` | Mark change complete |
| `spec-graph change archive` | Archive change + plan MD |
| `spec-graph retro` | Generate retrospective |
| `spec-graph rollback` | Safe rollback to pre-change state |
| `spec-graph review` | Multi-model review prompts (Claude/Codex/Gemini) |

### Safety & Collaboration

| Command | Description |
|---------|-------------|
| `spec-graph safety-net` | Snapshot baseline for rollback |
| `spec-graph migrate` | Brownfield project migration |
| `spec-graph scope` | Scope overlap detection |
| `spec-graph meeting` | Multi-agent meeting protocol |
| `spec-graph worktree` | Git worktree management |
| `spec-graph merge-queue` | Atomic merge queue |

### Configuration

| Command | Description |
|---------|-------------|
| `spec-graph config` | Manage configuration |
| `spec-graph permissions` | Manage agent permissions |
| `spec-graph profile` | View/edit project profile |
| `spec-graph hooks` | Manage pre/post command hooks |

### Visualization

| Command | Description |
|---------|-------------|
| `spec-graph visualize` | Generate DOT/Mermaid/JSON visualization |
| `spec-graph distill` | Compress artifacts for context injection |

## Usage Examples

### Initialize a New Project

```bash
# Quick bootstrap (recommended)
spec-graph init --quick

# Or step by step with options
spec-graph init \
  --description "E-commerce API" \
  --permission-level full-auto \
  --git-hooks
```

### Create and Execute a Change

```bash
# Create a new feature change
spec-graph change create \
  --title "Add user authentication" \
  --type feature \
  --priority high

# Apply the change
spec-graph change apply <change-id>

# AI agent fills in the plan MD
# ... agent work ...

# Complete and archive
spec-graph change complete <change-id>
spec-graph change archive <change-id>

# Generate retrospective
spec-graph retro <change-id>
```

### Generate Dispatch for AI Agents

```bash
# Generate dispatch manifest
spec-graph dispatch --json > manifest.json

# AI agent reads manifest and executes
# ... agent work ...

# Re-dispatch to continue
spec-graph dispatch --json
```

### Visualize Workflow

```bash
# Generate Mermaid diagram (paste into GitHub/GitLab)
spec-graph visualize --format mermaid

# Generate Graphviz DOT
spec-graph visualize --format dot --output graph.dot
dot -Tpng graph.dot -o workflow.png

# Generate HTML dashboard
spec-graph dashboard --html --output dashboard.html
```

### Multi-Model Review

```bash
# Generate review prompts for Claude + Codex
spec-graph review --artifact plan/tasks --save

# Focus on specific areas
spec-graph review --artifact design/arch \
  --models "claude,codex,gemini" \
  --focus "security,performance"
```

## Project Structure

After running `spec-graph init`, your project will have:

```
your-project/
├── .spec-graph/
│   ├── profile.yaml           # 22-dimension project profile
│   ├── graph.yaml             # Composed workflow graph
│   ├── machine-state.yaml     # FSM state (current stage, artifacts, checks)
│   ├── constitution.yaml      # Governance rules
│   ├── permissions.yaml       # Agent permissions
│   ├── config.yaml            # Runtime configuration
│   ├── hooks.yaml             # Pre/post command hooks
│   ├── pack-overrides.yaml    # Pack customization
│   ├── changes/               # Active change descriptors
│   │   └── <title>-<timestamp>.json
│   │   └── <title>-<timestamp>-plan.md
│   ├── artifacts/             # Generated documents
│   │   ├── requirements/
│   │   ├── design/
│   │   ├── plan/
│   │   ├── contract/
│   │   ├── verification/
│   │   └── implementation/
│   ├── traces/                # Traceability edges
│   ├── retros/                # Retrospectives
│   ├── distilled/             # Compressed artifacts
│   ├── reviews/               # Multi-model review prompts
│   └── archived/              # Historical changes
├── .claude/
│   └── settings.json          # Claude Code permissions
└── .opencode.json             # OpenCode/Codex permissions
```

## Configuration

### Permission Levels

| Level | Auto-Execute | Use Case |
|-------|--------------|----------|
| `full-auto` | Everything | Solo development, trusted environment |
| `semi-auto` | Checks + transitions | Team development (default) |
| `manual` | Nothing | Strict control, learning mode |

```bash
# Set permission level
spec-graph permissions set --level full-auto

# Sync agent configs
spec-graph permissions sync --force
```

### Hooks

Configure pre/post command hooks in `.spec-graph/hooks.yaml`:

```yaml
version: "1"
hooks:
  - command: echo "✓ Dispatch completed"
    when: post
    command_name: dispatch
  
  - command: npm run lint
    when: pre
    command_name: check
```

## AI Agent Integration

spec-graph is designed to work with AI agents (Claude Code, Codex, etc.):

1. **Dispatch Manifest**: Tells agents what to do next
2. **Status Report Protocol**: Agents report back (DONE / BLOCKED / NEEDS_CONTEXT)
3. **Auto-Loop Protocol**: Continuous dispatch → execute → re-dispatch cycle
4. **Meeting Protocol**: Multi-agent collaboration
5. **Constitution Injection**: Governance rules in every dispatch

See [CLAUDE.md](./CLAUDE.md) for the full agent protocol.

## Comparison with Other Tools

| Feature | spec-graph | wdf | BMAD | spec-kit |
|---------|-----------|-----|------|----------|
| Domain-neutral | ✅ | ❌ (Web-only) | ❌ | ⚠️ |
| FSM stages | 8 | 4 | ⚠️ | 4 |
| Quality gates | 7 | 4 | ⚠️ | ⚠️ |
| CLI commands | 38 | 25 | 48 skills | 15 |
| Brownfield support | ✅ (22D) | ⚠️ | ❌ | ❌ |
| Traceability | ✅ | ✅ | ❌ | ⚠️ |
| Multi-agent | ✅ | ❌ | ✅ | ❌ |
| Constitution | ✅ | ✅ | ❌ | ✅ |

**Score: 88/90** (16/18 dimensions at ⭐⭐⭐⭐⭐)

See [comparison-scoring.md](./.spec-graph/artifacts/meta/comparison-scoring.md) for details.

## Development

```bash
# Clone and install
git clone https://github.com/spec-graph/core.git
cd core
npm install

# Build
npm run build

# Run tests (576 tests)
npm test

# Development mode
npm run dev -- status

# Lint
npm run lint:fix
```

## Requirements

- Node.js >= 18.0.0
- Git (for version control features)
- Optional: Graphviz (for DOT visualization)

## License

MIT

## Links

- **GitHub**: https://github.com/spec-graph/core
- **Issues**: https://github.com/spec-graph/core/issues
- **npm**: https://www.npmjs.com/package/spec-graph

## Contributing

Contributions welcome! Please read [CLAUDE.md](./CLAUDE.md) for development guidelines.
