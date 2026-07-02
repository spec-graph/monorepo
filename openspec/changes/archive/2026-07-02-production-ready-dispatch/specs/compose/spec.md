## MODIFIED Requirements

### Requirement: Compose generates graph.yaml from packs

The `compose` CLI command SHALL scan pack files, filter by profile (AND semantics), merge by priority, and write the composed `Graph` to `.spec-graph/graph.yaml`.

#### Scenario: Compose with foundation pack
- **WHEN** `spec-graph compose` is run in a project with foundation.pack available
- **THEN** `.spec-graph/graph.yaml` SHALL be created containing agents, agent_bindings, gates, checks, and pipeline_skeleton

#### Scenario: Compose JSON output
- **WHEN** `spec-graph compose --json` is run
- **THEN** stdout SHALL be valid JSON containing the full Graph object with all merged properties

### Requirement: Compose reports agent and gate count

The `compose` command in human-readable mode SHALL report agent count, gate count, check count, and binding count.

#### Scenario: Human-readable compose output
- **WHEN** `spec-graph compose` is run without `--json`
- **THEN** output SHALL include number of agents, gates, checks, and bindings

### Requirement: Compose output consumable by dispatch

The graph.yaml produced by compose SHALL be directly consumable by `generateDispatchManifest()`. Dispatch SHALL read agent config and bindings from graph.yaml when available.

#### Scenario: Dispatch reads graph after compose
- **WHEN** compose has written graph.yaml and dispatch is called
- **THEN** dispatch SHALL use agent bindings from graph.yaml instead of scanning pack directories
