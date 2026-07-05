# hook-specs: hook surfaces specs availability

## Requirement: dispatch-watcher hook shows specs recommendation

The dispatch-watcher hook MUST include specs stage availability in the system-reminder when relevant.

### Scenario: hook shows specs hint when recommended

**Given** manifest.specs.available is true
**And** manifest.specs.recommended is true
**When** hook processes the manifest
**Then** system-reminder includes specs recommendation text
**And** includes the reason from manifest.specs.reason

### Scenario: hook is silent when specs not recommended

**Given** manifest.specs.available is true
**And** manifest.specs.recommended is false
**When** hook processes the manifest
**Then** system-reminder does NOT mention specs

### Scenario: hook is silent when specs not available

**Given** manifest.specs is absent or available is false
**When** hook processes the manifest
**Then** system-reminder does NOT mention specs
