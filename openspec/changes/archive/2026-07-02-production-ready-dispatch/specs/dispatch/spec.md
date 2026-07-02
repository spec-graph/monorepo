## MODIFIED Requirements

### Requirement: Dispatch reads agent config from graph.yaml

When `.spec-graph/graph.yaml` exists, `generateDispatchManifest()` SHALL read agent declarations and bindings from it instead of scanning pack directories directly.

#### Scenario: Dispatch uses graph agents
- **WHEN** graph.yaml contains 5 agents and bindings for all 8 stages
- **THEN** the dispatch manifest SHALL reference agents from the graph, not from inline pack scanning

#### Scenario: Dispatch falls back to pack scanning
- **WHEN** graph.yaml does not exist
- **THEN** dispatch SHALL fall back to scanning pack directories (backward compatibility)

### Requirement: Dispatch uses machine-state for gate evaluation

The dispatch manifest generator SHALL use a three-level fallback chain to determine `gate_passed`, `missing_artifacts`, and `failed_checks`:
1. **machine-state.yaml** (primary) — consult tracked artifact/check statuses
2. **File-existence check** (fallback) — when machine-state.yaml does not exist, check if expected artifact files exist on disk
3. **Session diagnosis** (last resort) — when neither machine-state nor files provide a clear answer, use the session's recent diagnosis

machine-state is a best-effort mirror of automator gate results. The automator's `evaluateGate()` (gate-enforcement module) is the authoritative gate keeper. Dispatch's gate evaluation is for manifest display only and does not participate in automator state advancement decisions.

#### Scenario: Gate passed from machine state
- **WHEN** machine-state shows all required artifacts as completed
- **THEN** `manifest.gate_passed` SHALL be `true`

#### Scenario: Gate failed from machine state
- **WHEN** machine-state shows a required artifact as pending
- **THEN** `manifest.gate_passed` SHALL be `false` and `manifest.missing_artifacts` SHALL include that artifact

#### Scenario: Fallback to file existence when no machine state
- **WHEN** machine-state.yaml does not exist and the expected artifact file exists on disk
- **THEN** `manifest.gate_passed` SHALL be `true`

#### Scenario: Fallback to file existence when artifact missing
- **WHEN** machine-state.yaml does not exist and the expected artifact file does not exist on disk
- **THEN** `manifest.gate_passed` SHALL be `false` and `manifest.missing_artifacts` SHALL include the missing file path

### Requirement: Dispatch action includes output_spec field

Each `DispatchAction` in the manifest SHALL include an `output_spec` object containing: the exact output file path, optional template reference, and format description. (Already implemented — verification only.)

#### Scenario: Action has output spec populated
- **WHEN** a dispatch manifest is generated for any stage
- **THEN** every action with `requires_sub_agent: true` SHALL have a non-null `output_spec.path`

### Requirement: Dispatch action includes file_scope field

Each `DispatchAction` SHALL include `file_scope: { read: string[], write: string[], forbid: string[] }` populated with glob patterns. (Already implemented — verification only.)

#### Scenario: File scope has all three arrays
- **WHEN** a dispatch action is generated
- **THEN** file_scope.read, file_scope.write, and file_scope.forbid SHALL all be non-empty arrays

### Requirement: Dispatch action includes verification field

Each `DispatchAction` SHALL include a `verification` object with lint, test, and typecheck command strings where applicable. (Already implemented — verification only.)

#### Scenario: Implement stage has verification commands
- **WHEN** a dispatch manifest is generated for the implement stage
- **THEN** the action's verification field SHALL have non-empty lint, test, and typecheck strings
