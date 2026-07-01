## ADDED Requirements

### Requirement: Entry and exit criteria evaluation per stage

The gate-enforcement capability SHALL evaluate explicit entry criteria (what must be true to enter a stage) and exit criteria (what must be true to leave a stage) for every stage in the state machine. Each criterion SHALL be a verifiable assertion with a defined verification method.

#### Scenario: Entry criteria check
- **WHEN** the automator is about to enter the design stage
- **THEN** gate-enforcement SHALL verify that entry criteria are met (e.g., "proposal.md exists and passed its gate") before allowing entry

#### Scenario: Exit criteria check
- **WHEN** the automator is about to leave the design stage
- **THEN** gate-enforcement SHALL verify that all exit criteria are met (e.g., "design.md covers every spec requirement", "risks are documented", "technical choices have rationale") before allowing advancement

### Requirement: State transition blocking on failure

When any criterion fails, the gate-enforcement capability SHALL block the state transition and emit a structured failure report. The automator SHALL NOT proceed until all criteria pass or the user explicitly overrides.

#### Scenario: Gate failure halts progression
- **WHEN** exit criteria for the implement stage include "all tests pass" and one test fails
- **THEN** gate-enforcement SHALL block advancement to the review stage and emit a failure report listing the failing test

#### Scenario: User override (rare)
- **WHEN** the user explicitly overrides a failed gate (e.g., via `--force`)
- **THEN** gate-enforcement SHALL record the override in the trace log with the user's justification and allow the transition

### Requirement: Structured diagnosis output

On gate failure, the gate-enforcement capability SHALL produce a structured diagnosis including: the failed criterion identifier, the reason for failure, evidence from the artifact, and a suggested fix. This diagnosis SHALL be machine-readable so the recovery-engine can act on it.

#### Scenario: Diagnosis includes actionable fix
- **WHEN** the design stage gate fails because "design.md does not cover spec 'auth' requirement 'token expiration'"
- **THEN** the diagnosis SHALL identify the specific missing coverage, quote the relevant spec requirement, and suggest adding a "Token Expiration" section to design.md

#### Scenario: Diagnosis consumed by recovery-engine
- **WHEN** the recovery-engine receives a diagnosis
- **THEN** the diagnosis SHALL contain enough information for the recovery-engine to generate a targeted fix prompt without re-analyzing the artifact

### Requirement: Progressive retry strategy

The gate-enforcement capability SHALL implement a four-level progressive retry strategy, configurable per stage:
- Level 1 (lightweight fix): re-prompt with the diagnosis woven in
- Level 2 (swap methodology): use a different methodology from the knowledge-base
- Level 3 (decompose task): split the current task into smaller subtasks
- Level 4 (escalate to user): pause and request human intervention

Each stage SHALL have a configurable maximum retry level (e.g., specify: 2, implement: 5).

#### Scenario: First retry uses lightweight fix
- **WHEN** a gate fails for the first time
- **THEN** gate-enforcement SHALL trigger Level 1 retry, instructing the recovery-engine to re-prompt with the diagnosis

#### Scenario: Repeated failures escalate
- **WHEN** Level 1 and Level 2 retries both fail
- **THEN** gate-enforcement SHALL escalate to Level 3 (decompose task) or Level 4 (escalate to user) depending on configuration

### Requirement: Similarity detection

The gate-enforcement capability SHALL compare each new failure diagnosis against recent previous diagnoses. If the new diagnosis is substantially similar to a previous one (same root cause), the capability SHALL skip lower retry levels and escalate immediately.

#### Scenario: Repeated same failure detected
- **WHEN** Level 1 retry produces a failure with the same diagnosis as the original failure
- **THEN** gate-enforcement SHALL skip further Level 1 retries and escalate to Level 2 or higher

#### Scenario: Different failure treated independently
- **WHEN** a new failure has a substantially different diagnosis from previous failures
- **THEN** gate-enforcement SHALL start the retry strategy from Level 1

### Requirement: Configurable retry limits per stage

The gate-enforcement capability SHALL allow per-stage configuration of maximum retry attempts and maximum retry level. This prevents infinite retry loops on inherently problematic tasks.

#### Scenario: Stage retry limit reached
- **WHEN** the implement stage is configured with max 5 retries and the 5th retry fails
- **THEN** gate-enforcement SHALL escalate to the user regardless of retry level

#### Scenario: Total time limit
- **WHEN** a stage has consumed more than a configured time budget
- **THEN** gate-enforcement SHALL halt retries and escalate to the user
