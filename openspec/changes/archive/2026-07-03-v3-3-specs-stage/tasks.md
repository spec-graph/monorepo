# v3.3 Specs Stage — Implementation Tasks

## 1. P0: Design gate cleanup (0.25 day) — unblocks design stage

- [x] 1.1 Remove specs-* criteria from `knowledge/stages/design/gate.yaml`: specs-one-per-capability, specs-requirement-format, specs-shall-must, specs-scenarios-present, specs-delta-operations, design-covers-specs
- [x] 1.2 Add `specs-passed-gate` entry criteria to design/gate.yaml (replaces direct specs checks)
- [x] 1.3 Remove duplicate `design-risks` line from design/gate.yaml
- [x] 1.4 Verify: design gate evaluation succeeds without specs.md artifact

## 2. P0: Specs stage gate.yaml (0.25 day)

- [x] 2.1 Create `knowledge/stages/specs/gate.yaml`
- [x] 2.2 Define entry: proposal-exists
- [x] 2.3 Define exit: specs-exists, specs-one-per-capability, specs-requirement-format, specs-shall-must, specs-scenarios-present, specs-length
- [x] 2.4 Verify: gate-enforcement loadGateConfig finds specs stage

## 3. P0: FSM extension (0.25 day)

- [x] 3.1 Update `automator/index.ts` STAGES array: add 'specs' between 'specify' and 'design'
- [x] 3.2 Update `automator/index.ts` Stage type union: add 'specs'
- [x] 3.3 Update `automator/index.ts` STAGE_OUTPUTS: add specs entry { artifact: 'specs.md', dir: 'specs' }
- [x] 3.4 Update `dispatch/index.ts` STAGE_OUTPUT_MAP: add specs entry
- [x] 3.5 Build: `npm run build` — zero errors

## 4. P0: Gate-enforcement rules (0.25 day)

- [x] 4.1 Add `specs-exists` rule to KNOWN_RULES in gate-enforcement/index.ts
- [x] 4.2 Add `specs-shall-must` rule to KNOWN_RULES
- [x] 4.3 Add `specs-length` rule to KNOWN_RULES (200-3000 words)
- [x] 4.4 Verify: existing rules `specs-one-per-capability`, `specs-requirement-format`, `specs-scenarios-present` work with specs stage
- [x] 4.5 Add tests for new specs rules
- [x] 4.6 Add test: specs gate passes with valid content (Requirement + Scenario format, 300 words)
- [x] 4.7 Add test: specs gate rejects short content (50 words)

## 5. P0: Knowledge migration (0.25 day)

- [x] 5.1 Create directory `knowledge/stages/specs/skills/specs-authoring/templates/`
- [x] 5.2 Move `knowledge/stages/design/skills/specs-authoring/instruction.md` → `knowledge/stages/specs/skills/specs-authoring/instruction.md`
- [x] 5.3 Move `knowledge/stages/design/skills/specs-authoring/templates/spec.md` → `knowledge/stages/specs/skills/specs-authoring/templates/spec.md`
- [x] 5.4 Verify: knowledge-base loadKnowledgeBase finds specs-authoring in specs stage
- [x] 5.5 Verify: specs-authoring NOT loaded for design stage anymore

## 6. P0: Foundation pack update (0.25 day)

- [x] 6.1 Add `specs` to foundation.pack `provides.actions`
- [x] 6.2 Add `specs: architect` to foundation.pack `provides.agent_bindings`
- [x] 6.3 Add `specs` to architect agent's `actions` list
- [x] 6.4 Re-compose graph.yaml and verify specs appears in graph

## 7. P1: Dispatch metadata (0.5 day)

- [x] 7.1 Add `specs` field to DispatchManifest type in types/index.ts
- [x] 7.2 Add `shouldRecommendSpecs()` function in dispatch/index.ts
- [x] 7.3 Add `buildSpecsMetadata()` function in dispatch/index.ts
- [x] 7.4 Populate manifest.specs when session is at specs stage
- [x] 7.5 Build: `npm run build` — zero errors
- [x] 7.6 Verify: manifest.specs included when session is at specs stage

## 8. P1: Backward compat (0.5 day)

- [x] 8.1 Add `stagesVersion` field to SessionData type (default: 2 for new sessions)
- [x] 8.2 In loadSession(), detect stagesVersion < 2 and auto-complete specs stage
- [x] 8.3 Add test: old session (stagesVersion=1) at 'design' skips specs
- [x] 8.4 Add test: new session (stagesVersion=2) includes specs
- [x] 8.5 Verify: existing test-project sessions load without errors

## 9. P1: Hook specs awareness (0.25 day)

- [x] 9.1 Update dispatch-watcher.mjs: detect manifest.specs?.available
- [x] 9.2 When recommended: include specs suggestion in system-reminder
- [x] 9.3 When not recommended: don't mention specs
- [x] 9.4 Add test for hook specs display

## 10. P1: E2E validation (1 day)

- [x] 10.1 Create new session with low-complexity intent (skip specs path)
- [x] 10.2 Run specify → design → tasks → implement → review → test → accept → integrate (8 stages)
- [x] 10.3 Verify: state = 'completed', all artifacts produced
- [x] 10.4 Create new session with medium-complexity intent (specs path)
- [x] 10.5 Run specify → specs → design → tasks → implement → review → test → accept → integrate (9 stages)
- [x] 10.6 Verify: state = 'completed', specs.md produced with proper format
- [x] 10.7 Verify: design gate passes without specs-* criteria

## 11. P2: Documentation (0.25 day)

- [x] 11.1 Update `packages/core/CLAUDE.md`: document 9-stage FSM with optional specs
- [x] 11.2 Update `packages/skills/spec-graph-dispatch/SKILL.md`: document specs stage
- [x] 11.3 Update `packages/skills/spec-graph-auto/SKILL.md`: document specs decision
- [x] 11.4 Build: `npm run build` — zero errors
- [x] 11.5 Tests: `npm test` — all passing (new specs tests included)
