## Context

The v2 proposal declared "30+ v1 commands removed" but `packages/core/skills/` was never physically deleted. More importantly, the three-layer architecture was designed but never enforced:

```
Skills (Claude slash commands)  →  7 entry points
    ↓  orchestrate                        ↓  call bash
CLI (shell commands)             →  ~19 atomic operations
    ↓  thin wrapper                       ↓  import core
Core (API library)               →  15 engine modules
```

Currently this model is violated:
- core/skills/ sits between CLI and core, describing commands that don't exist
- CLI only exposes ~5/15 core modules
- entry skills reference CLI commands that may not exist

## Goals / Non-Goals

**Goals:**
1. Delete `packages/core/skills/` entirely
2. Add missing CLI commands so all core API modules are accessible via `spec-graph <cmd>`
3. Simplify entry skills in `packages/skills/` — remove bloat, document which CLI commands each orchestrates
4. Add `docs/ARCHITECTURE.md` as the definitive boundary reference

**Non-Goals:**
- Implement new core API capabilities (only expose existing ones)
- Modify core TypeScript module signatures
- Reorganize `packages/core/knowledge/` or `packages/core/packs/`
- Change the FSM or stage definitions

## Decisions

### Decision 1: 39 SKILL.md files → 5 buckets

| Bucket | Count | Disposition |
|--------|-------|-------------|
| REDUNDANT | 4 | Delete (plan, status, next, dashboard) |
| MERGEABLE | 6 | Delete — content absorbed into existing entry skills |
| CLI_CONCEPT | 13 | Move to `docs/cli-commands/` — plain markdown |
| CONFIG_DOC | 6 | Move to `docs/schemas/` — plain markdown |
| OVERENGINEERED | 10 | Delete entirely |

### Decision 2: 9 new CLI commands needed

Current CLI coverage of core modules:

| Core module | Has CLI? | New command |
|-------------|----------|-------------|
| automator | ✅ plan, auto, advance, status, intervene | — |
| planning | ✅ (via automator) | — |
| gate-enforcement | ⚠️ validate, diagnose only | `gate` (raw evaluation) |
| prompt-construction | ✅ next-prompt | `dispatch` (manifest gen) |
| external-coordination | ✅ (via auto) | — |
| knowledge-base | ❌ | `init`, `compose`, `check` |
| recovery | ❌ | — (used internally by auto) |
| sense | ❌ | `config` (was `sense`, renamed) |
| context-sharing | ❌* | — (used internally) |
| dependency-analyzer | ❌* | — (used internally) |
| file-conflict-analyzer | ❌* | — (used internally) |
| integration-gate | ❌* | — (used internally) |
| parallel-recovery | ❌* | — (used internally) |

*These modules are called internally by automator during auto workflow. They don't need standalone CLI.

Commands to add: `gate`, `dispatch`, `init`, `check`, `machine`, `compose`, `analyze`, `config`, `install`

Each new command is 20-40 lines — arg parsing + core API call + output format.

### Decision 3: Entry skills stay at 7 (add init)

```
packages/skills/ (7 skills):
  spec-graph-auto        ← orchestrates: plan → next-prompt → advance loop
  spec-graph-plan        ← orchestrates: plan + present + confirm
  spec-graph-init        ← NEW: orchestrates: init + compose + prime + config
  spec-graph-status      ← orchestrates: status + show
  spec-graph-validate    ← orchestrates: validate + gate + check
  spec-graph-diagnose    ← orchestrates: diagnose + suggest fix
  spec-graph-intervene   ← orchestrates: intervene + machine
```

Remove from git tracking (already deleted from disk): context-sharing, integration-gate, merge, parallel, parallel-recovery, requirement-analysis, sub-agent-methodology, ui-design, worktree — these were v1 parallel-execution guides absorbed into core.

### Decision 4: Architecture document as single source of truth

`docs/ARCHITECTURE.md` will show:
- The three-layer diagram
- Which core module each CLI command wraps
- Which CLI commands each skill orchestrates
- Rules for adding new capabilities to the right layer

## Risks / Trade-offs

- **Risk**: 9 new CLI commands add surface area for bugs
  - **Mitigation**: Each is a 20-40 line thin wrapper; bugs are in core, not CLI

- **Risk**: `spec-graph-init` skill duplicates functionality already in auto/plan
  - **Mitigation**: init is a distinct use case (project bootstrap) that auto doesn't cover

- **Risk**: Deleting 20 SKILL.md files (redundant + over-engineered) loses design thinking
  - **Mitigation**: 13 preserved in docs/; all recoverable via git history
