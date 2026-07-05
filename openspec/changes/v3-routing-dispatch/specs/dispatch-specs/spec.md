## MODIFIED Requirements

### Requirement: dispatch outputs routing manifest instead of assembled prompt

The dispatch module SHALL output a lightweight JSON manifest containing file paths and metadata, without reading agent prompt files or skill instruction files and without assembling prompt content.

#### Scenario: manifest structure for single action

- **WHEN** `generateDispatchManifest()` is called for a single-action stage (e.g., `specify`)
- **THEN** the output JSON contains an `actions` array with one element
- **AND** that element has `id` equal to the stage name, plus `description`, `agent`, `skills`, `upstream`, `output`, `checks` fields
- **AND** `agent` is an absolute file path to the agent's prompt .md file
- **AND** `skills` is an array of absolute directory paths to skill directories
- **AND** `upstream` is an array of absolute file paths to completed stage artifacts
- **AND** `output` is an absolute file path for the deliverable
- **AND** `description` is a non-empty string describing the stage's task

#### Scenario: manifest structure for parallel actions

- **WHEN** `generateDispatchManifest()` is called for the `implement` stage with multiple capabilities
- **THEN** the output JSON contains an `actions` array
- **AND** each action has `id`, `description`, `agent`, `skills`, `upstream`, `output`, `checks`, `parallel_group`
- **AND** each action's `description` is the capability description from the session plan

#### Scenario: manifest does not contain prompt content

- **WHEN** `generateDispatchManifest()` is called
- **THEN** the output JSON does not contain any `prompt` field
- **AND** the output JSON does not contain agent prompt text
- **AND** the output JSON does not contain skill instruction text

#### Scenario: manifest size

- **WHEN** `generateDispatchManifest()` is called for any stage
- **THEN** the serialized JSON output is under 2KB

### Requirement: STAGE_OUTPUT_MAP is replaced by convention

The hardcoded `STAGE_OUTPUT_MAP` object in dispatch SHALL be removed. Stage output file names SHALL be determined by a simple mapping within the dispatch module.

#### Scenario: no STAGE_OUTPUT_MAP

- **WHEN** dispatch module code is reviewed
- **THEN** `STAGE_OUTPUT_MAP` does not exist in `packages/core/src/dispatch/index.ts`

#### Scenario: output file determined by convention

- **WHEN** dispatch generates the output path for `specify` stage
- **THEN** the output file is `proposal.md`
- **AND** for `design` stage the output file is `design.md`
- **AND** for `implement` stage the output is `code` (directory)

### Requirement: dispatch does not call buildPromptEnvelope

The dispatch module SHALL NOT call `buildPromptEnvelope()` or any equivalent function that reads agent prompt files and skill instruction files to assemble a combined prompt string.

#### Scenario: no prompt assembly function

- **WHEN** dispatch module code is reviewed
- **THEN** `buildPromptEnvelope()` does not exist
- **AND** `loadSystemPrompt()` does not exist
- **AND** `collectInputArtifacts()` does not exist
- **AND** `buildFallbackEnvelope()` does not exist
