# v3.2 Workflow Audit — Implementation Tasks

## 1. P0: agent binding fix (0.25 day)

- [x] 1.1 Add `tasks: developer` to foundation.pack `provides.agent_bindings`
- [x] 1.2 Re-compose graph.yaml: `spec-graph compose`
- [x] 1.3 Verify: dispatch tasks stage manifest has `agent_id: "developer"`
- [x] 1.4 Verify: all existing tests pass (`npm test`)

## 2. P0: meeting metadata in dispatch manifest (0.5 day)

- [x] 2.1 Add `meeting` field to `DispatchManifest` type in `packages/core/src/types/index.ts`
- [x] 2.2 Add `shouldRecommendMeeting()` function in `packages/core/src/dispatch/index.ts`
- [x] 2.3 Load meeting declarations from graph.yaml in `generateDispatchManifest()`
- [x] 2.4 Populate `manifest.meeting` when a meeting declaration matches the current stage action
- [x] 2.5 Add tests for recommendation logic (low/high complexity, few/many capabilities, open questions, risks)
- [x] 2.6 Add tests for manifest generation with meeting metadata (available, recommended, not recommended, absent)

## 3. P0: task-decomposition-meeting declaration (0.25 day)

- [x] 3.1 Add `task-decomposition-meeting` to foundation.pack `provides.meetings`
- [x] 3.2 Define 4 participants: PM, Architect, Developer, QA (all core)
- [x] 3.3 Define 3 rounds: diverge → challenge → converge
- [x] 3.4 Set output_artifacts: `plan/tasks`, on_actions: `[plan, tasks]`
- [x] 3.5 Re-compose graph.yaml and verify meeting appears in `graph.meetings`

## 4. P0: coordinator-protocol.md (0.25 day)

- [x] 4.1 Create `packages/core/packs/foundation.pack/agents/coordinator-protocol.md`
- [x] 4.2 Document sections: role, reading manifest, single-agent mode, meeting mode, parallel waves, auto-loop, escalation
- [x] 4.3 Verify dispatch-watcher.mjs reference resolves to the file

## 5. P1: automator parseStateYaml → js-yaml (0.5 day)

- [x] 5.1 Replace `parseStateYaml()` in `automator/index.ts` with `yaml.load()` from js-yaml
- [x] 5.2 Replace `formatStateYaml()` in `automator/index.ts` with `yaml.dump()`
- [x] 5.3 Keep `_test` export but wrap js-yaml behind the same function signatures
- [x] 5.4 Verify: all existing tests pass (`npm run test --workspace=packages/core`)
- [x] 5.5 Verify: existing session state.yaml files parse correctly
- [x] 5.6 Verify: new state.yaml files written correctly (readable by both old and new parser)

## 6. P1: dispatch CLI graphPath (0.1 day)

- [x] 6.1 Pass `path.join(cwd, '.spec-graph', 'graph.yaml')` as graphPath argument in `dispatch.ts`
- [x] 6.2 Verify: dispatch reads from graph.yaml when it exists
- [x] 6.3 Verify: dispatch falls back to pack scanning when graph.yaml is absent (test by temporarily moving the file)

## 7. P1: hook system-reminder meeting awareness (0.25 day)

- [x] 7.1 Update `dispatch-watcher.mjs`: detect `manifest.meeting?.available`
- [x] 7.2 When `manifest.meeting.recommended === true`: include meeting suggestion in system-reminder
- [x] 7.3 When `manifest.meeting.recommended === false`: do not mention meeting
- [x] 7.4 Meeting info format: meeting id, purpose, participants, init command

## 8. P1: E2E validation — simple task (0.5 day)

- [x] 8.1 Create new session in test-project with low-complexity intent (1 capability, 0 questions)
- [x] 8.2 Run specify stage dispatch → sub-agent → advance (verify gate-pass trigger)
- [x] 8.3 Run design stage dispatch → sub-agent → advance (verify gate-pass trigger)
- [x] 8.4 Run tasks stage dispatch → sub-agent → advance (verify gate-pass trigger, meeting NOT triggered)
- [x] 8.5 Run implement stage dispatch → sub-agent → advance (verify gate-pass trigger)
- [x] 8.6 Run review → test → accept → integrate stages
- [x] 8.7 Verify: state = "completed", readyForArchive = true, all artifacts present
- [x] 8.8 Verify: machine-state.yaml shows all artifacts as completed (not force-advance)

## 9. P2: E2E validation — complex task with meeting (0.5 day)

- [x] 9.1 Create new session in test-project with medium-complexity intent (5 capabilities, 2 questions)
- [x] 9.2 Run specify → design stages normally
- [x] 9.3 At tasks stage: verify manifest.meeting.recommended = true
- [x] 9.4 Initiate meeting: `spec-graph meeting init task-decomposition-meeting`
- [x] 9.5 Run 3 rounds: dispatch all 4 participants, record contributions, advance
- [x] 9.6 Complete meeting, generate tasks.md from convergence summary
- [x] 9.7 Advance tasks stage (verify gate-pass trigger)
- [x] 9.8 Run implement → review → test → accept → integrate
- [x] 9.9 Verify: meeting transcript exists at `.spec-graph/meetings/task-decomposition-meeting.yaml`
- [x] 9.10 Verify: state = "completed", all artifacts produced through gate evaluation

## 10. P2: cleanup & final verification (0.25 day)

- [x] 10.1 Build: `npm run build` — zero errors
- [x] 10.2 Tests: `npm test` — all passing
- [x] 10.3 Update `packages/core/CLAUDE.md` — document meeting-as-tool model, coordinator protocol
- [x] 10.4 Update `packages/skills/spec-graph-dispatch/SKILL.md` — document meeting optionality
- [x] 10.5 Update `packages/skills/spec-graph-auto/SKILL.md` — reflect new meeting model
