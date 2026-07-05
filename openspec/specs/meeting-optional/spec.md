# meeting-optional: meeting as optional tool in dispatch

## Requirement: dispatch manifest surfaces meeting availability

The dispatch manifest MUST include meeting metadata as an informational field. The existence of a meeting declaration in the graph does NOT automatically trigger a meeting — the coordinator decides.

### Scenario: meeting is available but not recommended

**Given** a meeting declaration exists with `on_actions: [plan, tasks]`
**And** plan has `complexity: "low"` and 1 capability
**When** dispatch generates manifest for tasks stage
**Then** manifest.meeting.available is `true`
**And** manifest.meeting.recommended is `false`
**And** hook system-reminder does NOT mention meeting

### Scenario: meeting is available and recommended (high complexity)

**Given** a meeting declaration exists with `on_actions: [plan, tasks]`
**And** plan has `complexity: "high"`
**When** dispatch generates manifest for tasks stage
**Then** manifest.meeting.available is `true`
**And** manifest.meeting.recommended is `true`
**And** manifest.meeting.reason is `"High complexity"`
**And** hook system-reminder includes meeting suggestion

### Scenario: meeting is available and recommended (many capabilities)

**Given** a meeting declaration exists with `on_actions: [plan, tasks]`
**And** plan has `capabilities.length > 3`
**When** dispatch generates manifest for tasks stage
**Then** manifest.meeting.recommended is `true`
**And** manifest.meeting.reason is `"Many capabilities"`

### Scenario: meeting is available and recommended (open questions)

**Given** a meeting declaration exists with `on_actions: [plan, tasks]`
**And** plan has `openQuestions.length > 0`
**When** dispatch generates manifest for tasks stage
**Then** manifest.meeting.recommended is `true`
**And** manifest.meeting.reason is `"Open questions remain"`

### Scenario: meeting is available and recommended (security/brownfield risks)

**Given** a meeting declaration exists with `on_actions: [plan, tasks]`
**And** plan.risks contains "security" or "brownfield"
**When** dispatch generates manifest for tasks stage
**Then** manifest.meeting.recommended is `true`

### Scenario: no meeting declaration for this stage

**Given** no meeting declaration has `on_actions` matching the current stage
**When** dispatch generates manifest
**Then** manifest.meeting is `null` or absent
**And** hook system-reminder does not mention meeting

### Scenario: meeting template is included in manifest

**Given** a meeting declaration exists
**When** dispatch generates manifest
**Then** manifest.meeting.template includes `{ id, purpose, participants, min_rounds, max_rounds }`

### Scenario: coordinator can initiate meeting even when not recommended

**Given** manifest.meeting.available is `true` and recommended is `false`
**When** coordinator detects ambiguity
**Then** coordinator can still call `spec-graph meeting init <id>`
**And** meeting runs normally

## Implementation Notes

- Add `meeting` field to `DispatchManifest` type in `packages/core/src/types/index.ts`
- Add `shouldRecommendMeeting()` function in `packages/core/src/dispatch/index.ts`
- Populate `manifest.meeting` in `generateDispatchManifest()`
- Update `dispatch-watcher.mjs` to conditionally show meeting info
- Decision table: complexity=high | capabilities>3 | openQuestions>0 | risky → recommended
