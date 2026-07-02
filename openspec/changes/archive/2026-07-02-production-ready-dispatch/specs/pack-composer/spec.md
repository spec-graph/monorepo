## ADDED Requirements

### Requirement: Pack scanner

The pack-composer SHALL scan a directory of `.pack` subdirectories and load every `pack.yaml` file within them into `Pack` objects.

#### Scenario: Single pack directory
- **WHEN** the directory contains `foundation.pack/pack.yaml` with valid YAML
- **THEN** the composer SHALL parse it into a `Pack` object with `name: "foundation"`

#### Scenario: Multiple packs with different priorities
- **WHEN** the directory contains both `foundation.pack` (priority=0) and `ddd.pack` (priority=10)
- **THEN** the composer SHALL load both and preserve their priority values

#### Scenario: Malformed pack.yaml
- **WHEN** a `pack.yaml` file contains invalid YAML
- **THEN** the composer SHALL skip that pack with a warning, not crash

### Requirement: Profile-based filtering (AND semantics)

The pack-composer SHALL filter packs by `applies_when` against the project profile facts using AND semantics: ALL facts in `applies_when` MUST match the profile. Packs with `applies_when: always` SHALL always be included. Packs without an `applies_when` field SHALL be treated as `applies_when: always`.

The matching logic for each fact dimension:
- `dim: true` — the dimension MUST exist in `profile.facts` with a non-empty value
- `dim: false` — the dimension MUST NOT exist in `profile.facts` (or MUST have an empty value)
- The match is against dimension EXISTENCE, not against `ProfileFact.value` string content

When the project profile has no facts (empty), only packs with `applies_when: always` (or no `applies_when`) SHALL be loaded. Conditional packs SHALL be excluded because there are no facts to match against.

#### Scenario: Always-included pack
- **WHEN** a pack declares `applies_when: always`
- **THEN** the composer SHALL include it regardless of profile

#### Scenario: Pack without applies_when treated as always
- **WHEN** a pack does not declare an `applies_when` field
- **THEN** the composer SHALL include it (treated as `applies_when: always`)

#### Scenario: Conditional pack matching all facts
- **WHEN** a pack declares `applies_when: { has_ui: true, has_db: true }` and both profile dimensions exist with non-empty values
- **THEN** the composer SHALL include it

#### Scenario: Conditional pack with one fact mismatching
- **WHEN** a pack declares `applies_when: { has_ui: true, has_db: true }` and profile dimension `has_db` does not exist
- **THEN** the composer SHALL exclude it

#### Scenario: Conditional pack not matching profile
- **WHEN** a pack declares `applies_when: { has_ui: true }` and the profile dimension `has_ui` does not exist
- **THEN** the composer SHALL exclude it

#### Scenario: Empty profile only loads always packs
- **WHEN** the project profile has no facts (empty) and packs include both `always` packs and conditional packs
- **THEN** only `always` packs (and packs without `applies_when`) SHALL be loaded; conditional packs SHALL be excluded

### Requirement: Priority-based merge

The pack-composer SHALL merge agent_bindings from all included packs. When two packs define a binding for the same action, the higher-priority pack SHALL take precedence. Non-conflicting bindings SHALL be preserved.

#### Scenario: Higher-priority pack overrides binding
- **WHEN** foundation.pack (priority=0) binds `specify → pm` and ddd.pack (priority=10) binds `specify → domain-expert`
- **THEN** the composed graph SHALL have `specify → domain-expert`

#### Scenario: No conflict between packs
- **WHEN** foundation binds `specify → pm` and architecture binds `design → architect`
- **THEN** both bindings SHALL be present in the composed graph

### Requirement: Graph output

The pack-composer SHALL produce a complete `Graph` object and write it to `.spec-graph/graph.yaml`.

#### Scenario: Complete graph with foundation pack only
- **WHEN** only foundation.pack is active
- **THEN** the composed graph SHALL contain 5 agents (pm, architect, developer, reviewer, qa), all agent_bindings from foundation, and foundation's pipeline_skeleton

#### Scenario: Graph written to disk
- **WHEN** compose completes successfully
- **THEN** the graph SHALL be written to `.spec-graph/graph.yaml` as valid YAML

#### Scenario: Graph consumable by dispatch
- **WHEN** graph.yaml exists
- **THEN** `generateDispatchManifest` SHALL read agent config and bindings from graph.yaml instead of scanning packs directly
