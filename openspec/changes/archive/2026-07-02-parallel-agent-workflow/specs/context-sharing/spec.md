## ADDED Requirements

### Requirement: Generate shared context per wave

The context-sharing module SHALL generate a shared context document for each parallel wave. This document SHALL be distributed to all sub-agents in the wave to ensure consistent understanding of the project state and other sub-agents' work.

#### Scenario: Wave with 3 sub-agents
- **WHEN** a wave contains 3 sub-agents (A, B, C)
- **THEN** each sub-agent SHALL receive the same shared context document

#### Scenario: Shared context includes project profile
- **WHEN** the shared context is generated
- **THEN** it SHALL include the project profile (language, framework, existing features, brownfield status)

#### Scenario: Shared context includes project overview
- **WHEN** the shared context is generated
- **THEN** it SHALL include a project overview (architecture, key modules, existing specs)

#### Scenario: Shared context includes other agents' plans
- **WHEN** sub-agent A's context is generated
- **THEN** it SHALL include read-only summaries of what sub-agents B and C plan to do

#### Scenario: Shared context includes methodology
- **WHEN** the shared context is generated
- **THEN** it SHALL include shared methodology guidance (naming conventions, code structure, commenting style)

### Requirement: Context minimization

The context-sharing module SHALL keep the shared context minimal to avoid overwhelming sub-agents. Only necessary information SHALL be included.

#### Scenario: Minimal context size
- **WHEN** shared context is generated for a wave
- **THEN** it SHALL be under 2000 words to avoid context window pressure

#### Scenario: Relevant information only
- **WHEN** the project has many existing specs
- **THEN** the shared context SHALL only include specs relevant to the current wave's tasks

### Requirement: Context format

The shared context SHALL be produced in both JSON (for programmatic access) and markdown (for human review and agent reading).

#### Scenario: JSON format
- **WHEN** shared context is generated
- **THEN** a JSON version SHALL be available for programmatic access

#### Scenario: Markdown format
- **WHEN** shared context is generated
- **THEN** a markdown version SHALL be available for human review and direct injection into agent prompts

### Requirement: Read-only other agents' plans

The shared context SHALL include other sub-agents' planned changes in a read-only format. Sub-agents SHALL NOT be able to modify other agents' plans.

#### Scenario: Read-only information
- **WHEN** sub-agent A receives shared context
- **THEN** A SHALL be able to read B and C's planned changes but not modify them

#### Scenario: Plan clarity
- **WHEN** other agents' plans are included
- **THEN** each plan SHALL clearly state which files the agent will modify (e.g., "sub-agent B will modify src/auth/*")

### Requirement: Shared methodology consistency

The shared context SHALL include consistent methodology guidance to ensure all sub-agents produce code with the same style.

#### Scenario: Consistent naming conventions
- **WHEN** the shared context specifies naming conventions
- **THEN** all sub-agents SHALL use the same naming style (e.g., camelCase for functions, PascalCase for classes)

#### Scenario: Consistent code structure
- **WHEN** the shared context specifies code structure
- **THEN** all sub-agents SHALL follow the same file organization and module structure
