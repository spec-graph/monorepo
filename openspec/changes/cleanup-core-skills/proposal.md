## Why

`packages/core/skills/` contains 39 SKILL.md files that are orphaned — they are neither Claude Code skills (not installed), nor knowledge-base instructions (wrong path), nor CLI commands (no implementation). They reveal a deeper problem: the architecture boundaries between core (API library), cli (command interface), and skills (Claude slash commands) are confused.

Current gaps in the three-layer architecture:

1. **core/skills/** — 39 orphaned files pretending to be skills, actually design docs for unbuilt CLI commands
2. **packages/cli/** — 10 commands but core has 15+ API modules. ~9 modules have no CLI exposure, making core capabilities inaccessible
3. **packages/skills/** — 6 entry skills that reference CLI commands, some of which don't exist yet, and are bloated with parallel-execution guides that should be inline methodology
4. **No documentation** of the skill→CLI→core relationship — future contributors will repeat the same mistakes

## What Changes

### Phase 1: Delete misplaced content
- **DELETE** `packages/core/skills/` directory (39 SKILL.md files, ~12,000 lines)
- **DELETE** 4 redundant concepts (plan, status, next, dashboard) — already have CLI + entry skills
- **DELETE** 6 mergeable concepts (run/dev→auto, prime/sense→init, show→status, gate→validate)
- **DELETE** 10 over-engineered concepts (meeting, migrate, merge-queue, scope, worktree, rollback, doctor, distill, impact, analysis)
- **MOVE** 13 CLI concept docs → `docs/cli-commands/` as plain markdown
- **MOVE** 6 config concept docs → `docs/schemas/` as plain markdown

### Phase 2: Align CLI with core API
- **ADD** CLI commands for core modules without exposure: `gate`, `dispatch`, `init`, `check`, `machine`, `compose`, `analyze`, `config`, `install`
- Each new CLI command is a thin wrapper (20-40 lines) calling the existing core API
- Result: ~19 CLI commands covering all core API modules

### Phase 3: Clean up entry skills
- **SIMPLIFY** the 6 entry skills in packages/skills/ — remove inline parallel-execution guides; those belong as core module documentation
- **DOCUMENT** in each entry skill which CLI commands it orchestrates and which core modules back them
- **ADD** `spec-graph-init` skill for project bootstrap (the one genuinely missing entry point)
- Result: 7 clean, focused entry skills

### Phase 4: Document the architecture
- **ADD** `docs/ARCHITECTURE.md` — a one-page diagram showing the three-layer model
- **UPDATE** `packages/core/CLAUDE.md`, root `README.md` — remove stale references to skills/

## Capabilities

### New Capabilities

None — this is a cleanup and alignment. CLI commands added are thin wrappers over existing core APIs.

### Modified Capabilities

None — no existing spec-level behavior changes.

## Impact

### Files affected
| Operation | Path | Count |
|-----------|------|-------|
| DELETE | `packages/core/skills/` | 39 files |
| ADD | `packages/cli/src/commands/*.ts` | 9 new CLI commands |
| ADD | `docs/cli-commands/*.md` | 13 design docs |
| ADD | `docs/schemas/*.md` | 6 schema docs |
| ADD | `docs/ARCHITECTURE.md` | 1 arch doc |
| MODIFY | `packages/skills/spec-graph-*/SKILL.md` | 6 files (simplify) |
| ADD | `packages/skills/spec-graph-init/SKILL.md` | 1 new skill |
| MODIFY | `packages/core/CLAUDE.md` | cleanup refs |
| MODIFY | `README.md` | update structure |

### Dependencies
- None — no new packages, no runtime changes

### Breaking
- **BREAKING**: `packages/core/skills/` removed. No code depends on it.
