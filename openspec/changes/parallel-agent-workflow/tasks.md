# Tasks: Parallel Agent Workflow (可靠性优先)

## Estimation

基于可靠性优先的 sub-agent 架构，spec-graph V3 的核心工作：
- 2 个决策类模块（dependency-analyzer, file-conflict-analyzer）
- 2 个可靠性模块（integration-gate, parallel-recovery）
- 1 个上下文模块（context-sharing）
- 9 个新 skills（方法论）

Total: ~18 tasks across 8 phases. Estimated effort: 4-5 weeks.

**Total estimate:** ~62 story points

## Milestones

| Milestone | Tasks | Points | Deliverable |
|-----------|-------|--------|-------------|
| M1: Decision modules | 1.1-1.2 | 10 | dependency + conflict analyzer |
| M2: Reliability modules | 2.1-2.2 | 10 | integration-gate + parallel-recovery |
| M3: Context sharing | 3.1 | 5 | context-sharing module |
| M4: Pipeline stages | 4.1-4.5 | 12 | 4 new pipeline stages |
| M5: Skills | 5.1-5.9 | 15 | 9 new skills |
| M6: Automator + CLI | 6.1-6.2 | 4 | --mode support + new commands |
| M7: Tests | 7.1 | 2 | Unit + integration tests |
| M8: E2E validation | 8.1-8.2 | 4 | Reliability validation |

---

## 1. Decision Modules (M1)

### Task 1.1: Implement dependency-analyzer (conservative) ✓ DONE
- **Points**: 5
- **Blocked by**: —
- **Acceptance criteria**:
  - [x] `packages/core/src/dependency-analyzer/index.ts` created
  - [x] `analyzeTasks(tasks)` returns ExecutionPlan with waves
  - [x] Kahn's algorithm for topological sort
  - [x] Cycle detection
  - [x] **Conservative strategy**: if dependency is uncertain → serial
  - [x] JSON output: `{waves: [...], edges: [...], serialTasks: [...]}`
  - [x] ≥10 unit tests (10 tests pass)

### Task 1.2: Implement file-conflict-analyzer (conservative) ✓ DONE
- **Points**: 5
- **Blocked by**: —
- **Acceptance criteria**:
  - [x] `packages/core/src/file-conflict-analyzer/index.ts` created
  - [x] `analyzeConflicts(tasks)` returns ConflictMatrix
  - [x] Static analyzer + agent pre-query
  - [x] **Conservative strategy**: if impact uncertain → serial
  - [x] Risk classification per task (low/medium/high conflict risk)
  - [x] ≥10 unit tests (15 tests pass)

---

## 2. Reliability Modules (M2)

### Task 2.1: Implement integration-gate ✓ DONE
- **Points**: 5
- **Blocked by**: 1.1, 1.2
- **Acceptance criteria**:
  - [x] `packages/core/src/integration-gate/index.ts` created
  - [x] Three-level gate: individualGate, mergeGate, systemGate
  - [x] Individual gate uses same criteria as serial gate
  - [x] Merge gate analyzes conflicts
  - [x] System gate checks style consistency + integration tests
  - [x] Returns structured result: `{level: 1|2|3, passed: boolean, failures: [...]}`
  - [x] ≥10 unit tests (10 tests pass)

### Task 2.2: Implement parallel-recovery ✓ DONE
- **Points**: 5
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [x] `packages/core/src/parallel-recovery/index.ts` created
  - [x] `analyzeFailure(failureInfo)` returns attribution result
  - [x] Attribution: identify which sub-agent caused failure
  - [x] Targeted recovery: retry specific sub-agent
  - [x] Auto-degrade to serial if attribution fails
  - [x] Failure logging with full trace
  - [x] ≥10 unit tests (11 tests pass)

---

## 3. Context Sharing (M3)

### Task 3.1: Implement context-sharing module ✓ DONE
- **Points**: 5
- **Blocked by**: 1.1, 1.2
- **Acceptance criteria**:
  - [x] `packages/core/src/context-sharing/index.ts` created
  - [x] Generates shared context per wave
  - [x] Each sub-agent receives:
    - Project profile (from sense)
    - Project overview (from plan)
    - Other sub-agents' planned changes (read-only)
    - Shared methodology (naming, structure, etc.)
  - [x] Shared context is JSON or markdown
  - [x] Context is minimal (avoid overwhelming sub-agents)
  - [x] ≥5 unit tests (8 tests pass)

---

## 4. Pipeline Stages (M4)

### Task 4.1: Add requirement-analysis stage ✓ DONE
- **Points**: 3
- **Blocked by**: M1
- **Acceptance criteria**:
  - [x] `knowledge/stages/requirement-analysis/` created
  - [x] 3 depth templates (light/medium/heavy)
  - [x] Auto-depth selection based on intent complexity
  - [x] `STAGES` includes 'requirement-analysis'

### Task 4.2: Add ui-design stage ✓ DONE
- **Points**: 2
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [x] `knowledge/stages/ui-design/` created
  - [x] Covers wireframes, component tree, accessibility
  - [x] `STAGES` includes 'ui-design'

### Task 4.3: Add user-stories stage ✓ DONE
- **Points**: 2
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [x] `knowledge/stages/user-stories/` created
  - [x] Covers AS-A / I-WANT / SO-THAT format
  - [x] `STAGES` includes 'user-stories'

### Task 4.4: Add dev-stories stage ✓ DONE
- **Points**: 2
- **Blocked by**: 4.3
- **Acceptance criteria**:
  - [x] `knowledge/stages/dev-stories/` created
  - [x] Covers technical story decomposition
  - [x] `STAGES` includes 'dev-stories'

### Task 4.5: Update task-decomposition stage ✓ DONE
- **Points**: 3
- **Blocked by**: 4.4
- **Acceptance criteria**:
  - [x] `knowledge/stages/task-decomposition/instruction.md` updated
  - [x] Mentions dependency analysis + parallelism
  - [x] `STAGES` now has 12 stages

---

## 5. Skills (M5)

### Task 5.1: Create spec-graph-parallel skill (with 3-level gate guidance) ✓ DONE
- **Points**: 3
- **Blocked by**: M1-M3
- **Acceptance criteria**:
  - [x] Covers sub-agent dispatch + three-level gate
  - [x] Includes recovery strategy guidance
  - [x] Mentions Claude Code Agent tool, Codex Subagents, etc.

### Task 5.2: Create spec-graph-worktree skill ✓ DONE
- **Points**: 1
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [x] Covers worktree creation/cleanup
  - [x] Branch naming convention
  - [x] Cleanup options

### Task 5.3: Create spec-graph-merge skill ✓ DONE
- **Points**: 1
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [x] Sequential merge to main
  - [x] Rebase before merge
  - [x] Conflict resolution strategies

### Task 5.4: Create spec-graph-integration-gate skill ✓ DONE
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [x] Explains three-level gate
  - [x] When each level applies
  - [x] How to interpret gate results

### Task 5.5: Create spec-graph-parallel-recovery skill ✓ DONE
- **Points**: 2
- **Blocked by**: 5.4
- **Acceptance criteria**:
  - [x] Explains failure attribution
  - [x] Targeted recovery strategies
  - [x] Degradation to serial

### Task 5.6: Create spec-graph-sub-agent-methodology skill ✓ DONE
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [x] Defines sub-agent execution standards
  - [x] Code + tests + lint + typecheck + build + self-review
  - [x] Functionality verification against specs
  - [x] Naming/style conventions

### Task 5.7: Create spec-graph-context-sharing skill ✓ DONE
- **Points**: 1
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [x] Explains what context is shared across sub-agents
  - [x] Project overview + other agents' plans (read-only)
  - [x] Shared methodology guidance

### Task 5.8: Create spec-graph-requirement-analysis skill ✓ DONE
- **Points**: 1
- **Blocked by**: 4.1
- **Acceptance criteria**:
  - [x] Auto-depth selection (light/medium/heavy)
  - [x] 3 depth templates

### Task 5.9: Create spec-graph-ui-design skill ✓ DONE
- **Points**: 2
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [x] UI design methodology
  - [x] Output format

---

## 6. Automator + CLI (M6)

### Task 6.1: Add --mode flag + agent-analyzed dependsOn
- **Points**: 3 (was 2)
- **Blocked by**: M1-M5
- **Acceptance criteria**:
  - [ ] `autoRun()` accepts mode: 'serial' | 'parallel' | 'auto'
  - [ ] task-decomposition prompt requires agent to analyze **actual** dependsOn (not template-default)
  - [ ] Agent reads specs + design + existing code to determine real dependencies
  - [ ] Agent output includes: task-level dependsOn[] + files[] per task
  - [ ] dependency-analyzer receives agent-analyzed dependsOn, not template data
  - [ ] planning module DOMAIN_TEMPLATES provides hints only (optional)
  - [ ] User can confirm/override agent-analyzed dependencies at plan stage

### Task 6.2: Add new CLI commands
- **Points**: 2
- **Blocked by**: 6.1
- **Acceptance criteria**:
  - [ ] `spec-graph auto --mode parallel/serial/auto`
  - [ ] `spec-graph waves [--json]` shows execution plan
  - [ ] `spec-graph integration-status [--json]` shows gate status

---

## 7. Tests (M7)

### Task 7.1: Integration tests for parallel workflow
- **Points**: 2
- **Blocked by**: M1-M5
- **Acceptance criteria**:
  - [ ] Parallel execution with 3-level gate
  - [ ] Failure recovery scenarios
  - [ ] Auto-degradation to serial
  - [ ] Context sharing across sub-agents
  - [ ] Sub-agent methodology enforcement

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
| 1. Decision Modules | 1.1-1.2 | 10 | ✓ DONE |
| 2. Reliability Modules | 2.1-2.2 | 10 | ✓ DONE |
| 3. Context Sharing | 3.1 | 5 | ✓ DONE |
| 4. Pipeline Stages | 4.1-4.5 | 12 | ✓ DONE |
| 5. Skills | 5.1-5.9 | 15 | ✓ DONE |
| 6. Automator + CLI | 6.1-6.2 | 4 | IN PROGRESS |
| 7. Tests | 7.1 | 2 | PENDING |
| 8. E2E Validation | 8.1-8.2 | 4 | PENDING |
| **TOTAL** | | **62** | |

**Current completion: 42/62 points (68%)**

**Implemented:** M1-M5 core modules, pipeline stages, and skills

---

## OpenSpec Apply Task List

Standard-format task list for `openspec apply` command tracking:

### Decision + Reliability Modules
- [x] dependency-analyzer (task 1.1): 10 tests pass, Kahn's algorithm with cycle detection
- [x] file-conflict-analyzer (task 1.2): 15 tests pass, conflict matrix + parseAgentFileList
- [x] integration-gate (task 2.1): 10 tests pass, three-level gate validation
- [x] parallel-recovery (task 2.2): 11 tests pass, attribution + targeted recovery
- [x] context-sharing (task 3.1): 8 tests pass, JSON + Markdown format

### Pipeline Stages
- [x] requirement-analysis stage (task 4.1): knowledge path + gate.yaml + deep-analysis skill
- [x] ui-design stage (task 4.2): knowledge path + gate.yaml + ui-design skill
- [x] user-stories stage (task 4.3): knowledge path + gate.yaml + user-stories skill
- [x] dev-stories stage (task 4.4): knowledge path + gate.yaml + dev-stories skill
- [x] task-decomposition update (task 4.5): instruction.md updated for parallel awareness

### Skills
- [x] spec-graph-parallel (task 5.1): sub-agent dispatch + three-level gate
- [x] spec-graph-worktree (task 5.2): git worktree creation/cleanup
- [x] spec-graph-merge (task 5.3): sequential merge queue
- [x] spec-graph-integration-gate (task 5.4): gate level explanation
- [x] spec-graph-parallel-recovery (task 5.5): failure attribution strategies
- [x] spec-graph-sub-agent-methodology (task 5.6): sub-agent dev standards
- [x] spec-graph-context-sharing (task 5.7): shared context methodology
- [x] spec-graph-requirement-analysis (task 5.8): auto-depth analysis
- [x] spec-graph-ui-design (task 5.9): UI design methodology

### Automator + CLI
- [x] --mode flag + agent-analyzed dependsOn + 12-stage FSM (task 6.1)
- [ ] CLI commands: waves + integration-status (task 6.2)

### Tests + E2E
- [ ] Integration tests for parallel workflow (task 7.1)
- [ ] E2E: parallel workflow on Express starter (task 8.1)
- [ ] E2E: cross-tool validation (task 8.2)
**Remaining:** M6 automator/CLI, M7 tests, M8 E2E validation
