# specs-gate: specs stage entry/exit criteria

## Requirement: specs stage has correct gate configuration

The specs stage MUST have gate.yaml defining entry and exit criteria.

### Scenario: specs gate.yaml exists

**Given** knowledge/stages/specs/ directory
**When** gate.yaml is read
**Then** it contains entry and exit sections

### Scenario: specs entry requires proposal

**Given** specs stage gate evaluated
**When** checking entry criteria
**Then** `proposal-exists` is checked
**And** it verifies proposal.md content exists

### Scenario: specs exit requires valid specs format

**Given** specs stage exit evaluation
**When** artifactContents['specs'] is evaluated
**Then** `specs-exists` checks content length > 0
**And** `specs-requirement-format` checks for `### Requirement:` pattern
**And** `specs-scenarios-present` checks scenario count >= requirement count
**And** `specs-shall-must` checks for SHALL/MUST keywords
**And** `specs-length` checks 200-3000 word range
**And** `specs-one-per-capability` checks >= 1 requirement exists

### Scenario: specs gate passes with valid content

**Given** specs.md with proper Requirement/Scenario format and 250 words
**When** specs exit gate is evaluated
**Then** all criteria pass
**And** gate passes

### Scenario: specs gate rejects short content

**Given** specs.md with 50 words
**When** specs exit gate is evaluated
**Then** `specs-length` fails
**And** gate does not pass
