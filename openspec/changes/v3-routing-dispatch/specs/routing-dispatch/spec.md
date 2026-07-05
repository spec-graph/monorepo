## ADDED Requirements

### Requirement: Dispatch outputs lightweight routing manifest

The dispatch module SHALL output a JSON manifest containing routing information only (agent path, skills paths, intent, upstream, output, checks), without assembling or inlining prompt content.

#### Scenario: Dispatch manifest structure

- **WHEN** `spec-graph dispatch --json` is called
- **THEN** the output JSON contains top-level metadata fields: `version`, `session_id`, `stage`, `intent`, `done`
- **AND** the output JSON contains an `actions` array where each element describes one sub-agent task
- **AND** each action has: `id`, `description`, `agent`, `skills`, `upstream`, `output`, `checks`, and optional `parallel_group`
- **AND** the manifest is under 500 bytes for single-action stages

#### Scenario: Single action stage (e.g., specify, design, review)

- **WHEN** `spec-graph dispatch --json` is called for a single-action stage
- **THEN** the output JSON contains `actions` array with one element
- **AND** that element has `id` equal to the stage name
- **AND** that element has `description` describing the stage's task
- **AND** top-level `intent` provides overall context

#### Scenario: Multi-action stage (implement with parallel capabilities)

- **WHEN** `spec-graph dispatch --json` is called for the `implement` stage with multiple capabilities
- **THEN** the output JSON contains `actions` array with multiple elements
- **AND** each element has its own `id` (capability name)
- **AND** each element has its own `description` (capability description from planning phase)
- **AND** elements with the same `parallel_group` value are dispatched simultaneously

#### Scenario: Terminal state

- **WHEN** `spec-graph dispatch --json` is called and the session state is `completed`
- **THEN** the output JSON contains `done: true` and an empty `actions` array

### Requirement: Each action has self-contained task description

Each action in the manifest SHALL include a `description` field that describes what specifically that action should accomplish. The description is derived from the planning phase's capability descriptions.

#### Scenario: Action description present

- **WHEN** dispatch generates an action for capability "user-model"
- **THEN** the action's `description` field contains the capability's description (e.g., "User data model with email and password hash")
- **AND** the description is non-empty

#### Scenario: Description comes from planning

- **WHEN** dispatch processes implement stage with capabilities from plan
- **THEN** each action's `description` is copied from the corresponding capability's description in the session plan

### Requirement: Dispatch resolves paths via require.resolve

The dispatch module SHALL use `require.resolve('@spec-graph/core/package.json')` to locate the core package installation directory and resolve absolute paths for agent files and skill directories.

#### Scenario: Global npm install

- **WHEN** `@spec-graph/core` is installed globally via `npm install -g @spec-graph/cli`
- **THEN** `require.resolve('@spec-graph/core/package.json')` resolves to the global node_modules path
- **AND** the manifest contains absolute paths under that location

#### Scenario: Project npm install

- **WHEN** `@spec-graph/core` is installed as a project dependency
- **THEN** `require.resolve('@spec-graph/core/package.json')` resolves to `node_modules/@spec-graph/core/package.json` relative to the project root
- **AND** the manifest contains absolute paths under that location

### Requirement: Dispatch reads metadata from graph.yaml

The dispatch module SHALL read agent bindings, skill lists, and check definitions from `.spec-graph/graph.yaml` and combine them with session state to produce the manifest.

#### Scenario: Agent binding lookup

- **WHEN** dispatch processes the `design` stage
- **THEN** it reads `graph.yaml` to find the agent binding for `design`
- **AND** resolves the agent path to an absolute path under the packs directory

#### Scenario: Skills list lookup

- **WHEN** dispatch processes the `specify` stage
- **THEN** it reads `graph.yaml` to find the skills list for `specify` (e.g., requirement-analysis, brainstorming)
- **AND** resolves each skill path to an absolute directory path

#### Scenario: Upstream artifacts

- **WHEN** dispatch processes the `design` stage
- **THEN** it reads `session.completedArtifacts` to find upstream paths (`specify/proposal.md`, `specs/specs.md`)
- **AND** resolves each to an absolute path under `.spec-graph/sessions/<id>/`

### Requirement: Dispatch code is under 150 lines

The dispatch module's `generateDispatchManifest` function and its helpers SHALL be under 150 lines of code, excluding type definitions and imports.

#### Scenario: Code size verification

- **WHEN** the dispatch module is implemented
- **THEN** the total lines of `generateDispatchManifest` and helper functions (excluding types and imports) is under 150 lines
