## MODIFIED Requirements

### Requirement: dispatch CLI outputs routing manifest JSON

The `spec-graph dispatch` CLI command SHALL output a lightweight routing manifest JSON when `--json` flag is provided, containing file paths and metadata without inline prompt content.

#### Scenario: --json flag outputs routing manifest

- **WHEN** `spec-graph dispatch --session <id> --json` runs
- **THEN** stdout contains a JSON object with top-level metadata fields (`stage`, `intent`, `done`, `session_id`) and an `actions` array
- **AND** each action in the array has `id`, `description`, `agent`, `skills`, `upstream`, `output`, `checks` fields
- **AND** no `prompt` field is present in any action
- **AND** the JSON size is under 2KB

#### Scenario: without --json flag outputs human summary

- **WHEN** `spec-graph dispatch --session <id>` runs (no --json)
- **THEN** stdout contains a human-readable summary with stage, agent name, skill names, intent, and output path
- **AND** no prompt content is displayed

#### Scenario: manifest contains absolute paths

- **WHEN** `spec-graph dispatch --session <id> --json` runs
- **THEN** each action's `agent`, `skills[]`, `upstream[]`, and `output` are all absolute paths
- **AND** the paths resolve to existing files or directories on the filesystem

### Requirement: dispatch CLI passes graph.yaml path

The `spec-graph dispatch` CLI command SHALL pass `.spec-graph/graph.yaml` as the graphPath to `generateDispatchManifest()`.

#### Scenario: graph.yaml path passed

- **WHEN** `spec-graph dispatch --session <id>` runs
- **THEN** `generateDispatchManifest()` receives graphPath as `<projectRoot>/.spec-graph/graph.yaml`

#### Scenario: graph.yaml does not exist

- **WHEN** `.spec-graph/graph.yaml` does not exist
- **THEN** the CLI exits with an error message: "Run `spec-graph compose` first"
- **AND** no fallback to inline pack scanning occurs
