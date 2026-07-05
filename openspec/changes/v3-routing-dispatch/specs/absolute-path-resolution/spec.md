## ADDED Requirements

### Requirement: Path resolution via require.resolve

The dispatch module SHALL use `require.resolve('@spec-graph/core/package.json')` as the primary mechanism for locating the core package and resolving pack file paths.

#### Scenario: Standard resolution

- **WHEN** dispatch calls `require.resolve('@spec-graph/core/package.json')`
- **THEN** it returns the absolute path to the core package's package.json
- **AND** `path.dirname(result)` gives the core package root

#### Scenario: Resolution failure

- **WHEN** `require.resolve` throws because `@spec-graph/core` is not installed
- **THEN** dispatch throws an error with a clear message indicating the package is not installed

### Requirement: Agent path resolution

The dispatch module SHALL resolve agent file paths by combining the core package root with the pack name and agent prompt reference.

#### Scenario: Foundation pack agent

- **WHEN** the agent binding specifies `pm` with `prompt_ref: agents/pm-agent.md`
- **THEN** the resolved path is `<corePacksDir>/foundation.pack/agents/pm-agent.md`
- **AND** the path is absolute

#### Scenario: DDD pack agent

- **WHEN** the agent binding specifies `domain-expert` with `prompt_ref: agents/domain-expert-agent.md`
- **THEN** the resolved path is `<corePacksDir>/ddd.pack/agents/domain-expert-agent.md`
- **AND** the path is absolute

### Requirement: Skill path resolution

The dispatch module SHALL resolve skill directory paths by combining the core package root with the pack name, stage, and skill id.

#### Scenario: Foundation pack skill

- **WHEN** graph.yaml specifies skill `brainstorming` under pack `foundation.pack` for stage `specify`
- **THEN** the resolved path is `<corePacksDir>/foundation.pack/stages/specify/skills/brainstorming`
- **AND** the path is absolute

#### Scenario: Planning pack skill

- **WHEN** graph.yaml specifies skill `requirement-analysis` under pack `requirement-analysis.pack` for stage `specify`
- **THEN** the resolved path is `<corePacksDir>/requirement-analysis.pack/stages/specify/skills/requirement-analysis`
- **AND** the path is absolute

### Requirement: Output path resolution

The dispatch module SHALL resolve output paths by combining the project root with `.spec-graph/sessions/<sessionId>/<stage>/<outputFile>`.

#### Scenario: Stage output file

- **WHEN** the stage is `design` and the session id is `abc123`
- **THEN** the output path is `<projectRoot>/.spec-graph/sessions/abc123/design/design.md`
- **AND** the path is absolute

### Requirement: Upstream path resolution

The dispatch module SHALL resolve upstream artifact paths from the session's completed artifacts list.

#### Scenario: Multiple upstream artifacts

- **WHEN** the session has completed `specify` and `specs` stages
- **THEN** the upstream paths include `<projectRoot>/.spec-graph/sessions/<id>/specify/proposal.md` and `<projectRoot>/.spec-graph/sessions/<id>/specs/specs.md`
- **AND** all paths are absolute
