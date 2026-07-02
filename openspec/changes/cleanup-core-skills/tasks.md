## 1. Delete misplaced content

- [ ] 1.1 Delete `packages/core/skills/spec-graph-plan/SKILL.md` (redundant — CLI + entry skill exist)
- [ ] 1.2 Delete `packages/core/skills/spec-graph-status/SKILL.md` (redundant)
- [ ] 1.3 Delete `packages/core/skills/spec-graph-next/SKILL.md` (redundant — = next-prompt)
- [ ] 1.4 Delete `packages/core/skills/spec-graph-dashboard/SKILL.md` (redundant — = status)
- [ ] 1.5 Delete mergeable skills (6 files): run, dev, prime, sense, show, gate
- [ ] 1.6 Delete over-engineered skills (10 files): meeting, migrate, merge-queue, scope, worktree, rollback, doctor, distill, impact, analysis
- [ ] 1.7 Move 13 CLI concept SKILL.md files to `docs/cli-commands/` as plain markdown (strip YAML frontmatter)
- [ ] 1.8 Move 6 config concept SKILL.md files to `docs/schemas/` as plain markdown (strip YAML frontmatter)
- [ ] 1.9 Delete now-empty `packages/core/skills/` directory
- [ ] 1.10 Verify no imports or requires reference `packages/core/skills/`

## 2. Add missing CLI commands (thin wrappers over core API)

- [ ] 2.1 Add `packages/cli/src/commands/init.ts` — wrapper for core.knowledgeBase + core.planning
- [ ] 2.2 Add `packages/cli/src/commands/compose.ts` — wrapper for knowledge-base graph generation
- [ ] 2.3 Add `packages/cli/src/commands/config.ts` — wrapper for reading/writing .spec-graph/config.yaml
- [ ] 2.4 Add `packages/cli/src/commands/install.ts` — wrapper for skill installation to IDE directories
- [ ] 2.5 Add `packages/cli/src/commands/dispatch.ts` — wrapper for core.promptConstruction manifest generation
- [ ] 2.6 Add `packages/cli/src/commands/gate.ts` — wrapper for core.gateEnforcement raw evaluation
- [ ] 2.7 Add `packages/cli/src/commands/check.ts` — wrapper for running graph-declared checks
- [ ] 2.8 Add `packages/cli/src/commands/machine.ts` — wrapper for FSM direct control
- [ ] 2.9 Add `packages/cli/src/commands/analyze.ts` — wrapper for cross-artifact consistency
- [ ] 2.10 Register all new commands in `packages/cli/src/index.ts`
- [ ] 2.11 Verify `spec-graph --help` lists all new commands

## 3. Clean up entry skills

- [ ] 3.1 Audit 6 entry skills for references to non-existent CLI commands — fix any broken refs
- [ ] 3.2 Simplify `spec-graph-auto/SKILL.md` — remove inline parallel-execution guides
- [ ] 3.3 Simplify `spec-graph-plan/SKILL.md` — remove inline methodology content
- [ ] 3.4 Add "Orchestrates" section to each entry skill documenting which CLI commands it calls
- [ ] 3.5 Create `packages/skills/spec-graph-init/SKILL.md` — project bootstrap skill
- [ ] 3.6 Remove from git: 9 deleted entry skills (context-sharing, integration-gate, merge, parallel, parallel-recovery, requirement-analysis, sub-agent-methodology, ui-design, worktree) — already deleted from disk

## 4. Document the architecture

- [ ] 4.1 Create `docs/ARCHITECTURE.md` with three-layer diagram and module mapping table
- [ ] 4.2 Update `packages/core/CLAUDE.md` — remove references to `skills/` directory
- [ ] 4.3 Update root `README.md` — reflect cleaned-up directory structure
- [ ] 4.4 Update `packages/skills/README.md` — document the 7-skill set and orchestration model

## 5. Verify

- [ ] 5.1 Run `npm run build` — verify all packages build cleanly
- [ ] 5.2 Run `npm test` — verify all existing tests pass
- [ ] 5.3 Run `spec-graph --help` — verify new CLI commands appear
- [ ] 5.4 Run `spec-graph-init` skill installation — verify all 7 skills install correctly
