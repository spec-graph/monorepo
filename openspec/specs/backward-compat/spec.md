# backward-compat: 8-stage sessions continue working

## Requirement: sessions created before v3.3 skip the specs stage

Sessions created before the specs stage was added MUST continue through their workflow without being forced to produce specs.

### Scenario: old session without stagesVersion is detected

**Given** a session state.yaml with no `stagesVersion` field
**When** loadSession() is called
**Then** stagesVersion is set to 1 (pre-specs)

### Scenario: old session skips specs stage

**Given** an old session (stagesVersion: 1) at stage 'design'
**When** loadSession() returns the data
**Then** completedArtifacts includes 'specs/specs.md'
**And** stagesVersion is updated to 2
**And** data.stage is still 'design' (not reset)

### Scenario: old session can advance from design

**Given** an old session at 'design' that has been migrated
**When** submitResult is called with valid design.md
**Then** nextStage is 'tasks' (skipping specs because already completed)
**And** advance succeeds

### Scenario: new session goes through specs

**Given** a new session (stagesVersion: 2 or undefined, created by v3.3+)
**When** session is at 'specify' and submitResult succeeds
**Then** nextStage is 'specs'
**And** session progresses through the 9-stage path

### Scenario: existing test-project sessions unaffected

**Given** the existing test-project session at 'implement'
**When** the code is updated to v3.3
**And** the session is loaded
**Then** session continues at 'implement' without issues
**And** no specs-related errors occur
