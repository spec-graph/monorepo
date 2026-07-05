# parse-js-yaml: automator YAML parser → js-yaml

## Requirement: automator uses js-yaml for state persistence

The automator MUST use `js-yaml` (already a project dependency) for reading and writing session state files, replacing the hand-written line-by-line parser.

### Scenario: loadSession parses state.yaml with js-yaml

**Given** `.spec-graph/sessions/<id>/state.yaml` exists in valid YAML format
**When** `loadSession(sessionId)` is called
**Then** session data is parsed correctly using `js-yaml`
**And** all SessionData fields are populated (sessionId, intent, stage, state, plan, trace, etc.)

### Scenario: saveSession writes state.yaml with js-yaml

**Given** a SessionData object in memory
**When** `saveSession(data)` is called
**Then** state.yaml is written using `js-yaml` dump
**And** the output is valid YAML
**And** subsequent `loadSession` reads it correctly

### Scenario: backward compat — old state.yaml files parse correctly

**Given** a state.yaml file written by the old hand-written format
**When** `loadSession(sessionId)` is called with js-yaml parser
**Then** session data is populated identically to the old parser
**And** stage legacy names are normalized ('plan' → 'tasks')

### Scenario: parser handles missing optional fields

**Given** a state.yaml file without optional fields (previousDiagnoses, retryCount)
**When** `loadSession(sessionId)` is called
**Then** missing fields get default values (empty arrays, 0)
**And** no parsing error occurs

### Scenario: parser handles malformed YAML gracefully

**Given** a state.yaml file with syntax errors
**When** `loadSession(sessionId)` is called
**Then** returns `null` (not throws)
**And** no crash

### Scenario: existing test suite passes

**Given** all existing automator tests
**When** `npm test` runs with js-yaml parser
**Then** all tests pass
**And** no test regressions

## Implementation Notes

- File: `packages/core/src/automator/index.ts`
- Remove: `parseStateYaml()` function (~200 lines)
- Remove: `formatStateYaml()` function (~60 lines)
- Add: `import * as yaml from 'js-yaml'` at top
- In `loadSession()`: replace `parseStateYaml(yaml)` with `yaml.load(raw) as SessionData`
- In `saveSession()`: replace `formatStateYaml(data)` with `yaml.dump(data, { lineWidth: 120, noRefs: true })`
- Keep: `_test = { formatStateYaml, parseStateYaml }` export — update to use js-yaml wrappers
- Net code change: ~-250 lines, +10 lines
