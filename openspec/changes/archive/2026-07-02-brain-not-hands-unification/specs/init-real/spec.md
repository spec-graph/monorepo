## MODIFIED Requirements

### Requirement: Init creates .spec-graph directory

The `spec-graph init` command SHALL create the `.spec-graph/` directory structure.

#### Scenario: Fresh project init
- **WHEN** `spec-graph init` runs in a directory without `.spec-graph/`
- **THEN** it SHALL create `config.yaml` and `sessions/`

#### Scenario: Hook auto-registration
- **WHEN** `spec-graph init` runs
- **THEN** it SHALL add dispatch-watcher hook to `.claude/settings.json`

#### Scenario: Auto-compose if packs exist
- **WHEN** `spec-graph init` runs and pack directory exists
- **THEN** it SHALL also run compose → `graph.yaml`
