## ADDED Requirements

### Requirement: Complete round-trip of session state

The `parseStateYaml()` function SHALL read back all fields that `formatStateYaml()` writes. After a write-read cycle, the restored SessionData SHALL be equivalent to the original.

#### Scenario: Plan with capabilities and dependencies
- **WHEN** a session with plan containing 3 capabilities (one with dependsOn) is saved and reloaded
- **THEN** the restored plan SHALL have all 3 capabilities with correct dependsOn arrays

#### Scenario: Plan order preserved
- **WHEN** a session with plan.order: ["auth", "profile", "dashboard"] is saved and reloaded
- **THEN** the restored plan.order SHALL contain all 3 entries in correct order

#### Scenario: Completed artifacts preserved
- **WHEN** a session with completedArtifacts: ["specify/proposal.md", "design/design.md"] is saved and reloaded
- **THEN** the restored completedArtifacts SHALL contain both entries

#### Scenario: Previous diagnoses preserved
- **WHEN** a session with 2 previous diagnoses (retry levels 1 and 2) is saved and reloaded
- **THEN** the restored previousDiagnoses SHALL have 2 entries with correct retryLevel and failedCriteria values

#### Scenario: Retry count preserved
- **WHEN** a session with retryCount: 3 is saved and reloaded
- **THEN** the restored retryCount SHALL be 3

#### Scenario: Ready-for-archive flag preserved
- **WHEN** a completed session with readyForArchive: true is saved and reloaded
- **THEN** the restored readyForArchive SHALL be true

### Requirement: DependsOn field in format

The `formatStateYaml()` function SHALL write dependsOn as an inline array `dependsOn: ["id1", "id2"]` or `dependsOn: []` for empty dependencies.

#### Scenario: Capability with dependencies written
- **WHEN** a plan capability has dependsOn: ["user-model"]
- **THEN** the YAML SHALL contain `dependsOn: ["user-model"]` on the line after description

#### Scenario: Capability without dependencies written
- **WHEN** a plan capability has dependsOn: []
- **THEN** the YAML SHALL contain `dependsOn: []`

### Requirement: Previous diagnoses in format

The `formatStateYaml()` function SHALL write previousDiagnoses including retryLevel, similarToPrevious, failedCriteria.id, and failedCriteria.reason for each diagnosis.

#### Scenario: Diagnosis written with retry level
- **WHEN** a session has a previous diagnosis with retryLevel 2
- **THEN** the YAML SHALL contain `retryLevel: 2` under that diagnosis entry

### Requirement: Plan order in format

The `formatStateYaml()` function SHALL write plan.order as an inline array.

#### Scenario: Plan order written
- **WHEN** a plan has order: ["auth", "profile"]
- **THEN** the YAML SHALL contain `order: ["auth", "profile"]`
