## MODIFIED Requirements

### Requirement: Tasks stage prompt includes capabilities

When generating the prompt for the `tasks` stage, the system SHALL include the `plan.capabilities` list in the prompt context so the sub-agent can produce tasks that align with the strategic plan.

#### Scenario: Tasks stage prompt includes capabilities
- **WHEN** dispatch is called for the `tasks` stage
- **THEN** the action's prompt SHALL list all capabilities from `state.yaml#plan.capabilities`

#### Scenario: Each capability description visible
- **WHEN** the sub-agent receives the tasks stage prompt
- **THEN** each capability's `id` and `description` SHALL be clearly presented

#### Scenario: Tasks cover capabilities requirement
- **WHEN** the tasks stage sub-agent produces tasks.md
- **THEN** tasks.md SHALL contain tasks covering every capability (enforced by gate)

### Requirement: Tasks gate verifies capability coverage

The `tasks` stage exit gate SHALL verify that tasks.md covers every capability from the strategic plan.

#### Scenario: Missing capability coverage fails gate
- **WHEN** tasks.md has tasks that don't cover all capabilities
- **THEN** the gate SHALL fail with a "coverage" diagnosis

#### Scenario: All capabilities covered passes
- **WHEN** tasks.md has tasks covering all capabilities
- **THEN** the gate SHALL pass
