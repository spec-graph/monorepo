## ADDED Requirements

### Requirement: Eight-stage state machine

The automator SHALL maintain a state machine with eight ordered stages: specify, design, plan, implement, review, test, accept, integrate. Each stage SHALL declare explicit entry criteria and exit criteria. The automator SHALL NOT transition to the next stage until the current stage's exit criteria are satisfied.

#### Scenario: Normal stage progression
- **WHEN** the current stage's exit criteria are all satisfied
- **THEN** the automator SHALL advance to the next stage and record the transition in the trace log

#### Scenario: Blocked progression
- **WHEN** the current stage's exit criteria are not all satisfied
- **THEN** the automator SHALL NOT advance and SHALL trigger the gate-enforcement capability

### Requirement: Three API surfaces

The automator SHALL expose three API surfaces for driving the workflow:
1. `auto` — a single command that runs the full workflow from intent to completion with no further user intervention
2. `stateless` — a set of verb commands (`next-prompt`, `status`, `validate`, `advance`) that external orchestration systems can invoke to drive spec-graph step by step
3. `hook` — integration with external agent hook mechanisms (e.g., Claude Code hooks) so that spec-graph is invoked automatically after each agent action

#### Scenario: Auto mode invocation
- **WHEN** the user runs `spec-graph auto "<intent>"`
- **THEN** the automator SHALL execute the full workflow from planning through integrate without requiring further user input (except the one-time planning confirmation)

#### Scenario: Stateless API invocation
- **WHEN** an external system calls `spec-graph next-prompt --json`
- **THEN** the automator SHALL return the prompt for the current stage as JSON without modifying state

#### Scenario: Hook-driven invocation
- **WHEN** a configured agent hook fires after an agent completes a task
- **THEN** the automator SHALL validate the result, evaluate the gate, and advance state if appropriate

### Requirement: State persistence across restarts

The automator SHALL persist the current state machine state, completed artifacts, and trace log to disk. After a restart, the automator SHALL resume from the last persisted state.

#### Scenario: Restart after crash
- **WHEN** the automator process is interrupted and restarted
- **THEN** the automator SHALL load persisted state and continue from the last successfully completed stage

#### Scenario: Resume after user interruption
- **WHEN** the user pauses automation and later resumes
- **THEN** the automator SHALL resume from where it left off without losing progress

### Requirement: Single-loop automatic progression

In `auto` mode, the automator SHALL execute a single loop that iterates through all stages until integration completes or a non-recoverable error occurs. The loop SHALL NOT require manual re-invocation between stages.

#### Scenario: End-to-end automatic run
- **WHEN** the user invokes `spec-graph auto "<intent>"` and confirms the plan
- **THEN** the automator SHALL progress through specify → design → plan → implement → review → test → accept → integrate automatically, producing all artifacts and delegating all execution to external agents

#### Scenario: Non-recoverable error
- **WHEN** the recovery-engine exhausts all retry levels and escalation fails
- **THEN** the automator SHALL halt and produce a diagnosis report for the user

### Requirement: Trace log for all state transitions

The automator SHALL record every state transition, including the from-stage, to-stage, trigger (gate pass / user action / hook event), and timestamp, in a persistent trace log.

#### Scenario: Query trace history
- **WHEN** the user or a diagnostic tool queries the trace log
- **THEN** the automator SHALL return the full history of state transitions for the current change
