## ADDED Requirements

### Requirement: Precise failure attribution

The parallel-recovery module SHALL analyze failures to determine which sub-agent's output caused the failure. Attribution SHALL be precise: identify specific sub-agent and specific issue.

#### Scenario: Single sub-agent failure
- **WHEN** only sub-agent A's output has a problem
- **THEN** parallel-recovery SHALL identify sub-agent A as the cause and only retry sub-agent A

#### Scenario: Multiple sub-agent failure
- **WHEN** both sub-agent A and sub-agent B have issues
- **THEN** parallel-recovery SHALL identify both as causes and retry both

#### Scenario: Cannot attribute
- **WHEN** the failure cannot be attributed to any specific sub-agent
- **THEN** parallel-recovery SHALL recommend degradation to serial mode

### Requirement: Targeted recovery

The parallel-recovery module SHALL apply the minimal recovery necessary:
- Individual gate failure → retry the specific sub-agent
- Merge conflict → analyze conflict, resolve or degrade
- System gate failure → targeted retry of failing sub-agents, or full wave retry, or degrade to serial

#### Scenario: Minimal recovery
- **WHEN** sub-agent A fails individual gate but B passes
- **THEN** ONLY sub-agent A SHALL retry; sub-agent B's work SHALL be preserved

#### Scenario: Merge conflict resolution
- **WHEN** merge conflict between A and B
- **THEN** parallel-recovery SHALL analyze the conflict and either:
  - Resolve via rebase (if A is ahead of B)
  - Serialize A and B (if both are needed)
  - Degrade wave to serial

### Requirement: Automatic degradation

The parallel-recovery module SHALL automatically degrade parallel execution to serial execution when:
- Attribution fails
- Multiple retries fail
- System gate fails repeatedly

#### Scenario: Degradation triggered
- **WHEN** a wave has 3+ failures in the same sub-agent
- **THEN** parallel-recovery SHALL recommend degrading to serial

#### Scenario: Degradation preserves work
- **WHEN** degradation to serial is triggered
- **THEN** all completed work (including successful sub-agents' merged output) SHALL be preserved

### Requirement: Failure logging

The parallel-recovery module SHALL log all failures with:
- Which sub-agent failed
- Which gate level failed
- Root cause (if determinable)
- Recovery action taken
- Final outcome

#### Scenario: Failure trace
- **WHEN** sub-agent A fails integration gate
- **THEN** the log SHALL contain: "sub-agent A failed system-gate due to style inconsistency, retried once, success"
