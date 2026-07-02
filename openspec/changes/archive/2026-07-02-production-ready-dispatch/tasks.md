## 1. State Persistence Fix

- [x] 1.1 Enhance `formatStateYaml` in `packages/core/src/automator/index.ts` to write dependsOn arrays, previousDiagnoses (retryLevel, similarToPrevious, failedCriteria), plan.order, and readyForArchive
- [x] 1.2 Rewrite `parseStateYaml` to read back all fields: completedArtifacts, previousDiagnoses (with retryLevel + failedCriteria), retryCount, plan.capabilities (with dependsOn), plan.order, plan.risks, readyForArchive
- [x] 1.3 Add unit test: write session → read session → verify all fields match (round-trip)
- [x] 1.4 Add unit test: session with 3 capabilities and dependencies → parser correctly restores dependsOn
- [x] 1.5 Add unit test: session with 2 diagnoses → parser correctly restores retryLevel and failedCriteria
- [x] 1.6 Add unit test: session with plan.order → parser correctly restores order array

## 2. Pack Composer

> **Depends on**: Section 1 complete (uses automator types for Plan/SessionData)
> **Depended on by**: Section 5 (dispatch reads graph.yaml format)

- [x] 2.1 Create `packages/core/src/composer/index.ts` with `composeGraph(packsDir, profileFacts) → Graph`
- [x] 2.2 Implement pack scanner: read all `*.pack/pack.yaml` files, parse with js-yaml, skip malformed with warning
- [x] 2.3 Implement profile-based filtering: match `applies_when` facts with AND semantics against fact dimension existence, include `always` packs unconditionally, treat missing `applies_when` as `always`, exclude conditional packs when profile is empty
- [x] 2.4 Implement priority-based merge: sort packs by priority ascending, then merge agents, agent_bindings, checks, gates with higher-priority override, non-conflicting entries preserved
- [x] 2.5 Implement graph output: write composed Graph to `.spec-graph/graph.yaml`
- [x] 2.6 Replace CLI stub in `packages/cli/src/commands/compose.ts` to call composer
- [x] 2.7 Add `--json` output with full Graph, human output with agent/gate/check/binding counts
- [x] 2.8 Add unit test: single pack → correct graph with 5 agents
- [x] 2.9 Add unit test: two packs with conflicting bindings → higher priority wins
- [x] 2.10 Add unit test: profile filter excludes non-matching pack (AND semantics: one fact dimension missing → excluded)
- [x] 2.11 Add unit test: pack without `applies_when` → treated as `always` (always loaded)
- [x] 2.12 Add unit test: empty profile → only `always` packs loaded, conditional packs excluded
- [x] 2.13 Add unit test: all 17 packs load without crash (smoke test)

## 3. Machine State Tracker

> **Depends on**: Section 1 complete (automator integration)
> **Depended on by**: Section 5 (dispatch reads machine-state.yaml)

- [x] 3.1 Create `packages/core/src/machine-state/index.ts` with track/query API
- [x] 3.2 Implement `trackArtifact(id, status, details)` — status: pending | in_progress | completed | failed; use atomic write (temp file + rename)
- [x] 3.3 Implement `trackCheck(id, status, details)` — same atomic write strategy
- [x] 3.4 Implement `getMachineState()` that reads `.spec-graph/machine-state.yaml`
- [x] 3.5 Integrate with `automator.submitResult()`: call `trackArtifact` on gate pass
- [x] 3.6 Integrate with `automator.intervene()`: call `trackArtifact` on `force-advance` (mark artifact completed with forced flag) and `rollback` (mark artifact pending)
- [x] 3.7 Add CLI command `artifact-complete` at `packages/cli/src/commands/artifact-complete.ts`
- [x] 3.8 Add CLI command `check-run` at `packages/cli/src/commands/check-run.ts` with security validation: check command against constitution `security.command_whitelist`/`forbidden_patterns`; sentinel commands (`<...>`) dispatched to TS handlers
- [x] 3.9 Update dispatch manifest generator to read machine-state.yaml for gate status (three-level fallback: machine-state → file-existence → session diagnosis)
- [x] 3.10 Add unit test: track artifact → getMachineState → artifact status correct
- [x] 3.11 Add unit test: gate_passed=true when all required artifacts completed in machine-state
- [x] 3.12 Add unit test: force-advance calls trackArtifact with completed status
- [x] 3.13 Add unit test: rollback calls trackArtifact with pending status
- [x] 3.14 Add unit test: atomic write — interrupted write does not corrupt existing machine-state.yaml

## 4. Sub-Agent Protocol (verification)

> **Independent** — can run in parallel with Sections 1-3

- [x] 4.1 Verify `STAGE_OUTPUT_MAP` covers all 8 stages with correct dir, file, template, format, and checks
- [x] 4.2 Verify `buildPromptEnvelope` includes all 9 sections in order: Identity, System Prompt, Task Context, Input Artifacts, Output Specification, File Scope, Verification, Status Report Protocol, After Completion
- [x] 4.3 Verify `output_spec`, `file_scope`, and `verification` fields populated in all dispatch manifest actions
- [x] 4.4 Add test: envelope contains all 9 required section headers
- [x] 4.5 Add test: implement stage envelope has lint/test/typecheck commands populated
- [x] 4.6 Add test: specify stage envelope has no code checks but has Verification section with format note

## 5. Dispatch — Graph Integration

> **Depends on**: Section 2 (graph.yaml format), Section 3 (machine-state.yaml format)

- [x] 5.1 Modify `generateDispatchManifest` to accept optional `graphPath` parameter; read agent config from graph.yaml when available
- [x] 5.2 Implement fallback: when graph.yaml absent, scan pack directories (backward compatibility, use existing `loadPackAgents`; log warning when using fallback path)
- [x] 5.3 Update `evaluateGateStatus` in dispatch to use three-level fallback: machine-state.yaml → file-existence → session diagnosis (see Decision 10)
- [x] 5.4 Update `packages/core/src/index.ts` exports to include composer and machine-state modules

## 6. Verify and Integrate

> **Depends on**: Sections 1-5 complete

- [x] 6.1 Run full test suite: `npm test` — all tests pass (140 pass, 3 pre-existing failures in sense module)
- [x] 6.2 E2E test: compose with foundation.pack → verify graph.yaml has 5 agents, 14+ bindings, correct pipeline_skeleton
- [x] 6.3 E2E test: compose → dispatch reads graph.yaml → manifest references graph agents
- [x] 6.4 E2E test: plan → dispatch → verify envelope has all 9 sections → sub-agent protocol correct
- [x] 6.5 E2E test: state persistence — advance through 2 stages, restart process, verify all state preserved (plan.order, completedArtifacts, retryCount)
- [x] 6.6 E2E test: track artifact via machine-state → dispatch manifest shows correct gate_passed
- [x] 6.7 E2E test: force-advance via intervene → machine-state updated → dispatch manifest shows gate_passed
- [x] 6.8 E2E test: rollback via intervene → machine-state updated → artifact marked pending
