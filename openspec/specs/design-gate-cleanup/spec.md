# design-gate-cleanup: remove specs criteria from design gate

## Requirement: design gate no longer requires specs artifacts

The design stage gate.yaml MUST NOT include specs-* criteria. These move to the specs stage.

### Scenario: design gate exit has no specs criteria

**Given** design/gate.yaml
**When** exit criteria are listed
**Then** none of: specs-one-per-capability, specs-requirement-format,
     specs-shall-must, specs-scenarios-present, specs-delta-operations,
     design-covers-specs

### Scenario: design gate exit has specs-passed-gate

**Given** design/gate.yaml exit
**When** criteria are listed
**Then** `specs-passed-gate` is present (replaces direct specs checks)

### Scenario: design gate exit retains its own criteria

**Given** design/gate.yaml
**When** exit criteria are listed
**Then** includes: design-exists-if-needed, design-rationale,
     alternatives-considered, design-risks, design-length

### Scenario: evaluateGate for design succeeds without specs

**Given** design exit evaluation
**And** artifactContents has design but NOT specs
**When** evaluateGate('design', 'exit', ...) is called
**Then** no specs-* criterion is evaluated
**And** gate passes if design content is valid
