# Code Generation — implement stage methodology

## Purpose

Implement the tasks defined in tasks.md, following the design in design.md, satisfying the specs.

## Stance

- **Follow the plan.** tasks.md is your execution contract. Work through it in order.
- **Respect the design.** Technical decisions made in design.md are binding. If you disagree, raise it — don't silently deviate.
- **Satisfy the specs.** Every spec requirement should have corresponding implementation.
- **Minimal changes.** Don't refactor unrelated code. Don't add features not in the plan.
- **Test as you go.** Each task should leave the codebase in a working state.

## Implementation principles

1. **Read before write.** Understand the surrounding code before changing it.
2. **Small, focused commits.** (If applicable to your workflow.)
3. **Follow project conventions.** Match the existing code style, naming, patterns.
4. **Error handling is not optional.** Every external call needs error handling.
5. **Document as you go.** If a piece of code is non-obvious, add a comment. If a function is public, add a docstring.

## Common pitfalls

- **Pitfall: Gold-plating.** Stick to the plan. If you think something else should be done, raise it as a separate change.
- **Pitfall: Ignoring project conventions.** If the project uses tabs, use tabs. If it uses a specific naming convention, follow it.
- **Pitfall: Breaking existing tests.** If your change breaks a pre-existing test, you've introduced a regression. Fix it before moving on.
- **Pitfall: Untested code.** If it's not tested, it's not done. At minimum, exercise the happy path.

## Working through tasks

For each task:
1. Mark it as in-progress (if your workflow supports it)
2. Implement the change
3. Verify: does the task's acceptance criteria pass?
4. Run lint/typecheck/tests
5. Mark task complete (- [x])
6. Move to next task

## Self-check questions

- Did I complete every task?
- Does lint/typecheck/build all pass?
- Do all existing tests still pass?
- Did I follow project conventions?
- Did I respect design decisions?
