## MODIFIED Requirements

### Requirement: Implement gate checks source files exist

Implement stage gate SHALL verify that source files exist in the implement directory.

#### Scenario: Gate passes with source files
- **WHEN** implement directory has at least one non-.md file
- **THEN** gate SHALL pass the `source_files_exist` criterion

#### Scenario: Gate fails with no source files
- **WHEN** implement directory has only .md files or is empty
- **THEN** gate SHALL fail the `source_files_exist` criterion
- **AND** diagnosis SHALL include:
  - `failed_criteria: ['source_files_exist']`
  - `reasons: ['No source files found in implement/']`
  - `suggested_fix: 'Create at least one source file'`

### Requirement: Implement gate runs tsc if available

Implement stage gate SHALL run `tsc --noEmit` if `tsc` script exists in package.json.

#### Scenario: tsc available and passes
- **WHEN** `package.json` has `scripts.tsc`
- **AND** `tsc --noEmit` exits with code 0
- **THEN** gate SHALL pass the `tsc_pass` criterion

#### Scenario: tsc available and fails
- **WHEN** `package.json` has `scripts.tsc`
- **AND** `tsc --noEmit` exits with non-zero code
- **THEN** gate SHALL fail the `tsc_pass` criterion
- **AND** diagnosis SHALL include:
  - `failed_criteria: ['tsc_pass']`
  - `reasons: ['TypeScript compilation failed']`
  - `evidence: [stdout, stderr]`
  - `suggested_fix: 'Fix TypeScript errors'`

#### Scenario: tsc not available
- **WHEN** `package.json` does not have `scripts.tsc`
- **THEN** gate SHALL skip the `tsc_pass` criterion
- **AND** it SHALL NOT fail due to missing tsc

### Requirement: Implement gate runs tests if available

Implement stage gate SHALL run tests if `test` script exists in package.json.

#### Scenario: tests available and pass
- **WHEN** `package.json` has `scripts.test`
- **AND** `npm test` exits with code 0
- **THEN** gate SHALL pass the `tests_pass` criterion

#### Scenario: tests available and fail
- **WHEN** `package.json` has `scripts.test`
- **AND** `npm test` exits with non-zero code
- **THEN** gate SHALL fail the `tests_pass` criterion
- **AND** diagnosis SHALL include:
  - `failed_criteria: ['tests_pass']`
  - `reasons: ['Tests failed']`
  - `evidence: [stdout, stderr]`
  - `suggested_fix: 'Fix failing tests'`

#### Scenario: tests not available
- **WHEN** `package.json` does not have `scripts.test`
- **THEN** gate SHALL skip the `tests_pass` criterion
- **AND** it SHALL NOT fail due to missing tests

### Requirement: Implement gate provides clear diagnosis

Implement stage gate SHALL provide clear diagnosis on failure.

#### Scenario: Diagnosis structure
- **WHEN** gate fails
- **THEN** diagnosis SHALL include:
  ```typescript
  {
    passed: false,
    failed_criteria: string[],
    reasons: string[],
    evidence: string[],
    suggested_fix: string
  }
  ```

#### Scenario: Multiple failures
- **WHEN** multiple criteria fail (e.g., tsc fails AND tests fail)
- **THEN** diagnosis SHALL include all failed criteria
- **AND** it SHALL provide evidence for each failure

#### Scenario: Evidence included
- **WHEN** tsc or tests fail
- **THEN** diagnosis SHALL include stdout and stderr output
- **AND** evidence SHALL be truncated if too long (>10KB)

### Requirement: Implement gate stageArtifacts entry

The `stageArtifacts` dictionary in gate-enforcement module SHALL include an entry for the implement stage.

#### Scenario: stageArtifacts dictionary
- **WHEN** `stageArtifacts` is inspected
- **THEN** it SHALL contain:
  ```typescript
  {
    specify: ['proposal.md'],
    design: ['design.md'],
    tasks: ['tasks.md'],
    implement: ['src/**/*'],
    review: ['review.md'],
    test: ['test.md'],
    accept: ['verification.md'],
    integrate: ['pr.md']
  }
  ```

#### Scenario: implement entry exists
- **WHEN** gate evaluation runs for implement stage
- **THEN** it SHALL find `stageArtifacts.implement` entry
- **AND** it SHALL NOT fail due to missing entry

### Requirement: Implement gate knowledge updated

The knowledge file for implement stage gate SHALL reflect the new checking rules.

#### Scenario: gate.yaml updated
- **WHEN** `packages/core/knowledge/stages/implement/gate.yaml` is inspected
- **THEN** it SHALL document:
  - Source files must exist (non-.md)
  - tsc --noEmit must pass (if available)
  - Tests must pass (if available)

#### Scenario: Gate criteria documented
- **WHEN** gate.yaml is read
- **THEN** it SHALL list all criteria:
  - `source_files_exist`
  - `tsc_pass` (conditional)
  - `tests_pass` (conditional)
