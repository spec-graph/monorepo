## ADDED Requirements

### Requirement: Output specification in envelope

Every dispatch action's prompt envelope SHALL include an `## Output Specification (MUST)` section specifying the exact file path, expected format, and optional template for the sub-agent's output. (Already implemented in dispatch/index.ts:424-438 — verification only.)

#### Scenario: Specify stage output path
- **WHEN** the current stage is `specify`
- **THEN** the envelope SHALL include `Write to: .spec-graph/sessions/<id>/specify/proposal.md`

#### Scenario: Design stage format requirements
- **WHEN** the current stage is `design`
- **THEN** the envelope SHALL include format: `Markdown with sections: Context, Goals/Non-Goals, Decisions, Risks/Trade-offs`

### Requirement: File scope in envelope

Every dispatch action's prompt envelope SHALL include a `## File Scope (MUST)` section listing read-only globs, write globs, and forbidden globs. (Already implemented in dispatch/index.ts:443-463 — verification only.)

#### Scenario: Read scope includes session artifacts
- **WHEN** the envelope is generated for any stage
- **THEN** the read scope SHALL include `.spec-graph/sessions/<id>/**/*`

#### Scenario: Forbid scope prevents git and node_modules access
- **WHEN** the envelope is generated
- **THEN** the forbid scope SHALL include `.git/**` and `node_modules/**`

### Requirement: Verification commands in envelope

For stages that produce code (implement), the `## Verification (MUST)` section SHALL include concrete shell commands for lint, test, and typecheck. (Already implemented in dispatch/index.ts:467-497 — verification only.)

#### Scenario: Implement stage includes all checks
- **WHEN** the current stage is `implement`
- **THEN** the envelope SHALL include lint, typecheck, and test commands

#### Scenario: Specify stage has no code checks
- **WHEN** the current stage is `specify`
- **THEN** the envelope SHALL still include the Verification section but note that only format verification is needed

### Requirement: Status report protocol

The envelope SHALL include a `## Status Report Protocol (MUST)` section with the exact JSON format the sub-agent must use to report completion. (Already implemented in dispatch/index.ts:501-525 — verification only.)

#### Scenario: Status report format present
- **WHEN** a dispatch envelope is generated
- **THEN** it SHALL contain a fenced `status-report` JSON block with `status` and `artifacts_produced` fields

#### Scenario: Status values documented
- **WHEN** a dispatch envelope is generated
- **THEN** it SHALL document DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, and BLOCKED values

### Requirement: Complete envelope contains all 9 sections

The prompt envelope SHALL contain exactly 9 sections in order: Identity, System Prompt, Task Context, Input Artifacts, Output Specification, File Scope, Verification, Status Report Protocol, After Completion. (Already implemented — verification only.)

#### Scenario: All 9 sections present
- **WHEN** a dispatch envelope is generated for any stage with a valid agent binding
- **THEN** the envelope SHALL contain all 9 section headers
