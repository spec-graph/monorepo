# dispatch-specs: dispatch supports specs stage

## Requirement: dispatch generates specs stage manifests

The dispatch module MUST generate correct manifests for the specs stage.

### Scenario: STAGE_OUTPUT_MAP includes specs

**Given** dispatch module loaded
**When** STAGE_OUTPUT_MAP['specs'] is accessed
**Then** dir is 'specs'
**And** file is 'specs.md'
**And** format describes Requirement/Scenario format

### Scenario: manifest includes specs metadata

**Given** session at specs stage
**When** generateDispatchManifest() is called
**Then** manifest has `specs` field
**And** manifest.specs.available is true (specs stage is always available)

### Scenario: manifest.specs.recommended for high complexity

**Given** session at specs stage
**And** plan.complexity is 'high'
**When** generateDispatchManifest() is called
**Then** manifest.specs.recommended is true

### Scenario: manifest.specs.recommended for open questions

**Given** session at specs stage
**And** plan.openQuestions has entries
**When** generateDispatchManifest() is called
**Then** manifest.specs.recommended is true
**And** manifest.specs.reason is 'Open questions need formal resolution'

### Scenario: manifest.specs.recommended for low complexity

**Given** session at specs stage
**And** plan.complexity is 'low'
**And** no open questions
**And** no security/brownfield risks
**When** generateDispatchManifest() is called
**Then** manifest.specs.recommended is false

### Scenario: specs stage action has correct agent

**Given** session at specs stage
**When** generateDispatchManifest() is called
**Then** actions[0].agent_id is 'architect'

### Scenario: skip specs path for 8-stage session

**Given** a session created before v3.3 (stagesVersion < 2)
**When** generateDispatchManifest() is called
**Then** the session continues at its current stage without hitting specs
**And** no specs action is generated for that session
