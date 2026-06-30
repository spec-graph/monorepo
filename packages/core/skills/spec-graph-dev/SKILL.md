---
name: spec-graph-dev
description: "Development loop engine. Independent top-level command that drives the coding→reviewing→testing iterative cycle for an active in_progress change. Finds the active change, loads linked story context, and loops through coding (unit tests), reviewing (code quality), and testing (full suite) phases until all checks pass or max iterations reached. Use when implementing a change that has been applied."
---

# spec-graph dev

Development loop engine. Drives the coding → reviewing → testing cycle for an active change.

## Architecture Principle

**spec-graph does NOT write code or run the dev loop autonomously. It is a state tracker and instruction engine.**

- ❌ spec-graph does not write implementation code
- ❌ spec-graph does not run code review or make review decisions
- ❌ spec-graph does not auto-fix test failures
- ✅ spec-graph finds the active `in_progress` change
- ✅ spec-graph loads linked story context for agent guidance
- ✅ spec-graph drives the phase cycle and checks test results
- ✅ spec-graph tracks iteration count and stops at max iterations

**The AI agent performs the actual work.** Agent writes code in the coding phase, reviews quality in the reviewing phase, and runs the full suite in the testing phase. spec-graph manages the phase transitions and iteration counts.

## What this does

Dev is the **independent top-level development loop command** (not a subcommand of change). It orchestrates:

1. **Find active change** — scans `.spec-graph/changes/` for a change with `status: in_progress`
2. **Load linked story** — if the change has a `linked_story`, extracts story context from plan artifacts
3. **Run dev loop** — iterates through three phases until all checks pass or max iterations reached:
   - **Coding**: agent writes code → runs unit tests → unit pass → advance to reviewing
   - **Reviewing**: agent performs code quality review → advance to testing (or skip with `--skip-review`)
   - **Testing**: full test suite (unit + integration) → all pass → loop complete; any fail → back to coding
4. **Complete** — when all phases pass, suggests `spec-graph change complete <id>`

## Usage

```bash
# Standard: auto-find active change and run dev loop
spec-graph dev

# Target a specific change
spec-graph dev --change <change-id>

# Skip the code review phase
spec-graph dev --skip-review

# Limit iterations (default: 10)
spec-graph dev --max-iterations 5

# Combination
spec-graph dev --change CHANGE-001 --skip-review --max-iterations 3
```

### Options

| Option | Description |
|--------|-------------|
| `--change <id>` | Target a specific change by ID (default: auto-find the first `in_progress` change) |
| `--skip-review` | Skip the reviewing phase entirely — go directly from coding to testing |
| `--max-iterations <n>` | Maximum loop iterations before manual intervention (default: 10) |

## Execution Rules

### ✅ When to use

- **Change is applied and in_progress**: `spec-graph change apply` completed, ready to implement
- **Implementation phase of any change-type**: feature, bugfix, refactor, etc. — all use dev for the coding loop
- **After manual code fixes**: agent made changes, wants to re-enter the dev loop for verification
- **Continuous development**: agent runs dev repeatedly until the loop succeeds
- **Sub-agent handoff**: coordinator dispatches implementation sub-agent → sub-agent runs dev for its change

### ❌ When NOT to use

- **No active change**: dev exits with "No active change found" — create and apply one first
- **Change not in_progress**: dev requires `status: in_progress` — run `spec-graph change apply <id>` first
- **Plan stage still active**: dev is for implementation, not planning — run `spec-graph plan` first
- **As a background loop**: dev runs synchronously — the agent drives each iteration, not a daemon

## Agent Workflow: Code → Test → Review → Full Test → Repeat

### Step 1: Verify change state

Dev auto-finds the active change. Agent should verify:

```bash
spec-graph status
```

Confirm the active change is in_progress and implementation is the right next step.

### Step 2: Start dev loop

```bash
spec-graph dev
# or with options:
spec-graph dev --change CHANGE-001 --max-iterations 5
```

### Step 3: Coding Phase

Dev prints:
```
Phase: CODING
Agent: Write/modify code for this change
Agent: spec-graph dispatch
Agent: spec-graph check --layer unit
```

Agent actions:
1. Read linked story context (requirements printed by dev)
2. Write/modify implementation code
3. Run unit tests via `spec-graph check --layer unit`
4. If unit tests pass → dev auto-advances to reviewing
5. If unit tests fail → agent fixes code and re-runs `spec-graph dev` (retry)

### Step 4: Reviewing Phase

Dev prints:
```
Phase: REVIEWING
Agent: Review code quality
Agent: spec-graph review --artifact <id>
```

Agent actions:
1. Review code for quality, correctness, and standards compliance
2. Run `spec-graph review --artifact <id>` if formal review is configured
3. If issues found → fix code → re-run `spec-graph dev`
4. If review passes → dev auto-advances to testing

With `--skip-review`, this phase is bypassed entirely.

### Step 5: Testing Phase

Dev prints:
```
Phase: TESTING
Running full test suite...
```

Agent actions:
1. Dev automatically runs unit + integration checks
2. If all pass → loop complete → run `spec-graph change complete <id>`
3. If any fail → agent fixes issues → dev resets to coding phase

### Step 6: Loop Complete

```
✅ Dev loop completed!
Next: spec-graph change complete CHANGE-001
```

Agent runs `spec-graph change complete <id>` to finalize the change.

### Max Iterations Reached

```
Max iterations (10) reached
Agent: Manual intervention required
```

Agent must assess why the loop did not converge:
- Is the requirement unclear? → re-open story/plan
- Are tests flaky? → fix test infrastructure
- Is the change too large? → split into smaller changes
- Is there a fundamental design issue? → re-open architecture

## Usage Scenarios

### Scenario 1: Standard feature implementation

```bash
$ spec-graph dev

 Dev Loop: Add user authentication
  Story: S-004
  Change: CHANGE-003

  ── Iteration 1 / 10 ──

   Phase: CODING
  Agent: Write/modify code for this change
  Agent: spec-graph dispatch
  Agent: spec-graph check --layer unit
  ✓ Unit tests passed

   Phase: REVIEWING
  Agent: Review code quality
  Agent: spec-graph review --artifact <id>
  (Automated review pending sub-agent integration)

  🧪 Phase: TESTING
  Running full test suite...
  ✓ All tests passed

  ✅ Dev loop completed!
  Next: spec-graph change complete CHANGE-003
```

### Scenario 2: Test failure → fix → retry

```bash
$ spec-graph dev

  ── Iteration 1 / 10 ──

   Phase: CODING
  ...
  ✗ Unit tests failed: unit-auth, unit-session
  → Agent: Fix code
  Agent: spec-graph dev (retry)
```

Agent fixes the failing code, re-runs `spec-graph dev`. Dev starts a new iteration from coding phase.

### Scenario 3: Full suite fails after unit pass

```bash
$ spec-graph dev

  ── Iteration 2 / 10 ──

   Phase: CODING
  ✓ Unit tests passed

   Phase: REVIEWING
  (Review skipped)

  🧪 Phase: TESTING
  Running full test suite...
  ✗ Tests failed: integration-db
  → Agent: Fix issues
```

Agent fixes the integration issue. Dev resets to coding phase for the next iteration.

### Scenario 4: Skipping review for rapid iteration

```bash
spec-graph dev --skip-review --max-iterations 20
```

Useful for rapid prototyping where formal review is deferred. Direct coding → testing loop.

### Scenario 5: No active change found

```bash
$ spec-graph dev
✗ No active change found
  Create one: spec-graph change create
  Apply it: spec-graph change apply <id>
```

Agent must first create and apply a change before dev can run.

### Scenario 6: Change not in_progress

```bash
$ spec-graph dev --change CHANGE-005
✗ Change 'CHANGE-005' is 'prepared', not 'in_progress'
  Apply it first: spec-graph change apply CHANGE-005
```

Agent must apply the change to move it to in_progress.

### Scenario 7: Max iterations — investigation needed

```bash
$ spec-graph dev --max-iterations 3

  ── Iteration 1 / 3 ──
  ✗ Unit tests failed: ...
  ── Iteration 2 / 3 ──
  ✗ Unit tests failed: ...
  ── Iteration 3 / 3 ──
  ✗ Tests failed: ...

   Max iterations (3) reached
  Agent: Manual intervention required
```

Agent should escalate: analyze the root cause, present findings to user, and propose a path forward (fix tests, re-scope change, re-open requirements).

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `No active change found` | No change with `status: in_progress` | Create change: `spec-graph change create`, then apply: `spec-graph change apply <id>` |
| `Change not found: <id>` | `--change` specified an ID that doesn't exist in `.spec-graph/changes/` | Check change ID with `spec-graph status` or `ls .spec-graph/changes/` |
| `Change '<id>' is '<status>', not 'in_progress'` | Change exists but hasn't been applied | Run `spec-graph change apply <id>` |
| Unit test failures | Code doesn't meet unit test expectations | Agent fixes code, re-runs dev |
| Full test suite failures | Integration or broader test failures even though unit tests pass | Agent fixes integration issues, re-runs dev |
| `Max iterations reached` | Dev loop couldn't converge within the limit | Investigation required: analyze root cause, escalate to user if needed |

## 衔接关系 (Transition Relationships)

- **前置 (prerequisite)**: `spec-graph change apply <id>` — change must be in_progress
- **前置 (prerequisite)**: `spec-graph plan` — plan stage should be complete (all plan artifacts produced)
- **前置 (prerequisite)**: `spec-graph dispatch` — dispatch should confirm the current action is implementation
- **后续 (follow-up)**: `spec-graph change complete <id>` — run when dev loop completes successfully
- **后续 (follow-up)**: `spec-graph change archive <id>` — archive the completed change
- **循环搭配 (loop pair)**: agent iterates `dev` → fix → `dev` → fix → ... until success
- **审查搭配 (review pair)**: `spec-graph review --artifact <id>` — formal review within the reviewing phase
- **检查搭配 (check pair)**: `spec-graph check --layer unit` and `spec-graph check --layer unit,integration` — invoked internally by dev but can also be run standalone by agent

## Dev State Tracking

Dev maintains its own state in `.spec-graph/dev-state.json` (persisted across invocations):

- Current iteration count
- Current phase (coding | reviewing | testing)
- Linked change ID
- Last test results (unit + full suite)

This allows the agent to re-enter the loop after fixing issues without losing context. The state is reset when dev completes successfully or when a different change is targeted.

## Relationship to Change Lifecycle

Dev is positioned in the change lifecycle as follows:

```
change create → change apply → ★ dev ★ → change complete → change archive
                                   ↑______________|
                                   (loop until pass)
```

Dev is the **implementation execution** phase. It is not responsible for:
- Requirements (handled in plan stage)
- Architecture decisions (handled in design stage)
- Final acceptance (handled by `spec-graph check` gate logic)
- Deployment (handled by coordinator hooks)
