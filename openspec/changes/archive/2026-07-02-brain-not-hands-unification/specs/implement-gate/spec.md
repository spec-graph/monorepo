## MODIFIED Requirements

### Requirement: Implement gate checks code existence

Implement stage gate SHALL verify source code files exist and optionally run tsc/tests.

#### Scenario: Gate passes with code
- **WHEN** implement directory has non-.md files
- **THEN** gate SHALL pass

#### Scenario: Gate runs tsc if available
- **WHEN** tsc is in package.json scripts
- **THEN** gate SHALL run `tsc --noEmit` and check exit code

#### Scenario: Gate runs tests if available
- **WHEN** vitest/jest is in package.json scripts
- **THEN** gate SHALL run tests
