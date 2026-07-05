## DELETED Requirements

### Requirement: external-coordination module

The `external-coordination` module SHALL be deleted. This module violates the brain-not-hands principle by spawning child processes to invoke agents.

#### Scenario: No external-coordination directory
- **WHEN** the codebase is inspected
- **THEN** `packages/core/src/external-coordination/` SHALL NOT exist

#### Scenario: No child_process imports
- **WHEN** `grep -r "child_process" packages/core/src/` runs
- **THEN** zero matches SHALL be found

#### Scenario: No invokeAgent function
- **WHEN** `grep -r "invokeAgent" packages/` runs
- **THEN** zero matches SHALL be found

### Requirement: prompt-construction module

The `prompt-construction` module SHALL be deleted. This module generates XML prompts for invokeAgent, which violates the brain-not-hands principle.

#### Scenario: No prompt-construction directory
- **WHEN** the codebase is inspected
- **THEN** `packages/core/src/prompt-construction/` SHALL NOT exist

#### Scenario: No XML prompt generation
- **WHEN** `grep -r "promptConstruction" packages/core/src/` runs
- **THEN** zero matches SHALL be found

### Requirement: auto command

The `auto` command SHALL be deleted. This command calls autoRun + invokeAgent, which violates the brain-not-hands principle.

#### Scenario: No auto command file
- **WHEN** the codebase is inspected
- **THEN** `packages/cli/src/commands/auto.ts` SHALL NOT exist

#### Scenario: auto command returns unknown
- **WHEN** user runs `spec-graph auto "..."`
- **THEN** it SHALL return "Unknown command" error

#### Scenario: No autoRun function
- **WHEN** `grep -r "autoRun" packages/` runs
- **THEN** zero matches SHALL be found

### Requirement: next-prompt command (XML format)

The `next-prompt` command SHALL be deleted if it only outputs XML format. If it also supports JSON output, the JSON version SHALL be preserved but XML output SHALL be removed.

#### Scenario: No next-prompt command file (if XML-only)
- **WHEN** the codebase is inspected
- **THEN** `packages/cli/src/commands/next-prompt.ts` SHALL NOT exist (if XML-only)

#### Scenario: next-prompt command returns unknown (if deleted)
- **WHEN** user runs `spec-graph next-prompt`
- **THEN** it SHALL return "Unknown command" error (if deleted)

### Requirement: spec-graph-auto SKILL

The `spec-graph-auto` SKILL SHALL be deleted. This SKILL references the auto command, which is being deleted.

#### Scenario: No spec-graph-auto directory
- **WHEN** the codebase is inspected
- **THEN** `packages/skills/spec-graph-auto/` SHALL NOT exist

### Requirement: Related tests deleted

All tests for deleted modules and commands SHALL be deleted.

#### Scenario: No external-coordination tests
- **WHEN** the codebase is inspected
- **THEN** no test files for external-coordination SHALL exist

#### Scenario: No prompt-construction tests
- **WHEN** the codebase is inspected
- **THEN** no test files for prompt-construction SHALL exist

#### Scenario: No auto command tests
- **WHEN** the codebase is inspected
- **THEN** no test files for auto command SHALL exist

#### Scenario: automator tests updated
- **WHEN** `packages/core/src/automator/index.test.ts` is inspected
- **THEN** test cases for autoRun() SHALL NOT exist

### Requirement: Exports updated

All exports referencing deleted modules SHALL be removed from index.ts files.

#### Scenario: core index.ts updated
- **WHEN** `packages/core/src/index.ts` is inspected
- **THEN** exports for externalCoordination and promptConstruction SHALL NOT exist

#### Scenario: cli index.ts updated
- **WHEN** `packages/cli/src/index.ts` is inspected
- **THEN** command registrations for auto and next-prompt SHALL NOT exist

### Requirement: Compilation passes

After all deletions, the codebase SHALL compile without errors.

#### Scenario: core package compiles
- **WHEN** `npm run build -w packages/core` runs
- **THEN** exit code SHALL be 0

#### Scenario: cli package compiles
- **WHEN** `npm run build -w packages/cli` runs
- **THEN** exit code SHALL be 0

### Requirement: Tests pass

After all deletions, all remaining tests SHALL pass.

#### Scenario: core tests pass
- **WHEN** `npm test -w packages/core` runs
- **THEN** all tests SHALL pass

#### Scenario: cli tests pass
- **WHEN** `npm test -w packages/cli` runs
- **THEN** all tests SHALL pass
