# Retrospective — integrate stage methodology

## Purpose

After integration, reflect on the completed change: what went well, what could be improved, and what lessons to carry forward. A retrospective closes the feedback loop and improves future changes.

## Stance

- **Blameless.** Focus on process, not people. "What happened" not "Who did it."
- **Actionable.** Every retrospective should produce at least one concrete improvement.
- **Brief.** A good retro doesn't need to be long. 15-30 minutes is enough.
- **Repeatable.** Use the same format every time so the team knows what to expect.

## Format: Start / Stop / Continue

### Start (what should we start doing?)
- New practices that would improve quality or speed
- Tools or processes that were missing

### Stop (what should we stop doing?)
- Ineffective practices that wasted time
- Approaches that introduced bugs

### Continue (what should we keep doing?)
- Practices that worked well
- Patterns worth repeating

## Questions to Answer

### Completion
- [ ] Were all tasks completed? If not, what's left?
- [ ] Were all acceptance criteria met? If not, which ones?
- [ ] Did the change require scope adjustment? Why?

### Quality
- [ ] How many gate failures occurred? What was the root cause?
- [ ] How many retries were needed? Could they have been avoided?
- [ ] Were any bugs found after review? What kind?

### Process
- [ ] How long did the change take? Was it faster or slower than estimated?
- [ ] Was the plan accurate? Were capabilities correctly identified?
- [ ] Did any stage take disproportionately long? Why?

### Agent Performance (for AI-assisted development)
- [ ] Did the agent produce quality output on the first attempt?
- [ ] Were gate failures due to agent misunderstanding or unclear criteria?
- [ ] Which methodologies helped the agent most? Which were unused?

## Output Format

```markdown
# Retrospective: <change-title>

## Summary
- Duration: <hours/days>
- Completed tasks: <N>/<total>
- Gate failures: <N>
- Retries: <N>

## Start
- <action item 1>
- <action item 2>

## Stop
- <action item 1>

## Continue
- <action item 1>
- <action item 2>

## Learnings Applied from Past Retros
- <if any>

## New Learnings for Future Changes
- <concrete, actionable lessons>
```

## Action Items

For each "Start" or "Stop" item, create a concrete action:
- What: specific change to make
- Who: who will do it (or "next session")
- When: by when (or "next session")

## Common Pitfalls

- **Pitfall: Retro without action items.** If the retro doesn't produce changes, it's just complaining.
- **Pitfall: Too many action items.** 2-3 is enough. More than 5 and nothing gets done.
- **Pitfall: Skipping the retro.** "The change was small" is not a reason to skip. Small changes have learnings too.
- **Pitfall: Only listing negatives.** Celebrate what went well. It reinforces good practices.

## Self-Check Questions

- Did I identify at least one "Start" and one "Continue"?
- Are action items concrete (not "improve quality" but "add lint rule for X")?
- Did I review the gate failure history for patterns?
- Did I identify which methodologies helped the agent most?
