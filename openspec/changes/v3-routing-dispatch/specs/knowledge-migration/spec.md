## MODIFIED Requirements

### Requirement: knowledge content moves to packs instead of being a separate directory

The knowledge directory SHALL be deleted entirely. Its content (gate.yaml, skills, shared documents) SHALL be moved into the corresponding pack directories under `packs/*/stages/`.

#### Scenario: knowledge directory removed

- **WHEN** the migration is complete
- **THEN** `packages/core/knowledge/` does not exist

#### Scenario: foundation.pack contains all stages

- **WHEN** the migration is complete
- **THEN** `packs/foundation.pack/stages/` contains 9 subdirectories (specify, specs, design, tasks, implement, review, test, accept, integrate)
- **AND** each contains `stage.yaml` and `gate.yaml`

#### Scenario: foundation.pack contains generic skills

- **WHEN** the migration is complete
- **THEN** `packs/foundation.pack/stages/specify/skills/` contains `brainstorming/` and `design-thinking/`
- **AND** `packs/foundation.pack/stages/implement/skills/` contains `code-generation/` and `story-splitting/`

#### Scenario: planning packs contain domain-specific skills

- **WHEN** the migration is complete
- **THEN** `packs/requirement-analysis.pack/stages/specify/skills/requirement-analysis/` exists
- **AND** `packs/architecture.pack/stages/design/skills/architecture/` exists
- **AND** `packs/api-design.pack/stages/design/skills/api-design/` exists
- **AND** `packs/task-decomposition.pack/stages/tasks/skills/task-decomposition/` exists

#### Scenario: shared documents moved to foundation pack

- **WHEN** the migration is complete
- **THEN** `packs/foundation.pack/shared/` contains `prompt-schema.md`, `project-context.md`, `verification-format.md`, and `planning-schema.md`

#### Scenario: knowledge content ships with npm

- **WHEN** `@spec-graph/core` is published to npm
- **THEN** the published package includes all gate.yaml and skill content via the existing `packs/` entry in `package.json` files field

### Requirement: knowledge-base module is deleted

The `packages/core/src/knowledge-base/` module SHALL be removed. Its functionality (loading skills, selecting skills by stage) is replaced by dispatch reading from graph.yaml and sub-agents reading files directly.

#### Scenario: module removed

- **WHEN** the migration is complete
- **THEN** `packages/core/src/knowledge-base/` does not exist
- **AND** `packages/core/src/index.ts` no longer exports `knowledgeBase`

#### Scenario: no remaining imports

- **WHEN** the migration is complete
- **THEN** no source files import from `knowledge-base`
- **AND** the codebase compiles without the module
