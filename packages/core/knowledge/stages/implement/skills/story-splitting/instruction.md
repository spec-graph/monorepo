# Story Splitting — implement stage methodology (BMAD style)

## Purpose

Break work into appropriately-sized units based on change complexity. Small changes get simple task lists; large changes get Epic/Story/Task hierarchies. The goal: tasks are small enough to complete in one focused work session.

## Stance

- **Right-size the structure.** A 3-task change doesn't need Epics. A 30-task change does.
- **One story = one user benefit.** Each story delivers a coherent slice of value.
- **Tasks are mechanical.** A task is a single verifiable action.
- **Dependencies are explicit.** If B depends on A, A comes first.

## Sizing Rules

Based on the plan's complexity estimate:

### Small (1-2 capabilities, complexity: low)
```
## Tasks

- [ ] 1.1 <task description>
- [ ] 1.2 <task description>
- [ ] 1.3 <task description>
```

### Medium (3-6 capabilities, complexity: medium)
```
## User Stories

### US-001: <story title>
- [ ] 1.1 <task 1 for story 1>
- [ ] 1.2 <task 2 for story 1>

### US-002: <story title>
- [ ] 2.1 <task 1 for story 2>
- [ ] 2.2 <task 2 for story 2>
```

### Large (7+ capabilities, complexity: high)
```
## Epics

### Epic: <epic title> (serves: US-001, US-002)

#### Story 1.1: <story title>
- [ ] 1.1.1 <task 1>
- [ ] 1.1.2 <task 2>

#### Story 1.2: <story title>
- [ ] 1.2.1 <task 1>
- [ ] 1.2.2 <task 2>

### Epic: <epic title> (serves: US-003)

#### Story 2.1: <story title>
- [ ] 2.1.1 <task 1>
```

## How to Choose

The planning module automatically determines structure based on:

| Complexity | Capabilities | Structure |
|------------|--------------|-----------|
| Low        | 1-2          | Flat tasks |
| Medium     | 3-6          | User Story → Task |
| High       | 7+           | Epic → Story → Task |

## Task Sizing Guidelines

**A good task:**
- Takes 30 minutes to 2 hours
- Is independently verifiable
- Leaves the codebase in a working state
- Has a clear definition of done

**A bad task:**
- "Implement authentication" (too big)
- "Update the imports" (too small, not verifiable)
- "Refactor everything" (not verifiable)

## Story Sizing Guidelines

**A good story:**
- Delivers a coherent slice of user value
- Can be completed in 1-2 days
- Is independently testable
- Maps to 1 User Story from the plan

**A bad story:**
- Combines 3 unrelated user stories
- Can't be demoed without completing 5 other stories
- Maps to multiple user stories

## Epic Sizing Guidelines

**A good epic:**
- Groups related stories
- Delivers a coherent feature
- Can be completed in 1-2 weeks
- Maps to a Capability from the plan

**A bad epic:**
- Contains unrelated stories
- Can't be defined without a paragraph
- Spans multiple releases

## Vertical Slicing

When stories are too big, slice them vertically (end-to-end) rather than horizontally (layer-by-layer):

### Horizontal slicing (BAD):
```
Story 1: Database schema
Story 2: API layer
Story 3: UI layer
Story 4: Tests
```
Problem: Can't demo until all 4 stories are done.

### Vertical slicing (GOOD):
```
Story 1: User can register (schema + API + basic UI + tests)
Story 2: User can log in (schema + API + basic UI + tests)
Story 3: User can reset password (schema + API + basic UI + tests)
```
Benefit: Each story is independently demoable.

## Common Pitfalls

- **Pitfall: All stories are the same size.** If they're all "5 tasks", you probably split at the wrong level.
- **Pitfall: Tasks without acceptance criteria.** Each task should have a verifiable "done" state.
- **Pitfall: Hidden dependencies.** If task 2 can't start until task 1 is done, that's a dependency. Make it explicit.
- **Pitfall: Horizontal slicing.** Resist the urge to split by layer. Slice by user benefit.

## How to Use with spec-graph

In the implement stage:

1. The plan module has already determined complexity
2. The implement prompt includes story-splitting methodology
3. Agent writes tasks.md in the appropriate structure
4. Gate enforcement checks:
   - Small change: flat tasks, no stories
   - Medium change: stories with task sub-lists
   - Large change: epics with story and task hierarchies

## Self-Check Questions

- Is the structure right-sized for the complexity?
- Does each task take 30min-2hr?
- Does each story map to one User Story?
- Are stories sliced vertically (end-to-end)?
- Are dependencies explicit?
