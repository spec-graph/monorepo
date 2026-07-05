## ADDED Requirements

### Requirement: Sub-agent reads agent role file from manifest

The sub-agent SHALL read the file at the `role_file` path specified in the dispatch manifest and use its content as its role definition before executing the task.

#### Scenario: Sub-agent reads role file

- **WHEN** the sub-agent receives a manifest with `role_file` pointing to `pm-agent.md`
- **THEN** the sub-agent reads the file using the Read tool
- **AND** incorporates the role definition into its behavior

#### Scenario: Sub-agent follows role boundaries

- **WHEN** the PM agent role file specifies "Never propose HOW to build"
- **THEN** the sub-agent producing a proposal does not include implementation details

### Requirement: Sub-agent reads skill directories from manifest

The sub-agent SHALL read `instruction.md` and `templates/` from each directory listed in the manifest's `skills_dirs` field and apply the methodology guidance.

#### Scenario: Single skill

- **WHEN** the manifest contains one skill directory
- **THEN** the sub-agent reads `instruction.md` from that directory
- **AND** uses the methodology in its task execution

#### Scenario: Multiple skills

- **WHEN** the manifest contains multiple skill directories
- **THEN** the sub-agent reads all `instruction.md` files
- **AND** integrates the methodologies coherently

### Requirement: Sub-agent reads upstream context files

The sub-agent SHALL read all files listed in the manifest's `context_files` field to understand previous stage outputs.

#### Scenario: Multiple upstream files

- **WHEN** the manifest contains 3 upstream files (proposal, specs, design)
- **THEN** the sub-agent reads all 3 files
- **AND** incorporates information from all 3 into its task execution

#### Scenario: Unreadable file

- **WHEN** a file in `context_files` does not exist or cannot be read
- **THEN** the sub-agent reports `BLOCKED` in the status-report with the file path and error

### Requirement: Sub-agent writes output to manifest-specified path

The sub-agent SHALL write its deliverable to the exact path specified in the manifest's `output` field.

#### Scenario: Successful output

- **WHEN** the sub-agent completes its task
- **THEN** the deliverable file exists at the `output` path
- **AND** the status-report includes the `output` path in `artifacts_produced`

### Requirement: Sub-agent reports status in structured format

The sub-agent SHALL end every response with a `status-report` fenced code block containing JSON with `status`, `artifacts_produced`, `concerns`, `missing_context`, `blocker`, and `summary` fields.

#### Scenario: Successful completion

- **WHEN** the sub-agent completes the task successfully
- **THEN** the response ends with a status-report block where `status` is `DONE`
- **AND** `artifacts_produced` contains the output path

#### Scenario: Blocked

- **WHEN** the sub-agent cannot proceed due to missing context or unreadable files
- **THEN** the response ends with a status-report block where `status` is `BLOCKED`
- **AND** `blocker` describes the blocking issue

### Requirement: Sub-agent executes critical steps in order

The sub-agent SHALL follow the `CRITICAL STEPS` in the manifest prompt in the specified order and SHALL NOT skip any step.

#### Scenario: Ordered execution

- **WHEN** the manifest specifies critical steps 1-6 in order
- **THEN** the sub-agent reads the role file before reading skills
- **AND** reads skills before reading context
- **AND** executes the task before running checks
- **AND** runs checks before reporting status
