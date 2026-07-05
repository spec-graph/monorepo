# v3.3 Specs Stage — Formal Requirements Stage

## Context

Post-v3.2 audit revealed a critical architectural mismatch:

- The `design` stage's `gate.yaml` requires 5 `specs-*` criteria
  (specs-one-per-capability, specs-requirement-format, specs-shall-must,
  specs-scenarios-present, specs-delta-operations)
- These criteria check `ctx.artifactContents['specs']`
- But the FSM produces NO `specs.md` artifact anywhere
- The `design` stage only produces `design.md` (per STAGE_OUTPUTS)
- There's a `specs-authoring` skill in design/skills/ but no FSM stage uses it

**Result**: the design gate ALWAYS fails on specs-* criteria unless specs.md
is manually injected. This prevents the 8-stage workflow from completing.

The original OpenSpec workflow had a formal specs stage that was condensed
during v3.0. This change restores it as an optional stage that the
coordinator can choose to use when the change is complex enough to benefit
from formal requirements.

## Scope

### In Scope

1. **New FSM stage `specs`** — added between specify and design
   - FSM: specify → specs → design → tasks → implement → review → test → accept → integrate
   - STAGES length: 8 → 9
   - STAGE_OUTPUTS[specs] = { artifact: 'specs.md', dir: 'specs' }
   - Stage type union: add 'specs'

2. **Specs stage is OPTIONAL** — coordinator decides whether to invoke it
   - The dispatch manifest surfaces `specs.recommended` as informational
   - Simple changes: skip specs, go directly specify → design (8-stage path)
   - Complex changes: invoke specs stage (9-stage path)
   - Coordinator decides based on plan.complexity, openQuestions, risks

3. **Design gate cleanup** — remove specs-* criteria from design gate
   - Delete: specs-one-per-capability, specs-requirement-format, specs-shall-must,
     specs-scenarios-present, specs-delta-operations from design/gate.yaml
   - Delete: design-covers-specs from design/gate.yaml
   - These are now evaluated by the specs stage gate instead

4. **Specs stage gate.yaml** — new gate for specs stage
   - Entry: proposal-exists
   - Exit: specs-one-per-capability, specs-requirement-format, specs-shall-must,
     specs-scenarios-present, specs-delta-operations, specs-length
   - Move these rules from design to specs stage knowledge

5. **Foundation pack update**:
   - Add `specs` to `provides.actions`
   - Add `specs: architect` to `provides.agent_bindings`
   - Add specs-recommendation meeting template (optional)

6. **Dispatch update**:
   - Add `specs` to STAGE_OUTPUT_MAP in dispatch/index.ts
   - Add `specs.recommended` logic (complexity-based recommendation)
   - Add `manifest.specs` field with available/recommended/template

7. **Hook update**:
   - Surface specs availability in system-reminder (similar to meeting)

8. **Backward compat**:
   - Existing 8-stage sessions: start at specify, continue through design
     without hitting specs stage (sessions created before v3.3 have
     stage transitions that skip specs)
   - New 9-stage sessions: include specs stage

9. **Knowledge base**:
   - Move specs-authoring skill from design/skills/ to specs/skills/
   - Add specs gate.yaml to knowledge/stages/specs/

### Out of Scope

- Removing the optional behavior (future: mandatory specs for high-risk changes)
- Meeting integration for specs stage (can be added later)
- Worktree/isolation integration (separate concern)
- LLM-judge verification method (stub)

## Design Decisions

### Decision 1: Optional vs Mandatory specs

**Decision**: Specs is OPTIONAL, coordinator decides.

**Rationale**: Matches the meeting-as-tool pattern from v3-2. Simple tasks
don't need formal specs; complex ones benefit from them. The coordinator
has the best judgment about whether formal specs would help.

**Trade-off**: Less consistent quality enforcement, but lower overhead for
simple tasks. Users who want mandatory specs can fork the pack and make
the stage mandatory in their workflow.

### Decision 2: Placement in FSM

**Decision**: Insert specs BETWEEN specify and design.

```
specify → specs → design → tasks → implement → ...
```

**Rationale**:
- specify produces informal proposal (WHY + WHAT)
- specs produces formal requirements (Requirement + Scenario)
- design produces architecture (HOW)
- This is the natural flow: intent → requirements → design → implementation

**Alternative**: specs after design (as part of design stage)
- Rejected: design depends on specs, not the other way around

### Decision 3: Skip path for 8-stage sessions

**Decision**: Sessions created before v3.3 (with 8-stage trace) continue
through design without hitting specs. New sessions get the 9-stage path.

**Rationale**: Breaking existing sessions is worse than the inconsistency
of having two paths. The backward compat is detected by checking if the
session was created before the specs stage was added (e.g., by the
absence of specs-related fields in state.yaml).

### Decision 4: Agent binding

**Decision**: `specs: architect`

**Rationale**: Formal requirements are an architectural activity. The
architect understands system constraints, interface contracts, and can
write requirements that are implementable and testable.

**Alternative**: `specs: pm` (product manager)
- Rejected: PM writes informal requirements in specify. Formal specs need
  technical precision that architects provide.

## Verification

1. **Build**: `npm run build` — zero errors
2. **Tests**: `npm test` — all 242+ tests pass (including new specs stage tests)
3. **E2E simple** (8-stage path): low-complexity intent skips specs,
   completes through design without formal requirements
4. **E2E complex** (9-stage path): medium-complexity intent with open
   questions triggers specs stage, produces specs.md, design gate passes
5. **Backward compat**: existing test-project session continues without
   breaking
6. **Gate correctness**: design gate NO LONGER includes specs-* criteria;
   specs gate correctly evaluates specs format requirements
