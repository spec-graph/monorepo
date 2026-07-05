## ADDED Requirements

### Requirement: Init creates .spec-graph directory

The `spec-graph init` command SHALL create the `.spec-graph/` directory structure at the project root.

#### Scenario: Fresh project init
- **WHEN** `spec-graph init` runs in a directory without `.spec-graph/`
- **THEN** it SHALL create `.spec-graph/` directory
- **AND** it SHALL create `.spec-graph/sessions/` directory
- **AND** it SHALL create `.spec-graph/config.yaml` with project context template

#### Scenario: config.yaml template
- **WHEN** `.spec-graph/config.yaml` is created
- **THEN** it SHALL contain:
  ```yaml
  version: "1"
  context:
    language: "<auto-detected>"
    framework: "<auto-detected>"
  rules:
    code_style: "follow project conventions"
    test_requirement: "every source file has a test file"
  references:
    readme: "README.md"
  ```

#### Scenario: Init fails if .spec-graph exists
- **WHEN** `spec-graph init` runs in a directory with existing `.spec-graph/`
- **THEN** it SHALL fail with error ".spec-graph/ already exists. Use --force to overwrite."
- **AND** it SHALL NOT overwrite existing directory

#### Scenario: Init with --force option
- **WHEN** `spec-graph init --force` runs in a directory with existing `.spec-graph/`
- **THEN** it SHALL overwrite existing `.spec-graph/` directory
- **AND** it SHALL create fresh directory structure

### Requirement: Init auto-registers hook

The `spec-graph init` command SHALL auto-register the dispatch-watcher hook to `.claude/settings.json`.

#### Scenario: Hook registration
- **WHEN** `spec-graph init` runs
- **THEN** it SHALL add dispatch-watcher hook to `.claude/settings.json`
- **AND** the hook SHALL be configured as:
  ```json
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": "Bash",
        "command": "node /path/to/dispatch-watcher.mjs"
      }]
    }
  }
  ```

#### Scenario: Hook registration preserves existing settings
- **WHEN** `spec-graph init` runs and `.claude/settings.json` already exists
- **THEN** it SHALL read existing settings
- **AND** it SHALL merge hook configuration
- **AND** it SHALL preserve other existing settings

#### Scenario: Hook registration is idempotent
- **WHEN** `spec-graph init` runs and dispatch-watcher hook already exists
- **THEN** it SHALL NOT add duplicate hook entry

#### Scenario: Init with --skip-hook option
- **WHEN** `spec-graph init --skip-hook` runs
- **THEN** it SHALL create `.spec-graph/` directory
- **AND** it SHALL NOT register hook to `.claude/settings.json`

### Requirement: Init auto-composes if packs exist

The `spec-graph init` command SHALL auto-run compose if `packs/` directory exists.

#### Scenario: Auto-compose
- **WHEN** `spec-graph init` runs and `packs/` directory exists
- **THEN** it SHALL run compose
- **AND** it SHALL create `.spec-graph/graph.yaml`

#### Scenario: No auto-compose if packs don't exist
- **WHEN** `spec-graph init` runs and `packs/` directory does not exist
- **THEN** it SHALL NOT run compose
- **AND** `.spec-graph/graph.yaml` SHALL NOT be created

### Requirement: Init provides verification output

The `spec-graph init` command SHALL provide clear output for verification.

#### Scenario: Success output
- **WHEN** `spec-graph init` completes successfully
- **THEN** it SHALL output:
  ```
  ✓ .spec-graph/ initialized
  ✓ dispatch-watcher hook registered (unless --skip-hook)
  ✓ graph.yaml generated (if packs exist)
  ```

#### Scenario: Verification commands
- **WHEN** user wants to verify init
- **THEN** they CAN run:
  ```bash
  ls .spec-graph/
  cat .claude/settings.json
  spec-graph compose  # if packs exist
  ```
