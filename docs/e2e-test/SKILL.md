---
name: spec-graph-e2e-test
description: Run the complete spec-graph production-level E2E test — 8 stages, parallel sub-agent dispatch, hook-driven workflow. Tests the full pipeline from plan → compose → dispatch → sub-agent → advance → integration.
---

# spec-graph E2E Production Test

Complete end-to-end test of the spec-graph pipeline using a real project with 3 independent utility libraries.

## Test Project

```
test-project/
├── src/
│   ├── math-utils/     # Feature A (independent — no dependencies)
│   ├── string-utils/   # Feature B (independent — no dependencies)
│   └── date-utils/     # Feature C (independent — no dependencies)
├── .spec-graph/
│   └── config.yaml     # Project context for compose
└── .claude/
    └── settings.json   # dispatch-watcher hook configuration
```

**Intent**: Build 3 independent TypeScript utility libraries with no shared dependencies.

**3 Capabilities (all dependsOn: [] → Wave 0 parallel)**:
- `math-utils`: sum, multiply, average
- `string-utils`: capitalize, truncate, slugify
- `date-utils`: formatDate, daysBetween, isWeekend

## Prerequisites

1. spec-graph packages built: `npm run build -w packages/core && npm run build -w packages/cli`
2. Test project deps: `cd test-project && npm install`
3. Setup script: `node test-project/setup.mjs`

## Test Flow

### Phase 0: Setup (manual, once)

```bash
# Build spec-graph
npm run build -w packages/core && npm run build -w packages/cli

# Install test project dependencies
cd test-project && npm install && cd ..

# Run setup — creates session, confirms plan, composes graph
node test-project/setup.mjs
```

**Verify**:
- [ ] Session created: sessionId starts with "build-3-independent-"
- [ ] State: running (plan confirmed)
- [ ] Graph: 7 agents, 13 bindings
- [ ] Capabilities: 3 (all dependsOn: [])

### Phase 1: Specify Stage

```bash
SID="build-3-independent-typescript-utility-libraries-with-no-shared-"
spec-graph dispatch --session "$SID" --json
```

**Hook triggers**: PostToolUse → dispatch-watcher.mjs → system-reminder injected.

**Verify**:
- [ ] manifest.stage = "specify"
- [ ] manifest.actions.length = 1
- [ ] manifest.actions[0].agent ends with "domain-expert-agent.md"
- [ ] manifest.actions[0].description is non-empty (LLM-filled from planning intent)
- [ ] manifest.actions[0].description differs from intent (scoped to specify task)
- [ ] manifest.actions[0].output ends with "specify/proposal.md"

**Action**: Dispatch sub-agent via Agent tool. Sub-agent reads role file from
manifest.actions[0].agent path and methodology from manifest.actions[0].skills[].

**After sub-agent completes**:
```bash
spec-graph advance --session "$SID" --result '{
  "artifacts": [{
    "path": ".spec-graph/sessions/<sid>/specify/proposal.md",
    "content": "<copy sub-agent output here>"
  }]
}'
```

**Verify**:
- [ ] advanced = true, nextStage = "design"
- [ ] machine-state: specify/proposal.md = "completed"

### Phase 2: Design Stage

Same as Phase 1 but:
- [ ] manifest.stage = "design"
- [ ] manifest.actions[0].agent_id = "domain-expert"
- [ ] manifest.actions[0].prompt has format: "Markdown with sections: Context, Goals/Non-Goals, Decisions, Risks/Trade-offs"
- [ ] artifact: design/design.md (≥ 3 sections)

### Phase 3: Plan Stage

- [ ] manifest.stage = "plan"
- [ ] manifest.actions[0].agent_id = "developer"
- [ ] prompt expects: checkbox tasks format
- [ ] artifact: plan/tasks.md (≥ 3 tasks)

### Phase 4: Implement Stage (⭐ CRITICAL PARALLEL TEST)

**This is the core test — 3 sub-agents dispatched in parallel.**

Dispatch:
```bash
spec-graph dispatch --session "$SID" --json
```

**Verify (manifest)**:
- [ ] manifest.stage = "implement"
- [ ] manifest.actions.length = 3
- [ ] All 3 actions: parallel_group = 0 (same Wave)
- [ ] math-utils action: agent=developer, description=scoped to math feature
- [ ] string-utils action: agent=developer, description=scoped to string feature
- [ ] date-utils action: agent=developer, description=scoped to date feature
- [ ] Each action.checks has lint, test, typecheck commands
- [ ] Each action.output points to correct src/ file
- [ ] Each action.description is DIFFERENT (scoped to its feature only)

**Hook reminder should show**:
```
Wave 0 (PARALLEL — dispatch ALL sub-agents simultaneously):
  - Agent("math-utils", role_file=actions[0].agent, description=actions[0].description)
  - Agent("string-utils", role_file=actions[1].agent, description=actions[1].description)
  - Agent("date-utils", role_file=actions[2].agent, description=actions[2].description)
```

**Action**: Dispatch ALL 3 sub-agents SIMULTANEOUSLY using Agent tool in parallel.

**After ALL 3 complete**:
```bash
spec-graph advance --session "$SID" --result '{
  "artifacts": [
    {"path": ".spec-graph/sessions/<sid>/implement/math-utils.md", "content": "..."},
    {"path": ".spec-graph/sessions/<sid>/implement/string-utils.md", "content": "..."},
    {"path": ".spec-graph/sessions/<sid>/implement/date-utils.md", "content": "..."}
  ]
}'
```

**Post-implement verification**:
- [ ] 3 source files exist: src/math-utils/index.ts, src/string-utils/index.ts, src/date-utils/index.ts
- [ ] 3 test files exist
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` passes
- [ ] All 3 machine-state artifacts = "completed"

### Phase 5-8: Review → Test → Accept → Integrate

Same pattern as specify/design (single sub-agent each):
- [ ] Phase 5 (review): agent=reviewer, artifact=review/review.md
- [ ] Phase 6 (test): agent=qa, artifact=test/test.md
- [ ] Phase 7 (accept): agent=qa, artifact=accept/verification.md
- [ ] Phase 8 (integrate): agent=developer, artifact=integrate/pr.md

### Phase 9: Final Verification

```bash
# Check session state
cat .spec-graph/sessions/$SID/state.yaml

# Check machine state
cat .spec-graph/machine-state.yaml

# Verify code
npx tsc --noEmit
npx vitest run
```

**Verify**:
- [ ] state.yaml: state = "completed", readyForArchive = true
- [ ] state.yaml: trace has 8 gate-pass entries
- [ ] state.yaml → parseStateYaml round-trip preserves all fields
- [ ] machine-state.yaml: all 8 artifacts = "completed"
- [ ] All 3 src/*/index.ts files contain actual implementation (not throw stubs)
- [ ] All 3 test files contain actual test cases (not placeholder)
- [ ] TypeScript compiles without errors
- [ ] All tests pass

## Success Criteria

| # | Criterion | Measurement |
|---|-----------|-------------|
| 1 | Pipeline completes | All 8 stages advanced, state = completed |
| 2 | Hook triggers | dispatch-watcher detected every `dispatch --json` |
| 3 | Parallel dispatch | 3 sub-agents ran simultaneously in Wave 0 |
| 4 | Independent execution | Each sub-agent produced isolated artifact |
| 5 | Gate evaluation | All exit criteria passed for each stage |
| 6 | Machine-state sync | All artifacts tracked as completed |
| 7 | Round-trip persistence | formatStateYaml → parseStateYaml preserves data |
| 8 | Real code quality | TypeScript compiles, tests pass |

## Troubleshooting

- **Hook not triggering**: Check `.claude/settings.json` has PostToolUse hook registered
- **Sub-agent dispatch fails**: Check agent prompt_ref paths exist in packs
- **Gate blocked**: Check `spec-graph diagnose --session <id>` for details
- **Stale graph.yaml**: Re-run `spec-graph compose`

## Auto-loop Protocol

The dispatch-watcher hook injects an auto-loop instruction. When the hook fires correctly, the test runs automatically without manual intervention:

```
spec-graph dispatch → hook fires → system-reminder → Agent tool → 
sub-agent completes → advance → spec-graph dispatch → ... loop until done
```

Only stop when:
- manifest.done === true
- sub-agent returns BLOCKED
- gate blocked with no auto-fix
