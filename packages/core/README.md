# @spec-graph/core

**Domain-neutral spec-driven workflow orchestration kernel**

[![npm version](https://img.shields.io/npm/v/@spec-graph/core.svg)](https://www.npmjs.com/package/@spec-graph/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-576%20passing-green.svg)](https://github.com/spec-graph/core)

spec-graph is a specification-driven workflow orchestration system that automatically analyzes your project structure and composes customized governance workflows using a two-axis composition model.

## Core Concepts

### Two-Axis Composition

spec-graph uses two types of packs to compose workflows:

1. **Domain Packs** - What you're building (API design, frontend, backend, embedded systems, DDD, etc.)
2. **Change Intent Packs** - How you're modifying it (feature, bugfix, refactor, migration, etc.)

The system automatically matches the right packs based on your project profile and change type, then merges their artifacts, checks, gates, and tracks into a unified workflow graph.

### 6 Primitives

| Primitive | Description | Example |
|-----------|-------------|---------|
| **Work-unit** | Executable action unit | `produce_artifact`, `run_check` |
| **Artifact** | Produced document or output | `plan/story`, `design/arch` |
| **Contract** | Interface between producers/consumers | `contract/api` |
| **Check** | Validation command | `npm test`, `npm run lint` |
| **Gate** | Transition guard with requirements | `entry-implement`, `exit-merged` |
| **Trace-edge** | Requirement traceability link | `REQ-001 → spec/auth` |

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

### 22-Dimension Profile Inference

The Sense engine analyzes your repository and infers a profile across 22 dimensions:

| Dimension | Values | Purpose |
|-----------|--------|---------|
| `has_ui` | `none` / `cli` / `web` / `desktop` / `mobile` | UI framework detection |
| `boundary` | `internal` / `published-lib` / `public-api` / `platform` | API surface area |
| `topology` | `mono` / `micro` / `modular` / `hybrid` / `federated` | Deployment structure |
| `deployment` | `process` / `container` / `serverless` / `embedded` / `edge` | Runtime target |
| `consumers` | `self` / `internal` / `third-party` / `public` / `multi-tenant` | Who uses it |
| `field` | `greenfield` / `brownfield` | Existing codebase |
| `criticality` | `experimental` / `standard` / `business-critical` / `safety-critical` | Quality bar |
| `team` | `solo` / `small` / `medium` / `large` / `multi-team` | Collaboration scale |
| `persistence` | `none` / `cache` / `document` / `relational` / `multi-model` | Data layer |
| `language` | `typescript` / `javascript` / `python` / `go` / `rust` / etc. | Primary language |
| `framework` | `react` / `vue` / `express` / `django` / etc. | Framework detection |
| `package_manager` | `npm` / `yarn` / `pnpm` / `bun` | Package manager |
| `build_tool` | `vite` / `webpack` / `rollup` / `tsc` | Build tooling |
| `test_framework` | `vitest` / `jest` / `mocha` / `pytest` | Test framework |
| `ci_cd` | `github_actions` / `gitlab_ci` / `jenkins` / `none` | CI/CD platform |
| `container` | `docker` / `podman` / `none` | Container runtime |
| `database` | `postgresql` / `mysql` / `mongodb` / `none` | Database type |
| `orm` | `prisma` / `typeorm` / `sequelize` / `none` | ORM/ODM |
| `api_spec` | `openapi` / `graphql` / `grpc` / `none` | API specification |
| `monorepo` | `true` / `false` | Monorepo structure |
| `has_lint` | `eslint` / `prettier` / `biome` / `none` | Linting setup |
| `has_typecheck` | `typescript` / `flow` / `none` | Type checking |

Each dimension has a confidence level (`high` / `low`) and source (`repo` / `llm` / `user` / `override`).

## Installation

```bash
# Global install (recommended)
npm install -g @spec-graph/core

# npx (no install needed)
npx @spec-graph/core --version

# From git
npm install github:spec-graph/core

# Project dependency
npm install --save-dev @spec-graph/core
```

## Quick Start

```bash
# One-command bootstrap (recommended)
spec-graph init --description "My awesome project" --quick

# Or step by step
spec-graph init --description "My awesome project"
spec-graph compose
spec-graph prime --bootstrap

# See where you are
spec-graph status

# View the composed graph
spec-graph show

# Evaluate gates
spec-graph gate

# Ask what to do next
spec-graph next

# Generate dispatch manifest for AI agents
spec-graph dispatch --json

# Auto-run checks and transitions
spec-graph run
```

## Commands

### `spec-graph init`

Initialize a new spec-graph project in the current directory.

```bash
spec-graph init [options]

Options:
  -f, --force              Overwrite existing configuration
  --description <text>     Project description
  --permission-level <lvl> Automation level: full-auto, semi-auto (default), manual
  --quick                  Full bootstrap: init + compose + prime --bootstrap
  --sync-agent-config      Also overwrite existing .claude/settings.json and .opencode.json
  --git-hooks              Install pre-commit/post-commit git hooks
```

Creates:
- `.spec-graph/` directory structure
- `.spec-graph/profile.yaml` - Initial profile from Sense analysis
- `.spec-graph/permissions.yaml` - Automation permission config
- `.claude/settings.json` - Claude Code project permissions
- `.opencode.json` - OpenCode/Codex project permissions
- `.spec-graph/changes/` - Change descriptors
- `.spec-graph/artifacts/` - Produced artifacts
- `.spec-graph/traces/` - Traceability data

With `--quick`, also runs `compose` and `prime --bootstrap` immediately.

### `spec-graph sense`

Analyze project structure and infer the 22-dimension profile.

```bash
spec-graph sense [options]

Options:
  -o, --output <file>      Output file path
  --show-signals           Show raw repo signals
```

Scans for 40+ signals:
- Package manifests (package.json, pyproject.toml, etc.)
- Framework detection (React, Vue, Express, Django, etc.)
- Configuration files (Docker, CI/CD, tsconfig, etc.)
- Source and test file counts
- Database schemas, API specs, etc.

### `spec-graph compose`

Compose a workflow graph from profile and packs.

```bash
spec-graph compose [options]

Options:
  --change-type <type>     Change type (feature/bugfix/refactor/...) [default: feature]
  -o, --output <file>      Output file path
```

The compose engine:
1. Loads all packs from `packs/` directory
2. Matches domain packs based on profile (`applies_when`)
3. Matches intent pack based on change type (`applies_when_change`)
4. Merges artifacts, actions, checks, gates, and tracks
5. Applies gate patches for conditional requirements
6. Assembles parallel tracks with contract edges
7. Selects pipeline skeleton from intent pack
8. Derives traceability queries
9. Detects conflicts and warnings

Outputs `.spec-graph/graph.yaml` with the complete workflow specification.

### `spec-graph prime`

Initialize machine state from the composed graph.

```bash
spec-graph prime [options]

Options:
  --bootstrap              Auto-pass placeholder checks
  --dry-run                Show what would be seeded without modifying state
```

Seeds `.spec-graph/machine-state.yaml` with:
- All artifacts from the graph (status: pending)
- All checks from the graph (status: pending)
- Creates trace skeleton files in `.spec-graph/traces/`

### `spec-graph status`

Show a unified workflow dashboard.

```bash
spec-graph status
spec-graph status --json
```

Displays:
- Pipeline progress bar with current stage highlighted
- Quick stats: change type, permission level, artifact/check completion counts
- Artifacts table with status and producer
- Checks table with status
- Gate status with blocking items listed
- Next suggested action (auto or manual)

### `spec-graph dashboard`

Rich dashboard with multiple output formats.

```bash
spec-graph dashboard [options]

Options:
  --json                   Output as JSON
  --html                   Generate HTML dashboard file
  -o, --output <file>      Output file for HTML dashboard
```

Terminal output shows:
- Pipeline stage progress bar
- Artifact/check/gate/trace progress percentages
- Artifact status grid by kind
- Gate evaluation details
- Active change info
- Constitution status

### `spec-graph next`

Show the next required workflow step.

```bash
spec-graph next
spec-graph next --json
```

Reads `.spec-graph/graph.yaml` and `.spec-graph/machine-state.yaml`, evaluates every matching gate, and outputs:
- current stage
- next stage
- blocking gate
- missing artifacts
- failed/missing checks
- suggested commands/actions

### `spec-graph dispatch`

Generate a structured agent dispatch manifest.

```bash
spec-graph dispatch [options]

Options:
  --all                    Include every suggested action
  --output <file>          Write YAML dispatch manifest
  --json                   Print as JSON
```

The manifest includes 17+ fields:

| Field | Description |
|-------|-------------|
| `done` | Whether workflow is complete |
| `current_stage` | Current FSM stage |
| `next_stage` | Next stage after transition |
| `gate_passed` | Whether blocking gate is satisfied |
| `failed_checks` | List of failed check IDs |
| `missing_traces` | List of missing trace paths |
| `actions` | Array of suggested actions |
| `agent_id` | Target agent for the action |
| `template_ref` | Pack template reference |
| `suggested_doc_path` | Where to write the artifact |
| `document_guidance` | Instructions for the agent |
| `distilled_context` | Minimal relevant upstream artifacts |
| `constitution_principles` | Active governance rules |
| `active_change` | Current change descriptor |
| `codebase_summary` | Human-readable project analysis |

### `spec-graph run`

Run deterministic workflow actions until blocked or complete.

```bash
spec-graph run [options]

Options:
  --max-steps <n>          Cap automatic actions (default: 10)
  --timeout <ms>           Per-check timeout (default: 120000)
  --dry-run                Mark checks as passed without executing
  --diff                   Run only checks affected by recent changes
  --retries <n>            Retry failed checks (default: 0)
  --backoff <type>         Retry strategy: fixed/linear/exponential
  --include-periodic       Include periodic-tier checks
  --json                   Output as JSON
```

Permission levels:
- `full-auto` — auto-executes everything
- `semi-auto` — auto-executes checks + gated transitions only
- `manual` — auto-executes nothing

### `spec-graph check`

Run validation checks from the composed graph.

```bash
spec-graph check [options]

Options:
  --id <id>                Run a specific check
  --layer <layer>          Run checks for a layer: unit, integration, system, deployment
  --dry-run                Mark selected checks as passed
  --timeout <ms>           Per-check timeout
  --json                   Output as JSON
```

Check layers:
- **Unit** — lint, typecheck, unit tests
- **Integration** — component integration, contract tests
- **System** — full system tests, Lighthouse, a11y
- **Deployment** — E2E browser tests, HIL tests

### `spec-graph gate`

Evaluate gates against current state.

```bash
spec-graph gate [options]

Options:
  --phase <name>           Evaluate specific gate ID
  --json                   Output as JSON
```

Returns exit code 1 if any blocking gates fail.

### `spec-graph trace`

Trace requirements to implementation.

```bash
spec-graph trace [node-id] [options]

Options:
  --direction <direction>  backward (default) or forward
  --type <type>            Filter by node type

# Add a new trace edge
spec-graph trace add --from <id> --to <id> --via <relation>
```

### `spec-graph impact`

Analyze the impact of changes to an artifact.

```bash
spec-graph impact --artifact <id> [options]

Options:
  --json                   Output as JSON
  --mark-stale             Mark affected downstream artifacts as stale
```

Performs reverse BFS on the trace graph to find all transitive dependencies.

### `spec-graph change`

Manage change descriptors.

```bash
spec-graph change list                    # List all changes
spec-graph change create                  # Create a new change
spec-graph change show <id>               # Show change details
spec-graph change apply <id>              # Begin execution
spec-graph change complete <id>           # Mark complete
spec-graph change archive <id>            # Archive with plan MD
```

Change descriptors track:
- Metadata (id, title, description, type, priority)
- Scope (tracks, files, contracts)
- Impact (risk level, acceptance layers)
- Execution policy (retries, backoff, timebox)
- Status (proposed, in_progress, completed, archived)

Each change auto-generates a plan MD (`<title>-<timestamp>-plan.md`) for audit trail and recovery.

### `spec-graph retro`

Generate a retrospective document for a completed change.

```bash
spec-graph retro <change-id>
```

Generates `.spec-graph/retros/<change-id>-retro.md` with:
- What went well
- What didn't go well
- Action items
- Lessons learned for next time

### `spec-graph review`

Generate multi-model review prompts.

```bash
spec-graph review --artifact <id> [options]

Options:
  --models <list>          Comma-separated models (default: claude,codex)
  --focus <areas>          Focus areas for review
  --full                   Include full artifact (default: distilled)
  --save                   Save prompts to .spec-graph/reviews/
  --json                   Output as JSON
```

Supported models: `claude`, `codex`, `gemini`, or custom.

### `spec-graph rollback`

Safely rollback a change to its pre-change state.

```bash
spec-graph rollback <change-id> [options]

Options:
  --dry-run                Show what would be restored
```

Uses safety-net snapshots to restore pre-change file state.

### `spec-graph distill`

Compress an artifact document for context injection.

```bash
spec-graph distill --artifact <id> [options]

Options:
  --save                   Save to .spec-graph/distilled/
  --max-length <chars>     Max output length (default: 2000)
  --json                   Output as JSON
```

Preserves headings, bullets, code blocks, and key sentences. Typical compression ratio: 85%.

### `spec-graph machine`

Run and inspect the workflow state machine.

```bash
spec-graph machine init [--stage <stage>]
spec-graph machine status
spec-graph machine transition --from <stage> --to <stage>
spec-graph machine update --artifact <id> --status completed
spec-graph machine update --check <id> --status passed
spec-graph machine artifacts
spec-graph machine history
spec-graph machine restart-stage
```

### `spec-graph constitution`

Manage the governance constitution.

```bash
spec-graph constitution show
spec-graph constitution validate
spec-graph constitution bump --type <major|minor|patch>
spec-graph constitution diff
```

### `spec-graph doctor`

Diagnose project health.

```bash
spec-graph doctor [options]

Options:
  --json                   Output as JSON
  --fix                    Auto-fix issues
```

Checks 6 categories:
- Project Initialization
- Graph Composition
- Machine State
- Permissions
- Trace Files
- Graph/State Consistency

### `spec-graph visualize`

Generate workflow graph visualization.

```bash
spec-graph visualize [options]

Options:
  --format <type>          dot (default), mermaid, json
  -o, --output <file>      Output file
```

Mermaid output can be pasted directly into GitHub/GitLab/Notion for inline rendering.

### Other Commands

| Command | Description |
|---------|-------------|
| `artifact` | List/show/update workflow artifacts |
| `checklist` | Run 5 mechanical + 5 soft checks (fuzzy adjective detection) |
| `analysis` | Cross-document analysis |
| `config` | Manage runtime configuration |
| `contract` | Manage contract edges |
| `meeting` | Multi-agent meeting protocol |
| `merge-queue` | Atomic merge queue with commit-or-abort |
| `migrate` | Brownfield project migration |
| `permissions` | Manage agent permissions and sync configs |
| `profile` | View/edit project profile |
| `safety-net` | Snapshot baseline for rollback |
| `scope` | Scope overlap detection |
| `worktree` | Git worktree management |

## Pack Structure

Each pack is a directory containing `pack.yaml`:

```yaml
name: feature
version: "1.0.0"
kind: change-intent
priority: 0
description: "Feature development flow"

applies_when_change:
  type: [feature, enhancement, add]

provides:
  artifacts:
    - id: plan/story
      kind: plan
    - id: design/arch
      kind: design

  checks:
    - id: check/lint
      command: npm run lint
      layer: unit
    - id: check/test
      command: npm test
      layer: unit

  gates:
    - id: gate/ready-to-implement
      on_transition: [plan → implement]
      require_artifacts: [plan/story, design/arch]
      require_checks: [check/lint]
      fail_mode: block
```

### Available Packs

**Domain Packs:**
| Pack | Applies When |
|------|-------------|
| `api-design` | boundary: published-api |
| `architecture` | criticality: !prototype |
| `backend` | has_ui: none |
| `data-design` | persistence: !none |
| `ddd` | topology: federated OR boundary: published-* |
| `embedded` | deployment: embedded |
| `frontend` | has_ui: web OR mobile |
| `migration` | field: brownfield AND change-type: migration |
| `performance` | criticality: business-critical OR safety-critical |
| `requirement-analysis` | always |
| `task-decomposition` | always |

**Intent Packs:**
| Pack | Applies When |
|------|-------------|
| `feature` | type: [feature, enhancement, add] |
| `bugfix` | type: [bugfix, fix] |
| `refactor` | type: [refactor] |
| `spike` | type: [spike, research] |
| `deprecation` | type: [deprecation, removal] |

## Dispatch Manifest Example

```json
{
  "done": false,
  "current_stage": "implement",
  "next_stage": "review",
  "gate_passed": true,
  "failed_checks": [],
  "missing_traces": [],
  "actions": [
    {
      "id": "produce-impl-code",
      "type": "produce_artifact",
      "agent_id": "developer-agent",
      "template_ref": "packs/foundation.pack/templates/implementation.md",
      "suggested_doc_path": ".spec-graph/artifacts/implementation/code.md",
      "document_guidance": "Implement the feature described in plan/story...",
      "distilled_context": {
        "source": "trace-bfs",
        "relevant_artifacts": [
          {"id": "plan/story", "kind": "plan", "hops": 1},
          {"id": "design/arch", "kind": "design", "hops": 2}
        ],
        "total": 2
      }
    }
  ],
  "constitution_principles": [
    {"id": "no-todos", "text": "No TODO comments in production code"},
    {"id": "test-coverage", "text": "All new code must have tests"}
  ],
  "active_change": {
    "id": "change-001",
    "title": "Add user authentication",
    "type": "feature",
    "priority": "high"
  },
  "codebase_summary": "TypeScript/Node.js project with Express backend..."
}
```

## Project Structure

After `spec-graph init`:

```
your-project/
├── .spec-graph/
│   ├── profile.yaml           # 22-dimension project profile
│   ├── graph.yaml             # Composed workflow graph
│   ├── machine-state.yaml     # FSM state
│   ├── constitution.yaml      # Governance rules
│   ├── permissions.yaml       # Agent permissions
│   ├── config.yaml            # Runtime configuration
│   ├── hooks.yaml             # Pre/post command hooks
│   ├── pack-overrides.yaml    # Pack customization
│   ├── changes/               # Active change descriptors
│   │   ── <title>-<timestamp>.json
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

## Permission Levels

| Level | Auto-Execute | Agent Tool Grants |
|-------|-------------|-------------------|
| `full-auto` | Everything | Read, Write, Edit, Bash, Glob, Grep |
| `semi-auto` (default) | Checks + transitions | Read, Write, Edit, Bash, Glob, Grep |
| `manual` | Nothing | Read, Glob, Grep only |

### Sub-agent Roles

| Role | Action Types | Write Scope |
|------|-------------|-------------|
| `spec-author` | produce_artifact | `.spec-graph/**` |
| `quality-runner` | run_check | `.spec-graph/**` |
| `traceability-reviewer` | verify_trace | `.spec-graph/traces/**` |
| `governance-reviewer` | resolve_violation | `.spec-graph/**` |
| `workflow-operator` | transition | `.spec-graph/machine-state.yaml` |
| `stage-agent` | perform_stage, produce_artifact | `src/**`, `.spec-graph/**` |

## Hooks

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
    abort_on_failure: true
```

All 38 commands support pre/post hooks. Hooks can abort on failure.

## AI Agent Integration

spec-graph is designed for AI agents:

1. **Dispatch Manifest** — structured JSON telling agents what to do
2. **Status Report Protocol** — agents report DONE / BLOCKED / NEEDS_CONTEXT
3. **Auto-Loop Protocol** — continuous dispatch → execute → re-dispatch
4. **Meeting Protocol** — multi-agent collaboration
5. **Constitution Injection** — governance rules in every dispatch
6. **Context Distillation** — minimal relevant context via trace BFS

### Coordinator Protocol

The dispatch manifest includes `agent_id` which maps to agent prompts:
- `coordinator-protocol.md` — main orchestrator
- `pm-agent.md` — product management
- `architect-agent.md` — architecture decisions
- `developer-agent.md` — implementation
- `qa-agent.md` — quality assurance
- `reviewer-agent.md` — code/spec review

## Comparison with Other Tools

| Feature | spec-graph | wdf | BMAD | spec-kit |
|---------|-----------|-----|------|----------|
| Domain-neutral | ✅ | ❌ (Web-only) | ❌ | ️ |
| FSM stages | 8 | 4 | ⚠️ | 4 |
| Quality gates | 7 | 4 | ⚠️ | ⚠️ |
| CLI commands | 38 | 25 | 48 skills | 15 |
| Profile dimensions | 22 | 9 | 4 | 3 |
| Brownfield support | ✅ | ⚠️ | ❌ |  |
| Traceability | ✅ | ✅ |  | ⚠️ |
| Multi-agent | ✅ | ❌ | ✅ | ❌ |
| Constitution | ✅ | ✅ | ❌ | ✅ |
| Context distillation | ✅ | ✅ | ❌ | ❌ |
| Atomic merge | ✅ | ⚠️ | ❌ |  |
| Retrospective | ✅ |  | ✅ | ❌ |
| Rollback | ✅ | ❌ | ❌ | ❌ |
| Git hooks | ✅ | ✅ | ❌ | ❌ |
| Hooks system | ✅ (38 cmds) | ✅ | ❌ | ❌ |

**Score: 88/90** (16/18 dimensions at ⭐⭐⭐⭐⭐)

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

# Watch mode
npm run test:watch

# Development mode (no build)
npm run dev -- status

# Lint
npm run lint
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
- **npm**: https://www.npmjs.com/package/@spec-graph/core
- **Issues**: https://github.com/spec-graph/core/issues
