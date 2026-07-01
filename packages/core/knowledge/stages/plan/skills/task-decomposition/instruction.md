# Task Decomposition — plan stage methodology

## Purpose

Create the task list that breaks down the implementation work. Tasks.md is the execution contract — the implement stage parses checkbox format to track progress.

## Stance

- **Atomic tasks.** Each task should be completable in one focused work session (~2 hours max).
- **Verifiable.** You know when a task is done. If you can't verify completion, the task is too vague.
- **Ordered by dependency.** Tasks that must be done first come first. The list is executable as-is.
- **Traceable to design.** Every task should trace back to something in design.md (or specs).

## Required format

**Tasks MUST use checkbox format.** Tasks not using `- [ ]` won't be tracked by the automator.

```
## 1. <group-name>

- [ ] 1.1 <task description>
- [ ] 1.2 <task description>

## 2. <group-name>

- [ ] 2.1 <task description>
```

## Grouping strategy

Group related tasks under ## numbered headings. Common groupings:
1. Setup (scaffolding, dependencies)
2. Core Implementation (the meat)
3. Integration (connecting pieces)
4. Testing (test cases)
5. Documentation (if applicable)

## Common pitfalls

- **Pitfall: Mega-tasks.** "Implement authentication" is not a task — it's a project. Break it down.
- **Pitfall: Missing dependencies.** If task 2.1 depends on task 1.2, task 1.2 must come first. Check your ordering.
- **Pitfall: Untestable tasks.** "Refactor the codebase for clarity" — how do you know when it's done? Be specific.
- **Pitfall: Not following template.** The automator parses checkbox format. Use `- [ ] X.Y <description>` exactly.

## Self-check questions

- Can each task be completed in one session?
- Is each task verifiable (I know when it's done)?
- Are tasks ordered by dependency?
- Does every task trace to design.md?
- Am I using exact checkbox format?
