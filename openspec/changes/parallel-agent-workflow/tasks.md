# Tasks: Parallel Agent Workflow (Sub-Agent 架构)

## Estimation

基于 sub-agent 架构，spec-graph 自己只需要做**决策和方法论**，不需要实现执行逻辑。工作量大幅减少。

Total: ~16 tasks across 7 phases. Estimated effort: 3-4 weeks for a single developer.

**Total estimate:** ~40 story points

## Milestones

| Milestone | Tasks | Points | Deliverable |
|-----------|-------|--------|-------------|
| M1: Core modules | 1.1-1.2 | 10 | dependency-analyzer + file-conflict-analyzer |
| M2: Pipeline stages | 2.1-2.5 | 12 | 4 new pipeline stages + task-decomp update |
| M3: Skills | 3.1-3.5 | 10 | 5 new skills (parallel/worktree/merge/requirement/ui/etc.) |
| M4: Automator integration | 4.1-4.2 | 3 | --mode parallel/auto support |
| M5: CLI integration | 5.1-5.2 | 2 | New CLI commands |
| M6: Tests | 6.1-6.2 | 2 | Unit + integration tests |
| M7: E2E validation | 7.1-7.2 | 3 | Run on Express starter |

## Dependencies

```
M1 (Core) ──────► M3 (Skills) ──────► M4 (Automator) ─► M7 (E2E)
M2 (Stages) ────► M3 ─────────────► M5 (CLI) ──────► M6 (Tests)
```

---

## 1. Core Modules (M1)

### Task 1.1: Implement dependency-analyzer module
- **Points**: 5
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] `packages/core/src/dependency-analyzer/index.ts` created
  - [ ] `analyzeTasks(tasks)` returns ExecutionPlan with waves
  - [ ] Uses Kahn's algorithm for topological sort
  - [ ] Cycle detection
  - [ ] Wave grouping: tasks in same wave have no dependencies
  - [ ] JSON output for visualization: `{waves: [[A, B], [C]], edges: [...]}`
  - [ ] ≥10 unit tests in `dependency-analyzer/index.test.ts`
  - [ ] Tests cover: parallel tasks, chain, cycles, empty input

### Task 1.2: Implement file-conflict-analyzer module
- **Points**: 5
- **Blocked by**: — (parallel with 1.1)
- **Acceptance criteria**:
  - [ ] `packages/core/src/file-conflict-analyzer/index.ts` created
  - [ ] `analyzeConflicts(tasks)` returns ConflictMatrix (N×N boolean)
  - [ ] Static analyzer based on task description + design references
  - [ ] Pre-dispatch agent query function: `queryAgentForFiles(agent)`
  - [ ] Conservative fallback: serialize tasks with "unknown impact"
  - [ ] ≥10 unit tests in `file-conflict-analyzer/index.test.ts`
  - [ ] Tests cover: no conflicts, full conflicts, read-only, unknown

---

## 2. Pipeline Stages (M2)

### Task 2.1: Add requirement-analysis stage with auto-depth
- **Points**: 3
- **Blocked by**: 1.1
- **Acceptance criteria**:
  - [ ] `knowledge/stages/requirement-analysis/` created
  - [ ] `skills/requirement-analysis/instruction.md` with 3 depth templates
  - [ ] Auto-depth selection based on intent complexity
  - [ ] `gate.yaml` with entry/exit criteria
  - [ ] `STAGES` array includes 'requirement-analysis' as first stage

### Task 2.2: Add ui-design stage
- **Points**: 2
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] `knowledge/stages/ui-design/` created
  - [ ] `skills/ui-design/instruction.md` covers wireframes, component tree, accessibility
  - [ ] `gate.yaml` with UI-specific criteria
  - [ ] `STAGES` includes 'ui-design' (after design)

### Task 2.3: Add user-stories stage
- **Points**: 2
- **Blocked by**: 2.2
- **Acceptance criteria**:
  - [ ] `knowledge/stages/user-stories/` created
  - [ ] Instruction covers AS-A / I-WANT / SO-THAT format
  - [ ] Output: user stories with acceptance criteria
  - [ ] `gate.yaml` with user story criteria
  - [ ] `STAGES` includes 'user-stories'

### Task 2.4: Add dev-stories stage
- **Points**: 2
- **Blocked by**: 2.3
- **Acceptance criteria**:
  - [ ] `knowledge/stages/dev-stories/` created
  - [ ] Instruction covers technical story decomposition from user stories
  - [ ] Output: dev stories with implementation approach + file impact
  - [ ] `gate.yaml` with dev story criteria
  - [ ] `STAGES` includes 'dev-stories'

### Task 2.5: Update task-decomposition stage
- **Points**: 3
- **Blocked by**: 2.4
- **Acceptance criteria**:
  - [ ] `knowledge/stages/task-decomposition/instruction.md` updated
  - [ ] Mentions dependency analysis for parallelism
  - [ ] Mentions file-conflict analysis
  - [ ] `gate.yaml` includes "dependencies-analyzed" criterion
  - [ ] `STAGES` array now has 12 stages (total)

---

## 3. Skills (M3)

### Task 3.1: Create spec-graph-parallel skill
- **Points**: 3
- **Blocked by**: 1.1, 1.2, 2.5
- **Acceptance criteria**:
  - [ ] `packages/skills/spec-graph-parallel/SKILL.md` created
  - [ ] Stance: "Use host agent's sub-agent tool for parallel execution"
  - [ ] Steps: analyze dependencies → create worktrees → dispatch sub-agents → merge
  - [ ] Mentions: Claude Code Agent tool, Codex Subagents, Cursor parallel agents
  - [ ] Edge cases: sub-agent failure, worktree conflict, merge conflict
  - [ ] ≥200 lines

### Task 3.2: Create spec-graph-worktree skill
- **Points**: 2
- **Blocked by**: 3.1
- **Acceptance criteria**:
  - [ ] `packages/skills/spec-graph-worktree/SKILL.md` created
  - [ ] Covers git worktree creation/cleanup
  - [ ] Branch naming convention: `spec-graph/<session>/<task>`
  - [ ] Worktree directory: `.spec-graph/worktrees/<task>/`
  - [ ] Cleanup options: keep-on-failure

### Task 3.3: Create spec-graph-merge skill
- **Points**: 2
- **Blocked by**: 3.1
- **Acceptance criteria**:
  - [ ] `packages/skills/spec-graph-merge/SKILL.md` created
  - [ ] Covers sequential merge to main
  - [ ] Auto-rebase before merge
  - [ ] Conflict handling strategies: abort, skip, force-ours
  - [ ] Merge queue logic

### Task 3.4: Create spec-graph-requirement-analysis skill
- **Points**: 2
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] `packages/skills/spec-graph-requirement-analysis/SKILL.md` created
  - [ ] Auto-depth selection logic
  - [ ] 3 depth templates included
  - [ ] Output format per depth level

### Task 3.5: Create spec-graph-ui-design skill
- **Points**: 1
- **Blocked by**: 2.2
- **Acceptance criteria**:
  - [ ] `packages/skills/spec-graph-ui-design/SKILL.md` created
  - [ ] Covers wireframes, component tree, design system
  - [ ] Output: UI design document

---

## 4. Automator Integration (M4)

### Task 4.1: Add --mode flag to automator
- **Points**: 2
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [ ] `autoRun()` accepts `mode: 'serial' | 'parallel' | 'auto'`
  - [ ] Serial mode: V2 behavior (unchanged)
  - [ ] Parallel mode: invokes spec-graph-parallel skill
  - [ ] Auto mode: run dependency-analyzer, choose parallel if possible

### Task 4.2: Wire dependency-analyzer into planning
- **Points**: 1
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [ ] After task-decomposition, dependency-analyzer runs
  - [ ] Output: `waves.json` in session dir
  - [ ] `spec-graph status --json` includes waves

---

## 5. CLI Integration (M5)

### Task 5.1: Update `auto` command for --mode
- **Points**: 1
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [ ] `spec-graph auto <intent> --mode parallel` works
  - [ ] `spec-graph auto <intent> --mode serial` works (default)
  - [ ] `spec-graph auto <intent> --mode auto` works (auto-detect)

### Task 5.2: Add `waves` subcommand
- **Points**: 1
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [ ] `spec-graph waves [--json]` shows execution plan
  - [ ] Output: wave list, task assignments

---

## 6. Tests (M6)

### Task 6.1: Unit tests for core modules
- **Points**: 1
- **Blocked by**: 1.1, 1.2
- **Acceptance criteria**:
  - [ ] dependency-analyzer: 10+ tests (already in task 1.1)
  - [ ] file-conflict-analyzer: 10+ tests (already in task 1.2)

### Task 6.2: Integration tests for parallel workflow
- **Points**: 1
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [ ] Test: task → dependency analysis → waves output
  - [ ] Test: task → conflict analysis → matrix output
  - [ ] Test: mode flag properly selects parallel/serial

---

## 7. E2E Validation (M7)

### Task 7.1: Run parallel workflow on Express starter
- **Points**: 2
- **Blocked by**: all M1-M6
- **Acceptance criteria**:
  - [ ] spec-graph auto --mode parallel on Express starter
  - [ ] At least 2 tasks run in parallel (via host agent sub-agent)
  - [ ] All worktrees merged to main successfully
  - [ ] End-to-end feature is functional

### Task 7.2: Cross-tool validation
- **Points**: 1
- **Blocked by**: 7.1
- **Acceptance criteria**:
  - [ ] Tested on Claude Code (Agent tool)
  - [ ] Tested on Codex CLI (Subagents)
  - [ ] Results documented in docs/agent-integration-guide.md

---

## Summary

| Phase | Tasks | Points | Status |
|-------|-------|--------|--------|
| 1. Core Modules | 1.1-1.2 | 10 | ✗ |
| 2. Pipeline Stages | 2.1-2.5 | 12 | ✗ |
| 3. Skills | 3.1-3.5 | 10 | ✗ |
| 4. Automator Integration | 4.1-4.2 | 3 | ✗ |
| 5. CLI Integration | 5.1-5.2 | 2 | ✗ |
| 6. Tests | 6.1-6.2 | 2 | ✗ |
| 7. E2E Validation | 7.1-7.2 | 3 | ✗ |
| **TOTAL** | | **42** | |

**Current completion: 0/42 points (0%)**

Compared to original proposal (80 points): **~50% reduction** due to sub-agent architecture simplification.
