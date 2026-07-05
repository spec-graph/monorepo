## MODIFIED Requirements

### Requirement: Dispatch produces complete manifest

The `dispatch --json` command SHALL produce a complete DispatchManifest with all required fields.

#### Scenario: Manifest structure
- **WHEN** `spec-graph dispatch --session <id> --json` runs
- **THEN** output SHALL be a valid JSON object with:
  ```typescript
  {
    sessionId: string,
    currentStage: Stage,
    gatePassed: boolean | null,
    actions: DispatchAction[],
    meetings?: Meeting[],
    metadata: {
      timestamp: string,
      version: string,
      capabilities?: Capability[]
    }
  }
  ```

#### Scenario: Actions array
- **WHEN** current stage has agent bindings
- **THEN** `actions` array SHALL contain one or more DispatchAction objects
- **AND** each action SHALL have all required fields

#### Scenario: Empty actions
- **WHEN** current stage has no agent bindings
- **THEN** `actions` array SHALL be empty
- **AND** manifest SHALL still be valid JSON

### Requirement: Dispatch action contains 9-section envelope

Each dispatch action SHALL contain a prompt field with all 9 sections of the envelope.

#### Scenario: All 9 sections present
- **WHEN** a dispatch action is generated
- **THEN** `action.prompt` SHALL contain all 9 section headers:
  1. `## 1. Identity`
  2. `## 2. System Prompt`
  3. `## 3. Task Context`
  4. `## 4. Input Artifacts`
  5. `## 5. Output Specification`
  6. `## 6. File Scope`
  7. `## 7. Verification`
  8. `## 8. Status Report Protocol`
  9. `## 9. After Completion`

#### Scenario: Identity section
- **WHEN** Identity section is generated
- **THEN** it SHALL contain:
  - Agent ID and description
  - Model tier (capable | standard | fast)

#### Scenario: System Prompt section
- **WHEN** System Prompt section is generated
- **THEN** it SHALL be loaded from `pack/agents/{agentId}-agent.md`
- **AND** it SHALL contain domain knowledge and working principles

#### Scenario: Task Context section
- **WHEN** Task Context section is generated
- **THEN** it SHALL contain:
  - Stage name
  - Session ID
  - User intent
  - Specific action description
  - Parallel group (if applicable)

#### Scenario: Input Artifacts section
- **WHEN** Input Artifacts section is generated
- **THEN** it SHALL list upstream artifacts (READ-ONLY)
- **AND** each artifact SHALL include id, kind, path, content
- **AND** content SHALL be truncated to 3000 characters

#### Scenario: Output Specification section
- **WHEN** Output Specification section is generated
- **THEN** it SHALL contain:
  - Exact output path
  - Template reference (if exists)
  - Format description
  - "You MUST write the artifact to the exact path above"

#### Scenario: File Scope section
- **WHEN** File Scope section is generated
- **THEN** it SHALL contain:
  - `read`: glob array of readable paths
  - `write`: glob array of writable paths
  - `forbid`: glob array of forbidden paths
  - "Violating scope = BLOCKED status"

#### Scenario: Verification section
- **WHEN** Verification section is generated
- **THEN** it SHALL contain:
  - Commands to run (lint, test, typecheck)
  - Expected exit code
  - For implement stage: specific verification commands

#### Scenario: Status Report Protocol section
- **WHEN** Status Report Protocol section is generated
- **THEN** it SHALL specify the required JSON format:
  ```
  ```status-report
  {"status":"DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED",
   "artifacts_produced":[...],
   "concerns":[],
   "missing_context":null,
   "blocker":null,
   "summary":"..."}
  ```
  ```

#### Scenario: After Completion section
- **WHEN** After Completion section is generated
- **THEN** it SHALL contain:
  - Next step command (e.g., `spec-graph advance --result '{...}'`)
  - "The coordinator will run: <command>"

### Requirement: Dispatch supports parallel execution

Dispatch SHALL support parallel execution via parallel_group field.

#### Scenario: Single action
- **WHEN** current stage has one action
- **THEN** action SHALL have `parallel_group: 0`

#### Scenario: Multiple independent actions
- **WHEN** current stage has multiple independent actions (e.g., implement with N capabilities)
- **THEN** all actions SHALL have the same `parallel_group` value
- **AND** they SHALL be dispatched simultaneously

#### Scenario: Multiple parallel groups
- **WHEN** actions have dependencies
- **THEN** they SHALL be assigned different `parallel_group` values
- **AND** groups SHALL be dispatched in order (group 0 first, then group 1, etc.)

### Requirement: Dispatch file scope constraints

Dispatch SHALL provide clear file scope constraints for each action.

#### Scenario: Read scope
- **WHEN** file scope is generated
- **THEN** `read` array SHALL include:
  - Session directory (for reading upstream artifacts)
  - Knowledge base (for templates)
  - Project source (for context)

#### Scenario: Write scope
- **WHEN** file scope is generated
- **THEN** `write` array SHALL include:
  - Output directory for current stage
  - Example: `.spec-graph/sessions/<id>/tasks/**/*`

#### Scenario: Forbid scope
- **WHEN** file scope is generated
- **THEN** `forbid` array SHALL include:
  - Other stages' directories
  - System files
  - Example: `src/**/*` (unless implement stage)

### Requirement: Dispatch verification commands

Dispatch SHALL provide verification commands for stages that need them.

#### Scenario: Implement stage verification
- **WHEN** dispatch generates manifest for implement stage
- **THEN** verification SHALL include:
  - `tsc --noEmit` (if available)
  - `npm test` (if available)

#### Scenario: Other stages verification
- **WHEN** dispatch generates manifest for non-implement stages
- **THEN** verification SHALL be null or empty
- **AND** format verification note MAY be included in prompt

### Requirement: Dispatch next_step command

Dispatch SHALL provide the next_step command for each action.

#### Scenario: next_step format
- **WHEN** next_step is generated
- **THEN** it SHALL be a complete CLI command:
  ```
  spec-graph advance --session <id> --result '<json>'
  ```

#### Scenario: next_step placeholder
- **WHEN** next_step is generated
- **THEN** it SHALL include placeholder for result JSON:
  ```
  <json> → replaced with status-report JSON from sub-agent
  ```

### Requirement: Dispatch metadata

Dispatch SHALL include metadata in the manifest.

#### Scenario: Metadata fields
- **WHEN** manifest is generated
- **THEN** metadata SHALL include:
  - `timestamp`: ISO 8601 timestamp
  - `version`: spec-graph version (e.g., "3.0.0")
  - `capabilities`: list of capabilities (if available)

#### Scenario: Capabilities in metadata
- **WHEN** session has plan.capabilities
- **THEN** metadata.capabilities SHALL include the list
- **AND** each capability SHALL have id, description, dependsOn
