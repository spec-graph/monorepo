## MODIFIED Requirements

### Requirement: Tasks stage prompt includes capabilities

The tasks stage prompt SHALL include the `plan.capabilities` list so sub-agents can produce aligned tasks.

#### Scenario: Capabilities in prompt
- **WHEN** dispatch runs for tasks stage
- **THEN** action.prompt SHALL list all capabilities from `state.yaml#plan.capabilities`

#### Scenario: Gate verifies coverage
- **WHEN** tasks.md is produced
- **THEN** gate SHALL verify it covers every capability
