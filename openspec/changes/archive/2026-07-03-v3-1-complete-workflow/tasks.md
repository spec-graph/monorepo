# v3.1 Implementation Tasks

## 1. P0 Bugfix (0.5 day) — 阻塞性，先修

- [x] 1.1 Fix dispatch stageArtifacts: `plan: 'plan/tasks.md'` → `tasks: 'tasks/tasks.md'` in `packages/core/src/dispatch/index.ts`
- [x] 1.2 Add `normalizeStage()` function to `packages/core/src/automator/index.ts` (handle 'plan' → 'tasks' in loadSession)
- [x] 1.3 Update test fixtures: `'plan'` → `'tasks'` in `packages/core/src/composer/composer.test.ts`
- [x] 1.4 Update test fixtures: `'plan'` → `'tasks'` in `packages/core/src/gate-enforcement/index.test.ts`
- [x] 1.5 Update test fixtures: `'plan'` → `'tasks'` in `packages/core/src/e2e-production.test.ts`
- [x] 1.6 Run `npm test` — all 212+ tests pass
- [x] 1.7 Build and verify: `npm run build` exit 0
- [x] 1.8 Commit as v3.0.1 release candidate

## 2. P1 Planning LLM 化 (1.5 days)

- [x] 2.1 Create `packages/core/src/planning/schema.ts` — Plan JSON Schema definition
- [x] 2.2 Refactor `planning/index.ts`: extract `generatePlan()` into `generatePlanFallback()` (current keyword matching)
- [x] 2.3 Add `generatePlanningManifest()` function — assembles prompt with intent + profile + schema
- [x] 2.4 Add `validatePlanOutput()` function — validates JSON against schema, returns PlanOutput | ValidationError
- [x] 2.5 Create `packages/core/knowledge/shared/planning-schema.md` — planning agent prompt template with examples
- [x] 2.6 Update `packages/cli/src/commands/plan.ts` — add `--fallback` flag, default behavior outputs manifest
- [x] 2.7 Update `packages/cli/src/commands/confirm.ts` — accept plan JSON from agent as input (N/A: confirm is via --confirm flag)
- [x] 2.8 Add tests for `generatePlanningManifest()` — verify prompt content
- [x] 2.9 Add tests for `validatePlanOutput()` — valid JSON, invalid JSON, retry logic
- [x] 2.10 Add tests for fallback path — keyword matching still works
- [x] 2.11 Update `packages/skills/spec-graph-plan/SKILL.md` — document new workflow
- [x] 2.12 Run tests, build, verify

## 3. P2 Gate 统一 (1 day)

- [x] 3.1 Add `buildMergedCriteria()` function in `gate-enforcement/index.ts` — loads knowledge + graph gates
- [x] 3.2 Implement graph gate lookup: find gates where `on_transition` matches current stage transition
- [x] 3.3 Implement supplementary check injection: convert `require_checks` to rule criteria with `graph-` prefix
- [x] 3.4 Implement supplementary artifact injection: convert `require_artifacts` to rule criteria
- [x] 3.5 Handle duplicate IDs: knowledge criteria takes precedence, warn on graph duplicates
- [x] 3.6 Update `automator.submitResult()` to call `buildMergedCriteria()` before `evaluateGate()`
- [x] 3.7 Update `composer/index.ts`: simplify gates output to reference format (source + add_checks)
- [x] 3.8 Add backward compat: detect old graph.yaml format (full criteria), treat as supplementary
- [x] 3.9 Add tests for merge algorithm — knowledge only, graph supplementary, duplicates, empty graph
- [x] 3.10 Run existing 212+ tests — all pass (no regression)
- [x] 3.11 Build, verify

## 4. P2 Worktree 隔离 (1.5 days)

- [x] 4.1 Create `packages/core/src/isolation/` directory structure
- [x] 4.2 Implement `GitBackend` interface in `isolation/git-backend.ts` — default uses `child_process.execSync('git')`
- [x] 4.3 Implement `WorktreeManager` class in `isolation/index.ts`:
  - `create(sessionId, actionId, baseBranch)` → creates git worktree + branch
  - `verify(unitId)` → runs lint/test/typecheck in worktree
  - `merge(unitId)` → merges worktree branch → main
  - `abandon(unitId)` → marks abandoned + cleans up
  - `cleanup(unitId)` → git worktree remove + branch delete
- [x] 4.4 Implement `worktrees.yaml` persistence — read/write to `.spec-graph/isolation/worktrees.yaml`
- [x] 4.5 Implement `ScopeLock` in `isolation/scope-lock.ts` — validate allowed/protected/forbidden paths
- [x] 4.6 Implement `MergeQueue` in `isolation/merge-queue.ts` — sequential wave merge with conflict detection
- [x] 4.7 Update `dispatch/index.ts`: detect parallel actions → auto-create worktrees
- [x] 4.8 Update dispatch manifest: add `action.isolation` field (mode + worktree_path + scope_lock)
- [x] 4.9 Update dispatch manifest: add `isolation_summary` top-level field
- [x] 4.10 Create `packages/cli/src/commands/worktree.ts` — CLI commands: list/status/verify/merge/abandon/scope-check
- [x] 4.11 Register worktree commands in `packages/cli/src/index.ts`
- [x] 4.12 Update hook (`packages/cli/src/commands/hook.ts`): detect `action.isolation` → include worktree path in system-reminder
- [x] 4.13 Add tests for `WorktreeManager` — create, verify, merge, abandon, cleanup
- [x] 4.14 Add tests for `ScopeLock` — allowed, protected, forbidden path violations
- [x] 4.15 Add tests for `MergeQueue` — sequential merge, conflict detection, fallback to serial
- [x] 4.16 Add tests for dispatch worktree integration — parallel actions create worktrees, single action skips
- [x] 4.17 Run all tests, build, verify

## 5. P2 Meeting Runtime (1.5 days)

- [x] 5.1 Create `packages/core/src/meeting/` directory structure
- [x] 5.2 Implement `MeetingManager` class in `meeting/index.ts`:
  - `create(meetingId, declaration)` → creates meeting state YAML
  - `record(meetingId, contribution)` → appends to current_round_contributions
  - `advance(meetingId)` → moves contributions to rounds, increments round
  - `complete(meetingId, summary)` → sets status completed, records convergence
  - `abandon(meetingId, reason)` → sets status abandoned
  - `transcript(meetingId)` → returns full transcript
- [x] 5.3 Implement meeting state persistence — `.spec-graph/meetings/<meeting-id>.yaml`
- [x] 5.4 Implement meeting validation — participant must be in declaration, round must be in progress
- [x] 5.5 Create `packages/cli/src/commands/meeting.ts` — CLI commands: list/start/record/advance/complete/abandon/transcript
- [x] 5.6 Register meeting commands in `packages/cli/src/index.ts`
- [x] 5.7 Update `dispatch/index.ts`: detect meeting triggers (graph.meetings.on_actions)
- [x] 5.8 Generate meeting dispatch action — include meeting_id, rounds, participants, output_artifacts
- [x] 5.9 Update dispatch action ordering — meeting action first (parallel_group: -1), then perform_stage
- [x] 5.10 Update `dispatch-watcher.mjs` hook: detect `action.type === "meeting"` → generate meeting execution instructions
- [x] 5.11 Add tests for `MeetingManager` — create, record, advance, complete, abandon
- [x] 5.12 Add tests for meeting validation — invalid participant, empty contributions, advance with no contributions
- [x] 5.13 Add tests for dispatch meeting integration — meeting detected, action ordering, no meeting for stage
- [x] 5.14 Run all tests, build, verify

## 6. P2 FSM 补充 propose stage (0.5 day)

- [x] 6.1 Update `automator.STAGES` array: prepend 'propose' (length 8 → 9)
- [x] 6.2 Update `automator.Stage` type union: add 'propose'
- [x] 6.3 Update `automator.STAGE_OUTPUTS`: add `propose: { artifact: 'proposal.md', dir: 'propose' }`
- [x] 6.4 Create `packages/core/knowledge/stages/propose/gate.yaml` — entry: plan-confirmed, exit: proposal-exists + problem-statement + personas + scope-outline
- [x] 6.5 Create `packages/core/knowledge/stages/propose/skills/brainstorming/instruction.md` — brainstorming methodology
- [x] 6.6 Create `packages/core/knowledge/stages/propose/skills/brainstorming/templates/proposal.md` — initial proposal template
- [x] 6.7 Update `dispatch/index.ts`: add `propose` to `STAGE_OUTPUT_MAP`
- [x] 6.8 Update `dispatch/index.ts`: generate propose stage action (agent: pm, model_tier: capable)
- [x] 6.9 Update `packages/core/knowledge/stages/propose/skills/problem-framing/instruction.md` — problem framing methodology
- [x] 6.10 Update backward compat: v3.0 sessions starting at 'specify' continue from 'specify' (not forced to 'propose')
- [x] 6.11 Add tests for 9-stage FSM — STAGES length, STAGE_OUTPUTS, propose gate evaluation
- [x] 6.12 Add tests for backward compat — v3.0 session loads at 'specify', continues correctly
- [x] 6.13 Run all tests, build, verify

## 7. P3 清理 & 文档 (1 day)

- [x] 7.1 Move `knowledge/stages/requirement-analysis/` → `knowledge/archived/requirement-analysis/`
- [x] 7.2 Move `knowledge/stages/user-stories/` → `knowledge/archived/user-stories/`
- [x] 7.3 Move `knowledge/stages/ui-design/` → `knowledge/archived/ui-design/`
- [x] 7.4 Move `knowledge/stages/dev-stories/` → `knowledge/archived/dev-stories/`
- [x] 7.5 Update `knowledge-base/index.ts`: skip `archived/` directory when loading
- [x] 7.6 Add `spec-graph validate --knowledge` command — checks stage dirs vs FSM STAGES
- [x] 7.7 Update `packages/core/CLAUDE.md` — document 9-stage FSM, unified gates, worktree isolation, meeting runtime
- [x] 7.8 Update `README.md` — add propose stage, document worktree commands, meeting commands
- [x] 7.9 Update `packages/skills/spec-graph-dispatch/SKILL.md` — document meeting dispatch, worktree isolation
- [x] 7.10 Create `packages/skills/spec-graph-meeting/SKILL.md` — document meeting workflow
- [x] 7.11 Create `packages/skills/spec-graph-worktree/SKILL.md` — document worktree workflow
- [x] 7.12 Create `docs/migration-3.1.md` — v3.0 → v3.1 migration guide (9-stage FSM, new commands)
- [x] 7.13 Run full test suite — all tests pass
- [x] 7.14 Build, verify
- [x] 7.15 Commit as v3.1.0 release
