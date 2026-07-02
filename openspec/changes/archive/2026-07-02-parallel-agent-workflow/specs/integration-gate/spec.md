## ADDED Requirements

### Requirement: Three-level integration gate

The integration-gate module SHALL enforce three levels of gate evaluation for parallel execution. **All three levels must pass** for parallel execution to be considered successful. Any single level failure triggers recovery or degradation.

#### Scenario: All three levels pass
- **WHEN** sub-agents complete, merge gate passes, and system gate passes
- **THEN** the parallel wave SHALL be marked as successful

#### Scenario: Individual gate fails
- **WHEN** a sub-agent's output fails the individual gate (tests fail, lint errors, typecheck errors, build fails, self-review issues, or functionality misalignment)
- **THEN** only that sub-agent SHALL retry (not the entire wave)

#### Scenario: Merge gate fails
- **WHEN** merging a worktree into main fails (conflict)
- **THEN** the merge-queue SHALL pause, analyze conflict source, and either resolve or degrade to serial

#### Scenario: System gate fails
- **WHEN** the final merged output fails the system gate (inconsistent style, broken integration)
- **THEN** parallel-recovery SHALL analyze which sub-agent's output caused the failure

### Requirement: Individual gate includes complete development standards

The individual gate SHALL verify that the sub-agent has completed the full development workflow, not just written code. This includes: unit tests, lint, typecheck, build, self-review, and functionality verification against specs.

#### Scenario: Tests must pass
- **WHEN** a sub-agent produces code but no tests
- **THEN** the individual gate SHALL fail with "unit tests missing"

#### Scenario: Lint errors
- **WHEN** a sub-agent's code has lint errors
- **THEN** the individual gate SHALL fail with "lint errors present"

#### Scenario: Typecheck errors
- **WHEN** a sub-agent's code has type errors
- **THEN** the individual gate SHALL fail with "typecheck errors"

#### Scenario: Build fails
- **WHEN** the code cannot build
- **THEN** the individual gate SHALL fail with "build failed"

#### Scenario: Self-review required
- **WHEN** a sub-agent skips self-review
- **THEN** the individual gate SHALL fail with "self-review missing"

#### Scenario: Functionality misalignment
- **WHEN** the code doesn't align with the spec scenarios
- **THEN** the individual gate SHALL fail with "functionality doesn't match specs"

### Requirement: Individual gate parity with serial gate

The individual gate SHALL use the same gate criteria as the serial gate. A sub-agent's output must satisfy the same criteria as if it were executed serially.

#### Scenario: Same criteria as serial
- **WHEN** a sub-agent produces output for the design stage
- **THEN** the individual gate SHALL check the same criteria (design-rationale, design-risks, etc.) as in serial mode

### Requirement: Merge gate includes post-merge validation

The merge gate SHALL verify that after each worktree is merged to main, the entire codebase still passes all development standards: tests, lint, typecheck, build, and code review.

#### Scenario: Post-merge tests must pass
- **WHEN** worktree A is merged into main
- **THEN** all tests in main (including A's tests and existing tests) SHALL pass

#### Scenario: Post-merge lint must pass
- **WHEN** worktree A is merged into main
- **THEN** lint on main SHALL pass with no errors

#### Scenario: Post-merge build must pass
- **WHEN** worktree A is merged into main
- **THEN** build on main SHALL succeed

#### Scenario: Post-merge review required
- **WHEN** worktree A is merged into main
- **THEN** code review on merged code SHALL pass (no critical issues)

#### Scenario: Post-merge functionality must pass
- **WHEN** worktree A is merged into main
- **THEN** functionality verification against specs SHALL pass

### Requirement: System gate includes integration validation

The system gate SHALL verify the final merged state across all sub-agents: integration tests, cross-agent consistency, end-to-end verification, and comprehensive code review.

#### Scenario: Integration tests must pass
- **WHEN** all worktrees are merged into main
- **THEN** integration tests (cross-sub-agent) SHALL pass

#### Scenario: Style consistency required
- **WHEN** sub-agent A uses camelCase and sub-agent B uses snake_case
- **THEN** the system gate SHALL fail with "style inconsistency detected"

#### Scenario: Integration test fail
- **WHEN** integration tests fail after all worktrees are merged
- **THEN** the system gate SHALL fail and invoke parallel-recovery for analysis

#### Scenario: E2E tests required
- **WHEN** the project has E2E tests defined
- **THEN** E2E tests SHALL pass after all merges

#### Scenario: Comprehensive review required
- **WHEN** all worktrees are merged
- **THEN** comprehensive code review (including cross-sub-agent interactions) SHALL pass
