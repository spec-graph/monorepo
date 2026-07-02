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
│  plan, auto, advance, next-prompt, status, validate, intervene,   │
│  diagnose, sessions, init, compose, config, install, dispatch,    │
│  gate, check, machine, analyze                                    │
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
│  automator/            session lifecycle + 8-stage FSM            │
│  planning/             intent → capability decomposition          │
│  gate-enforcement/     entry/exit criteria evaluation             │
│  prompt-construction/  layered XML prompt generation              │
│  external-coordination/ agent adapter registry                    │
│  knowledge-base/       methodology library loader                │
│  recovery/             4-level progressive retry                  │
│  sense/                project profile inference                  │
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
| `plan` | `planning` | `generatePlan()` |
| `plan` | `automator` | `startSession()` |
| `auto` | `automator` | `autoRun()` |
| `advance` | `automator` | `submitResult()` |
| `next-prompt` | `automator` | `nextPrompt()` |
| `status` | `automator` | `status()` |
| `validate` | `gate-enforcement` | `evaluateGate()` |
| `diagnose` | `gate-enforcement` | `diagnoseFailure()` |
| `intervene` | `automator` | `intervene()` |
| `sessions` | `automator` | `listSessions()` |
| `init` | `knowledge-base`, `sense` | `loadKnowledgeBase()`, `sense()` |
| `compose` | `knowledge-base` | `loadKnowledgeBase()`, `getSkillsForStage()` |
| `config` | `sense` | `sense()` |
| `dispatch` | `automator` | `nextPrompt()` |
| `gate` | `gate-enforcement` | `evaluateGate()` |
| `check` | `gate-enforcement` | `evaluateGate()` |
| `machine` | `automator` | `status()`, `intervene()` |
| `analyze` | — | file system scan (standalone) |
| `completion` | — | shell completion (standalone) |

All 19 commands are documented in `packages/cli/docs/commands/`.

## Skill → CLI Command Mapping

| Entry Skill | CLI Commands Orchestrated |
|-------------|--------------------------|
| `spec-graph-init` | `init`, `config`, `compose`, `status` |
| `spec-graph-plan` | `plan`, `intervene` |
| `spec-graph-auto` | `auto`, `next-prompt`, `advance`, `diagnose`, `intervene` |
| `spec-graph-status` | `status` |
| `spec-graph-validate` | `validate`, `gate` |
| `spec-graph-diagnose` | `diagnose`, `advance`, `intervene` |
| `spec-graph-intervene` | `intervene`, `machine`, `status` |

## Rules for Adding New Capabilities

1. **New core capability?** Add a module in `packages/core/src/<name>/`
2. **Need it accessible from CLI?** Add a thin wrapper in `packages/cli/src/commands/<name>.ts`
3. **Need an agent to orchestrate it?** Create a SKILL.md in `packages/skills/spec-graph-<name>/`
4. **Just documenting a CLI design?** Write a plain markdown file in `docs/cli-commands/`

Never:
- Put SKILL.md files in `packages/core/`
- Make core modules depend on CLI concepts (parameter names, output format)
- Create a separate skill for every CLI command
