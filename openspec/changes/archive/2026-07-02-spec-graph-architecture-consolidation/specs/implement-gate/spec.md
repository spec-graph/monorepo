## MODIFIED Requirements

### Requirement: Implement stage gate checks code existence

The `implement` stage exit gate SHALL verify that source code files exist in the session's `implement/` directory, not just a markdown artifact.

#### Scenario: Implement gate passes with code
- **WHEN** the implement stage has at least one source file (non-.md) in `implement/` directory
- **THEN** the gate SHALL pass

#### Scenario: Implement gate fails with empty directory
- **WHEN** the implement stage has an empty `implement/` directory or only .md files
- **THEN** the gate SHALL fail with a "missing implementation" diagnosis

#### Scenario: Implement gate runs tsc if available
- **WHEN** `tsc` is available in the project's PATH or package.json
- **THEN** the gate SHALL run `tsc --noEmit` and check the exit code

#### Scenario: Implement gate runs tests if available
- **WHEN** `vitest`, `jest`, or `npm test` is available
- **THEN** the gate SHALL run tests and check the exit code

#### Scenario: Implement gate tolerates missing tooling
- **WHEN** neither tsc nor test runner is available
- **THEN** the gate SHALL only check source file existence (not fail)

### Requirement: Implement stage machine-state tracks code artifacts

The machine-state tracker SHALL record each capability's code artifacts as completed when the implement stage gate passes.

#### Scenario: Multiple capabilities tracked
- **WHEN** implement stage gate passes with 3 capabilities
- **THEN** machine-state SHALL have 3 entries, one per capability, all `status: completed`

#### Scenario: Failed capability not marked completed
- **WHEN** one capability's code doesn't compile
- **THEN** machine-state SHALL have that capability as `status: failed`
