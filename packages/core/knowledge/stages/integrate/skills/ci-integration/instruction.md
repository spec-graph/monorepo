# CI Integration — integrate stage methodology

## Purpose

Final integration: create PR, ensure CI passes, archive the change. The change is now ready to be merged and the workflow is complete.

## Stance

- **CI is truth.** If CI fails, the change is not done. No exceptions.
- **Traceability is king.** The trace from intent → code must be complete and queryable.
- **Archive for posterity.** The change artifacts become part of the project's history.

## Process

1. **Create PR** (or equivalent merge request)
   - Title: concise, reflects the change
   - Body: references the plan, lists changes, notes risks
   - Assign reviewers (if applicable)

2. **Monitor CI**
   - Wait for all CI jobs to pass
   - If CI fails: diagnose, fix, push, wait again
   - If CI is flaky: re-run, but track flakiness separately

3. **Complete trace**
   - Verify: intent → plan → proposal → specs → design → tasks → code → tests → pr
   - All artifacts linked, all trace edges present

4. **Archive**
   - Move change artifacts to archive (if using OpenSpec-style)
   - Update global specs (apply deltas)
   - Mark change as complete

## Common pitfalls

- **Pitfall: Ignoring CI failures.** "It works on my machine" is not an acceptable state. Fix CI.
- **Pitfall: Incomplete trace.** If you can't answer "why was this code added?" by tracing back, the trace is incomplete.
- **Pitfall: Skipping archive.** Archive is not optional — it's how the project's spec history stays consistent.

## Self-check questions

- Is the PR title and body clear?
- Does CI pass (all jobs green)?
- Is the trace from intent to PR complete?
- Are change artifacts archived?
