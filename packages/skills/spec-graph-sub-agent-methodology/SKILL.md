---
name: spec-graph-sub-agent-methodology
description: Guide the host agent on what each sub-agent must do during parallel execution. Covers complete development workflow: code, tests, lint, typecheck, build, self-review, functionality verification.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Standards for each sub-agent during parallel execution.

## Each sub-agent must complete

### 1. Code
- Follow project coding conventions (see context-sharing)
- Write clear, maintainable code
- Add JSDoc/docstrings to public APIs
- No dead code or commented-out blocks

### 2. Unit Tests
- Cover core logic and edge cases
- Use project's test framework (vitest, jest, etc.)
- Test names describe behavior
- Coverage should be reasonable for the change

### 3. Lint + Typecheck
- All lint rules pass (no warnings on new code)
- All typecheck errors fixed
- Use the project's lint/typecheck commands

### 4. Build
- Project builds successfully
- All dependencies installed
- No build warnings on new code

### 5. Code Self-Review
Before submitting, the sub-agent should:
- Read through their own diff
- Check for: unused imports, dead code, magic numbers
- Verify naming follows project conventions
- Look for potential bugs or edge cases missed

### 6. Functionality Verification
- All spec scenarios pass
- Edge cases handled
- Error cases handled
- Return values correct

## All six must pass for Level 1 (Individual) gate

If any check fails, the sub-agent must retry that specific check before submitting.

## Self-check questions for sub-agent

Before reporting completion:
1. Did I add tests for the new logic?
2. Do all existing tests still pass?
3. Is the code lint-clean?
4. Are there any typecheck errors?
5. Did I run the full test suite?
6. Does my code match the spec scenarios?
