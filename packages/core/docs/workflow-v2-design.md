# Workflow Architecture v2

## Problem

Current workflow is linear FSM:
```
specify → design → plan → implement → review → test → accept → integrate
```

Issues:
1. `change create` is disconnected from `plan/story` — stories are written but not used
2. implement→review→test is linear, but real dev is iterative (code↔review↔fix↔test)
3. No automatic story → change binding — manual `change create` is redundant

## New Architecture

### Two-phase workflow

**Phase 1: Planning** (current plan stage, unchanged)
```
specify → design → plan
         └── Output: PRD + epics + stories
```

**Phase 2: Development** (NEW — change-driven dev loops)
```
plan complete
    ↓
For each story:
    story → change create (auto-bound)
                ↓
    dev loop:
        ┌→ coding (agent writes code)
        │      ↓
        │   reviewing (sub-agent or check reviews)
        │      ↓
        │   issues found? ─→ fix ─→ back to reviewing
        │      ↓ no issues
        │   testing (spec-graph check)
        │      ↓
        │   tests fail? ─→ fix ─→ back to coding
        │      ↓ pass
        └─ dev loop ends
    ↓
    change complete → archive
    ↓
Next story...
```

### Key Changes

#### 1. Story → Change Binding

```bash
# OLD: manual, disconnected
spec-graph change create --title "Add login"

# NEW: auto-bound to story
spec-graph change create --story plan/story#S-001
# change auto-inherits:
#   - title from story title
#   - plan_md from story content
#   - acceptance criteria from story AC
```

Or batch create from all stories:
```bash
spec-graph change create-all-from-stories
# Creates one change per story in plan/story.md
```

#### 2. Dev Loop Engine

New command: `spec-graph dev`

```bash
spec-graph dev <change-id>
```

Dev loop:
1. **coding**: dispatch manifest tells agent to write code
   - Agent writes code
   - Agent runs `spec-graph check --layer unit`
   - If check fails → fix → back to coding
2. **reviewing**: sub-agent reviews code
   - Review feedback
   - If issues → fix → back to coding
   - If approved → proceed to testing
3. **testing**: run all checks (unit + integration)
   - If fail → fix → back to coding
   - If pass → dev loop ends
4. **accept**: mark artifacts complete, transition change

Dev loop ends when:
- All checks pass AND
- Review approved AND
- No issues found

#### 3. FSM Update

OLD:
```
specify → design → plan → implement → review → test → accept → integrate
```

NEW:
```
specify → design → plan → [change loop × N] → integrate
                  ↓
              For each story:
                  change { coding ↔ reviewing ↔ testing } → complete
```

#### 4. Change Lifecycle Update

```
proposed → in_progress → { coding ↔ reviewing ↔ testing } → completed → archived
```

Change status tracks dev loop phase:
- `coding`: agent writing code
- `reviewing`: code under review
- `testing`: running tests
- `fixing`: fixing issues

### Implementation Plan

1. **Extend `change create`** with `--story` flag
2. **Add `change create-all-from-stories`** command
3. **Implement dev loop** in `run` command (or new `dev` command)
4. **Update FSM transitions** to support dev loop
5. **Update skills** documentation

### Backward Compatibility

- Existing `change create` (without --story) still works
- Existing FSM stages still work
- New dev loop is additive, not breaking
