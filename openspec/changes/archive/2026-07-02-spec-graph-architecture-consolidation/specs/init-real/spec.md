## ADDED Requirements

### Requirement: Init creates .spec-graph directory

The `spec-graph init` command SHALL create the `.spec-graph/` directory structure with default configuration.

#### Scenario: Fresh project init
- **WHEN** `spec-graph init` is run in a directory without `.spec-graph/`
- **THEN** it SHALL create `.spec-graph/config.yaml`, `.spec-graph/sessions/`

#### Scenario: Config yaml template
- **WHEN** init creates `.spec-graph/config.yaml`
- **THEN** the file SHALL contain default `version`, `context`, `rules` fields

#### Scenario: Force option
- **WHEN** `spec-graph init --force` is run in a directory with existing `.spec-graph/`
- **THEN** it SHALL overwrite the existing directory

#### Scenario: Idempotent init
- **WHEN** `spec-graph init` is run in a directory with existing `.spec-graph/` (without --force)
- **THEN** it SHALL print a warning and exit without changes

#### Scenario: Auto compose if packs available
- **WHEN** `spec-graph init` is run and a pack directory is found
- **THEN** it SHALL also run compose → `.spec-graph/graph.yaml`
