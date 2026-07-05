# foundation-pack: specs action and binding

## Requirement: foundation pack declares specs action and agent binding

Foundation pack MUST include `specs` in actions and agent_bindings.

### Scenario: foundation pack has specs action

**Given** foundation.pack pack.yaml
**When** provides.actions is read
**Then** `specs` is in the list

### Scenario: foundation pack binds specs to architect

**Given** foundation.pack pack.yaml
**When** provides.agent_bindings is read
**Then** `specs` maps to `architect`

### Scenario: compose produces graph with specs

**Given** composer runs with foundation.pack active
**When** graph.yaml is generated
**Then** graph.actions includes 'specs'
**And** graph.agent_bindings includes { action: 'specs', agent_id: 'architect' }

### Scenario: agent declarations support specs action

**Given** architect agent declaration
**When** actions list is read
**Then** it includes 'specs'
**And** architect can be dispatched for the specs action
