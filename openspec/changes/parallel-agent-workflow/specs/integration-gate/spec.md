## ADDED Requirements

### Requirement: Three-level integration gate

The integration-gate module SHALL enforce three levels of gate evaluation for parallel execution. All three levels must pass for parallel execution to be considered successful.

#### Scenario: All three levels pass
- **WHEN** sub-agents complete, merge gate passes, and system gate passes
- **THEN** the parallel wave SHALL be marked as successful

#### Scenario: Individual gate fails
- **WHEN** a sub-agent's output fails the individual gate
- **THEN** only that sub-agent SHALL retry (not the entire wave)

#### Scenario: Merge gate fails
- **WHEN** merging a worktree into main fails (conflict)
- **THEN** the merge-queue SHALL pause, analyze conflict source, and either resolve or degrade to serial

#### Scenario: System gate fails
- **WHEN** the final merged output fails the system gate (inconsistent style, broken integration)
- **THEN** parallel-recovery SHALL analyze which sub-agent's output caused the failure

### Requirement: Individual gate parity with serial gate

The individual gate SHALL use the same gate criteria as the serial gate. A sub-agent's output must satisfy the same criteria as if it were executed serially.

#### Scenario: Same criteria as serial
- **WHEN** a sub-agent produces output for the design stage
- **THEN** the individual gate SHALL check the same criteria (design-rationale, design-risks, etc.) as in serial mode

### Requirement: Merge gate conflict analysis

The merge gate SHALL analyze any conflict between a worktree and main. It SHALL identify which files conflict and which sub-agent wrote to them.

#### Scenario: Conflict identified
- **WHEN** worktree A and worktree B both modified `src/auth.ts`
- **THEN** the merge gate SHALL report "conflict between sub-agent A and B on src/auth.ts"

#### Scenario: Clean merge
- **WHEN** worktree A modifies `src/auth/` and worktree B modifies `src/books/`
- **THEN** the merge gate SHALL pass

### Requirement: System gate integration checks

The system gate SHALL check cross-sub-agent integration: style consistency, naming consistency, and integration test pass (if available).

#### Scenario: Style inconsistency
- **WHEN** sub-agent A uses camelCase and sub-agent B uses snake_case
- **THEN** the system gate SHALL fail with "style inconsistency detected"

#### Scenario: Integration test fail
- **WHEN** integration tests fail after all worktrees are merged
- **THEN** the system gate SHALL fail and invoke parallel-recovery for analysis
