## ADDED Requirements

### Requirement: Eight-stage state machine

The automator SHALL maintain a state machine with eight ordered stages: specify, design, plan, implement, review, test, accept, integrate. Each stage SHALL declare explicit entry criteria and exit criteria in a `gate.yaml` configuration file. The automator SHALL NOT transition to the next stage until the current stage's exit criteria are all satisfied.

#### Scenario: Normal stage progression
- **WHEN** the current stage's exit criteria are all satisfied
- **THEN** the automator SHALL advance to the next stage, record the transition in the trace log with `trigger: "gate-pass"`, reset retry counters, and clear any previous diagnoses

#### Scenario: Blocked progression
- **WHEN** one or more of the current stage's exit criteria are not satisfied
- **THEN** the automator SHALL NOT advance, SHALL produce a structured diagnosis via the gate-enforcement module, and SHALL increment the retry counter

#### Scenario: Stage skip not permitted
- **WHEN** a user attempts to jump from stage N to stage N+2 or beyond
- **THEN** the automator SHALL reject the request with an error message explaining that stages must be traversed sequentially

#### Scenario: Unknown stage
- **WHEN** the state machine is configured with a stage name not in the canonical list of 8
- **THEN** the automator SHALL raise a configuration error at startup and refuse to proceed

### Requirement: Three API surfaces

The automator SHALL expose three API surfaces for driving the workflow:
1. `auto` — a single invocation that runs the full workflow from intent to completion without further user interaction (except the one-time planning confirmation)
2. `stateless` — a set of verb commands (`next-prompt`, `status`, `validate`, `advance`) that external orchestration systems can invoke to drive spec-graph step by step
3. `hook` — integration with external agent hook mechanisms (e.g., Claude Code hooks) so that spec-graph is invoked automatically after each agent action

#### Scenario: Auto mode invocation
- **WHEN** the user runs `spec-graph auto "<intent>"`
- **THEN** the automator SHALL create a session via `startSession`, confirm the plan, and loop: generate prompt → invoke agent → submit result → evaluate gate → advance state. The loop SHALL terminate when all 8 stages are completed, a gate fails after all retry levels are exhausted, or a user interrupt (SIGINT) is received

#### Scenario: Stateless API invocation
- **WHEN** an external system calls `spec-graph next-prompt --json`
- **THEN** the automator SHALL return the XML prompt for the current stage as JSON without modifying state. The response SHALL include: `sessionId`, `stage`, `xml` (the layered prompt), `metadata` (methodology sources, hasPreviousFailure)

#### Scenario: Hook-driven invocation
- **WHEN** a configured agent hook fires after an agent completes a task
- **THEN** the automator SHALL receive the agent's result, validate it via `submitResult`, and advance state if the gate passes

#### Scenario: Auto mode with missing agent
- **WHEN** the configured agent adapter (e.g., `claude-code`) is not installed on the system
- **THEN** the automator SHALL detect this during the first `invokeAgent` call and return a status `agent-not-found` with an actionable error message including install instructions

### Requirement: Session lifecycle

A session SHALL progress through the following states:
- `paused` — initial state after `startSession`, before `confirmPlan`
- `running` — active state after `confirmPlan`
- `completed` — final state when all 8 stages pass their exit criteria
- `failed` — terminal state when recovery is exhausted

#### Scenario: Plan confirmation required before automation
- **WHEN** `nextPrompt` is called on a session in `paused` state
- **THEN** the automator SHALL reject the call with an error: "Plan not confirmed. Run confirmPlan() first"

#### Scenario: Completed session cannot be resumed
- **WHEN** `nextPrompt` is called on a session in `completed` state
- **THEN** the automator SHALL reject the call with an error: "Session is completed"

#### Scenario: Intervene on failed session
- **WHEN** a user calls `intervene` with action `resume` on a `failed` session
- **THEN** the automator SHALL transition the session to `running` state, reset retry counters, and allow `nextPrompt` to proceed

### Requirement: State persistence across restarts

The automator SHALL persist session state to `.spec-graph/sessions/<session-id>/state.yaml` after every state transition, including: stage advancement, retry increment, diagnosis recording, and state change.

#### Scenario: Restart after crash
- **WHEN** the automator process is interrupted and restarted
- **THEN** the automator SHALL load the persisted state from disk, reconstruct the session in memory, and continue from the last successfully completed stage without losing progress

#### Scenario: Resume after user interruption
- **WHEN** the user pauses automation (SIGINT or `intervene`) and later resumes
- **THEN** the automator SHALL resume from where it left off, preserving completed artifacts and trace history

#### Scenario: State file corruption
- **WHEN** the state.yaml file is malformed or missing required fields
- **THEN** the automator SHALL log a warning, initialize a fresh session with the same session-id if possible, and inform the user that prior progress was lost

### Requirement: Trace log for all state transitions

The automator SHALL record every state transition in a trace log with: `timestamp` (ISO 8601), `fromStage` (optional for first transition), `toStage`, `trigger` (gate-pass / user-force / hook / retry), and `result` (pass / fail).

#### Scenario: Query trace history
- **WHEN** the user or a diagnostic tool queries the trace log
- **THEN** the automator SHALL return the full history of state transitions for the session, ordered chronologically

#### Scenario: Trace used for debugging
- **WHEN** a gate failure occurs after multiple retries
- **THEN** the automator SHALL include the retry count and the sequence of failed criteria in the diagnosis, enabling the user or recovery module to identify patterns

### Requirement: Plan generation delegation

The automator's `startSession` SHALL delegate plan generation to the `planning` module, passing the user's intent and project profile. The automator SHALL NOT implement its own plan generation logic (e.g., keyword tables).

#### Scenario: Planning module not available
- **WHEN** the planning module throws an error during `startSession`
- **THEN** the automator SHALL propagate the error to the caller with context about which stage failed

#### Scenario: Plan is deterministic for same intent
- **WHEN** `startSession` is called twice with the same intent
- **THEN** the second call SHALL return the existing plan (not regenerate it)

### Requirement: Progress reporting

The automator SHALL expose a `status(sessionId)` function that returns: `sessionId`, `intent`, `stage` (current), `state` (paused/running/completed/failed), `progress` (currentStageIndex, totalStages, completedArtifacts), `blockers` (list of blocking reasons), and `recentDiagnosis` (most recent gate failure diagnosis if any).

#### Scenario: Status with no active session
- **WHEN** `status` is called without a sessionId
- **THEN** the automator SHALL return a status object with `sessionId: null` and all other fields null or zeroed, indicating no active session

#### Scenario: Status for unknown session
- **WHEN** `status` is called with a sessionId that does not exist on disk or in memory
- **THEN** the automator SHALL return a status with the provided sessionId but null state, indicating the session is unknown
