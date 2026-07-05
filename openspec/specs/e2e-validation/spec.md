# e2e-validation: specs stage end-to-end verification

## Requirement: complete 9-stage and 8-stage workflows pass

Both the 9-stage path (with specs) and the 8-stage path (skipping specs) MUST work end-to-end.

### Scenario: 9-stage path completes

**Given** a new session with medium-complexity intent (3+ capabilities, open questions)
**When** all 9 stages run with real gate evaluation
**Then** state transitions through: specify → specs → design → tasks → implement → review → test → accept → integrate
**And** state = 'completed'
**And** readyForArchive = true
**And** all 9 artifacts produced
**And** machine-state shows all completed (no force-advance)
**And** trace shows all gate-pass triggers

### Scenario: 8-stage path skips specs

**Given** a new session with low-complexity intent (1 capability, no questions)
**And** coordinator decides to skip specs
**When** all 8 stages run (specify → design → tasks → implement → review → test → accept → integrate)
**Then** state = 'completed'
**And** specs is marked as completed without actual specs.md content
**And** design gate passes without specs-* criteria

### Scenario: specs gate rejects invalid content

**Given** a session at specs stage
**When** submitResult with specs.md of 50 words
**Then** specs gate fails
**And** diagnosis shows specs-length failure
**And** nextStage stays at specs

### Scenario: specs gate accepts valid content

**Given** a session at specs stage
**When** submitResult with specs.md of 300 words containing:
  - `### Requirement:` sections
  - `#### Scenario:` sections
  - SHALL/MUST keywords
**Then** specs gate passes
**And** nextStage is design

### Scenario: design gate passes without specs criteria

**Given** a session at design stage
**And** design.md is valid (300+ words, has Alternatives, Risks, etc.)
**And** NO specs.md exists
**When** design gate is evaluated
**Then** no specs-* criteria are checked
**And** design gate passes
