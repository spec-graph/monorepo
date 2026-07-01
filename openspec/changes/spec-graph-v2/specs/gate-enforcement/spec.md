## ADDED Requirements

### Requirement: Gate configuration loading

The gate-enforcement capability SHALL load gate configuration from `knowledge/stages/<stage>/gate.yaml` for each stage. If the file is missing, a built-in fallback configuration SHALL be used.

#### Scenario: Standard gate loaded
- **WHEN** `loadGateConfig` is called for a stage that has a `gate.yaml`
- **THEN** the returned config SHALL have `entry` and `exit` arrays with criteria parsed from the YAML

#### Scenario: Missing gate.yaml
- **WHEN** `loadGateConfig` is called for a stage without a `gate.yaml` file
- **THEN** the returned config SHALL be a built-in fallback with `entry: [previous-stage-passed]` and `exit: [artifacts-exist]`

#### Scenario: Malformed YAML
- **WHEN** the gate.yaml file contains invalid YAML syntax
- **THEN** the parser SHALL fall back to the built-in configuration and log a warning

### Requirement: Entry criteria evaluation

The gate-enforcement capability SHALL evaluate all entry criteria for a stage before allowing the stage to begin. If any entry criterion fails, the stage SHALL NOT begin.

#### Scenario: Entry criteria pass
- **WHEN** all entry criteria for the design stage are satisfied
- **THEN** the stage SHALL be allowed to begin, and the automator SHALL generate a prompt

#### Scenario: Entry criteria fail
- **WHEN** an entry criterion fails (e.g., previous stage not passed)
- **THEN** the stage SHALL NOT begin, and a structured error SHALL be returned to the caller

### Requirement: Exit criteria evaluation

The gate-enforcement capability SHALL evaluate all exit criteria for a stage when a result is submitted. If all exit criteria pass, the stage SHALL be marked complete and the automator SHALL advance to the next stage.

#### Scenario: All exit criteria pass
- **WHEN** all exit criteria for the specify stage are satisfied by the submitted proposal.md
- **THEN** the automator SHALL mark the stage complete and advance to design

#### Scenario: One exit criterion fails
- **WHEN** one or more exit criteria fail
- **THEN** the automator SHALL NOT advance, SHALL produce a diagnosis listing all failed criteria, and SHALL increment the retry counter

### Requirement: Verification methods

Each criterion SHALL have a verification method: `rule` | `traceability` | `llm-judge` | `downstream-executability` | `human`. The gate-enforcement capability SHALL dispatch to the appropriate verification implementation.

#### Scenario: Rule verification
- **WHEN** a criterion has verification method `rule`
- **THEN** the gate-enforcement SHALL use the registered rule handler (from the `KNOWN_RULES` map) to evaluate it. If no handler is registered, the criterion SHALL pass with a warning "skipped"

#### Scenario: Traceability verification
- **WHEN** a criterion has verification method `traceability`
- **THEN** the gate-enforcement SHALL check that the specified artifact relationships exist in the trace edges

#### Scenario: Human verification
- **WHEN** a criterion has verification method `human`
- **THEN** the gate-enforcement SHALL return `passed: true` with a reason indicating human confirmation is required. The caller (automator) SHALL pause and request user confirmation

#### Scenario: LLM-judge verification (not yet implemented)
- **WHEN** a criterion has verification method `llm-judge`
- **THEN** the gate-enforcement SHALL return `passed: true` with a reason indicating "not yet implemented — skipped"

#### Scenario: Downstream-executability verification (not yet implemented)
- **WHEN** a criterion has verification method `downstream-executability`
- **THEN** the gate-enforcement SHALL return `passed: true` with a reason indicating "not yet implemented — skipped"

### Requirement: Rule-based checks

The gate-enforcement capability SHALL support deterministic rule-based checks for common artifact validation scenarios:

- `proposal-structure`: proposal.md contains Why / What Changes / Capabilities / Impact sections (case-insensitive section header matching)
- `capabilities-enumerated`: At least one capability is listed in Capabilities section. Accepts format `- \`kebab-name\`: description` or `- **bold-name**: description`
- `capabilities-kebab-case`: All capability identifiers match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`
- `specs-requirement-format`: Specs contain requirements in `### Requirement:` format
- `specs-scenarios-present`: Every requirement has at least one `#### Scenario:` block
- `all-tasks-implemented`: All tasks in tasks.md are marked complete (`- [x]`)

#### Scenario: Proposal structure check
- **WHEN** proposal.md has all four sections (Why / What Changes / Capabilities / Impact)
- **THEN** `proposal-structure` SHALL pass

#### Scenario: Capabilities in bold format
- **WHEN** capabilities are listed as `- **bold-name**: description` instead of backtick format
- **THEN** `capabilities-enumerated` SHALL still pass (accept both formats)

#### Scenario: Tasks partially complete
- **WHEN** tasks.md has 5 tasks but only 3 are marked `[x]`
- **THEN** `all-tasks-implemented` SHALL fail with a reason showing "3/5 tasks complete"

### Requirement: Structured diagnosis

On gate failure, the gate-enforcement capability SHALL produce a structured diagnosis with:
- `gateId`: the criterion id that triggered the diagnosis
- `failedCriteria`: array of failed criteria, each with `id`, `reason`, `evidence` (optional), `suggestedFix` (optional)
- `retryLevel`: the appropriate retry level (1-4) based on retry count
- `similarToPrevious`: boolean indicating if the failure is similar to a previous one

#### Scenario: Diagnosis includes actionable fix
- **WHEN** the design stage gate fails because "design.md does not cover spec 'auth' requirement 'token expiration'"
- **THEN** the diagnosis SHALL include a `suggestedFix` such as "Add design sections that cover every spec requirement"

#### Scenario: Retry level progression
- **WHEN** the first gate failure occurs
- **THEN** retryLevel SHALL be 1. On the second failure, retryLevel SHALL be 2. On the third, 3. On the fourth, 4.

### Requirement: Suggested fixes

For known criteria, the gate-enforcement capability SHALL provide specific suggested fixes:

#### Scenario: Missing sections
- **WHEN** proposal-structure fails
- **THEN** suggestedFix SHALL be "Add the missing sections to proposal.md"

#### Scenario: Capabilities not enumerated
- **WHEN** capabilities-enumerated fails
- **THEN** suggestedFix SHALL be "List your capabilities in the format: - `kebab-name`: description"

#### Scenario: Unknown criterion
- **WHEN** the failed criterion is not in the known suggestions map
- **THEN** suggestedFix SHALL be a generic "Fix the issue with '<criterion-id>'"
