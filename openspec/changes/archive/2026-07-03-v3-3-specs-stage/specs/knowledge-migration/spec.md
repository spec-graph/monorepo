# knowledge-migration: move specs-authoring to specs stage

## Requirement: specs-authoring skill lives in specs stage, not design

The specs-authoring skill MUST be moved from `knowledge/stages/design/skills/` to `knowledge/stages/specs/skills/`.

### Scenario: specs-authoring exists in specs stage

**Given** knowledge/stages/specs/skills/
**When** directory listing
**Then** `specs-authoring/` exists
**And** contains `instruction.md`
**And** contains `templates/spec.md`

### Scenario: specs-authoring removed from design stage

**Given** knowledge/stages/design/skills/
**When** directory listing
**Then** `specs-authoring/` does NOT exist

### Scenario: knowledge-base loads specs-authoring for specs stage

**Given** loadKnowledgeBase() is called
**When** skills are listed for specs stage
**Then** specs-authoring is included
**And** instruction content is loaded

### Scenario: knowledge-base no longer loads specs-authoring for design

**Given** loadKnowledgeBase() is called
**When** skills are listed for design stage
**Then** specs-authoring is NOT included
