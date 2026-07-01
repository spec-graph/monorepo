# Tasks: Parallel Agent Workflow (可靠性优先)

## Estimation

基于可靠性优先的 sub-agent 架构，spec-graph V3 的核心工作：
- 2 个决策类模块（dependency-analyzer, file-conflict-analyzer）
- 2 个可靠性模块（integration-gate, parallel-recovery）
- 1 个上下文模块（context-sharing）
- 9 个新 skills（方法论）

Total: ~18 tasks across 8 phases. Estimated effort: 4-5 weeks.

**Total estimate:** ~50 story points

## Milestones

| Milestone | Tasks | Points | Deliverable |
|-----------|-------|--------|-------------|
| M1: Decision modules | 1.1-1.2 | 10 | dependency + conflict analyzer |
| M2: Reliability modules | 2.1-2.2 | 10 | integration-gate + parallel-recovery |
| M3: Context sharing | 3.1 | 5 | context-sharing module |
| M4: Pipeline stages | 4.1-4.5 | 12 | 4 new pipeline stages |
| M5: Skills | 5.1-5.7 | 14 | 7 new skills |
| M6: Automator + CLI | 6.1-6.2 | 4 | --mode support + new commands |
| M7: Tests | 7.1-7.2 | 3 | Unit + integration tests |
| M8: E2E validation | 8.1-8.2 | 4 | Reliability validation |

---

## 1. Decision Modules (M1)

### Task 1.1: Implement dependency-analyzer (conservative)
- **Points**: 5
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] `packages/core/src/dependency-analyzer/index.ts` created
  - [ ] `analyzeTasks(tasks)` returns ExecutionPlan with waves
  - [ ] Kahn's algorithm for topological sort
  - [ ] Cycle detection
  - [ ] **Conservative strategy**: if dependency is uncertain → serial
  - [ ] JSON output: `{waves: [...], edges: [...], serialTasks: [...]}`
  - [ ] ≥10 unit tests

### Task 1.2: Implement file-conflict-analyzer (conservative)
- **Points**: 5
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] `packages/core/src/file-conflict-analyzer/index.ts` created
  - [ ] `analyzeConflicts(tasks)` returns ConflictMatrix
  - [ ] Static analyzer + agent pre-query
  - [ ] **Conservative strategy**: if impact uncertain → serial
  - [ ] Risk classification per task (low/medium/high conflict risk)
  - [ ] ≥10 unit tests

---

## 2. Reliability Modules (M2)

### Task 2.1: Implement integration-gate
- **Points**: 5
- **Blocked by**: 1.1, 1.2
- **Acceptance criteria**:
  - [ ] `packages/core/src/integration-gate/index.ts` created
  - [ ] Three-level gate: individualGate, mergeGate, systemGate
  - [ ] Individual gate uses same criteria as serial gate
  - [ ] Merge gate analyzes conflicts
  - [ ] System gate checks style consistency + integration tests
  - [ ] Returns structured result: `{level: 1|2|3, passed: boolean, failures: [...]}`
  - [ ] ≥10 unit tests

### Task 2.2: Implement parallel-recovery
- **Points**: 5
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] `packages/core/src/parallel-recovery/index.ts` created
  - [ ] `analyzeFailure(failureInfo)` returns attribution result
  - [ ] Attribution: identify which sub-agent caused failure
  - [ ] Targeted recovery: retry specific sub-agent
  - [ ] Auto-degrade to serial if attribution fails
  - [ ] Failure logging with full trace
  - [ ] ≥10 unit tests

---

## 3. Context Sharing (M3)

### Task 3.1: Implement context-sharing module
- **Points**: 5
- **Blocked by**: 1.1, 1.2
- **Acceptance criteria**:
  - [ ] `packages/core/src/context-sharing/index.ts` created
  - [ ] Generates shared context per wave
  - [ ] Each sub-agent receives:
    - Project profile (from sense)
    - Project overview (from plan)
    - Other sub-agents' planned changes (read-only)
    - Shared methodology (naming, structure, etc.)
  - [ ] Shared context is JSON or markdown
  - [ ] Context is minimal (avoid overwhelming sub-agents)
  - [ ] ≥5 unit tests

---

## 4. Pipeline Stages (M4)

### Task 4.1: Add requirement-analysis stage
- **Points**: 3
- **Blocked by**: M1
- **Acceptance criteria**:
  - [ ] `knowledge/stages/requirement-analysis/` created
  - [ ] 3 depth templates (light/medium/heavy)
  - [ ] Auto-depth selection based on intent complexity
  - [ ] `STAGES` includes 'requirement-analysis'

### Task 4.2: Add ui-design stage
- **Points**: 2
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [ ] `knowledge/stages/ui-design/` created
  - [ ] Covers wireframes, component tree, accessibility
  - [ ] `STAGES` includes 'ui-design'

### Task 4.3: Add user-stories stage
- **Points**: 2
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [ ] `knowledge/stages/user-stories/` created
  - [ ] Covers AS-A / I-WANT / SO-THAT format
  - [ ] `STAGES` includes 'user-stories'

### Task 4.4: Add dev-stories stage
- **Points**: 2
- **Blocked by**: 4.3
- **Acceptance criteria**:
  - [ ] `knowledge/stages/dev-stories/` created
  - [ ] Covers technical story decomposition
  - [ ] `STAGES` includes 'dev-stories'

### Task 4.5: Update task-decomposition stage
- **Points**: 3
- **Blocked by**: 4.4
- **Acceptance criteria**:
  - [ ] `knowledge/stages/task-decomposition/instruction.md` updated
  - [ ] Mentions dependency analysis + parallelism
  - [ ] `STAGES` now has 12 stages

---

## 5. Skills (M5)

### Task 5.1: Create spec-graph-parallel skill (with 3-level gate guidance)
- **Points**: 3
- **Blocked by**: M1-M3
- **Acceptance criteria**:
  - [ ] Covers sub-agent dispatch + three-level gate
  - [ ] Includes recovery strategy guidance
  - [ ] Mentions Claude Code Agent tool, Codex Subagents, etc.

### Task 5.2: Create spec-graph-worktree skill
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [ ] Covers worktree creation/cleanup
  - [ ] Branch naming convention
  - [ ] Cleanup options

### Task 5.3: Create spec-graph-merge skill
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [ ] Sequential merge to main
  - [ ] Rebase before merge
  - [ ] Conflict resolution strategies

### Task 5.4: Create spec-graph-integration-gate skill
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [ ] Explains three-level gate
  - [ ] When each level applies
  - [ ] How to interpret gate results

### Task 5.5: Create spec-graph-parallel-recovery skill
- **Points**: 2
- **Blocked by**: 5.4
- **Acceptance criteria**:
  - [ ] Explains failure attribution
  - [ ] Targeted recovery strategies
  - [ ] Degradation to serial

### Task 5.6: Create spec-graph-requirement-analysis skill
- **Points**: 1
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [ ] Auto-depth selection
  - [ ] 3 depth templates

### Task 5.7: Create spec-graph-ui-design skill
- **Points**: 2
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [ ] UI design methodology
  - [ ] Output format

---

## 6. Automator + CLI (M6)

### Task 6.1: Add --mode flag + context sharing
- **Points**: 2
- **Blocked by**: M1-M5
- **Acceptance criteria**:
  - [ ] `autoRun()` accepts mode: 'serial' | 'parallel' | 'auto'
  - [ ] Context-sharing module integrated
  - [ ] Each sub-agent receives shared context

### Task 6.2: Add new CLI commands
- **Points**: 2
- **Blocked by**: 6.1
- **Acceptance criteria**:
  - [ ] `spec-graph auto --mode parallel/serial/auto`
  - [ ] `spec-graph waves [--json]` shows execution plan
  - [ ] `spec-graph integration-status [--json]` shows gate status

---

## 7. Tests (M7)

### Task 7.1: Unit tests for all new modules
- **Points**: 2
- **Blocked by**: M1-M5
- **Acceptance criteria**:
  - [ ] dependency-analyzer: 10+ tests
  - [ ] file-conflict-analyzer: 10+ tests
  - [ ] integration-gate: 10+ tests
  - [ ] parallel-recovery: 10+ tests
  - [ ] context-sharing: 5+ tests

### Task 7.2: Integration tests for parallel workflow
- **Points**: 1
- **Blocked by**: 7.1
- **Acceptance criteria**:
  - [ ] Parallel execution with 3-level gate
  - [ ] Failure recovery scenarios
  - [ ] Auto-degradation to serial
  - [ ] Context sharing across sub-agents

---

## 8. E2E Validation (M8)

### Task 8.1: Reliability validation on Express starter
- **Points**: 2
- **Blocked by**: all M1-M7
- **Acceptance criteria**:
  - [ ] Run parallel workflow on Express starter
  - [ ] Measure parallel success rate ≥ 90%
  - [ ] Measure speedup ≥ 2x vs serial
  - [ ] Test failure recovery scenarios
  - [ ] Test auto-degradation to serial

### Task 8.2: Cross-tool validation
- **Points**: 2
- **Blocked by**: 8.1
- **Acceptance criteria**:
  - [ ] Tested on Claude Code (Agent tool)
  - [ ] Tested on Codex CLI (Subagents)
  - [ ] Results documented in docs/

---

## Summary

| Phase | Tasks | Points | Status |
|-------|-------|--------|--------|
| 1. Decision Modules | 1.1-1.2 | 10 | ✗ |
| 2. Reliability Modules | 2.1-2.2 | 10 | ✗ |
| 3. Context Sharing | 3.1 | 5 | ✗ |
| 4. Pipeline Stages | 4.1-4.5 | 12 | ✗ |
| 5. Skills | 5.1-5.7 | 14 | ✗ |
| 6. Automator + CLI | 6.1-6.2 | 4 | ✗ |
| 7. Tests | 7.1-7.2 | 3 | ✗ |
| 8. E2E Validation | 8.1-8.2 | 4 | ✗ |
| **TOTAL** | | **62** | |

**Current completion: 0/62 points (0%)**
