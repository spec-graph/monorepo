# v3.0 Technical Design

## Design Principles

1. **Brain, Not Hands**: spec-graph never executes; only produces manifests
2. **Single Responsibility**: Each module has one clear purpose
3. **Backward Compatible**: Old sessions should work where possible
4. **Minimal Breaking Changes**: Only break what violates core principles
5. **Clear Boundaries**: Explicit separation between brain (spec-graph) and hands (external coordinators)

## Architecture Decisions

### Decision 1: Dual API Surface (Hook + Stateless)

**Choice:** spec-graph v3.0 provides two API surfaces:
- **Hook API**: `dispatch --json` + `dispatch-watcher.mjs` hook for local agent integration
- **Stateless API**: `next-prompt --json` + `advance --result` for external orchestration (if implemented)

**Alternatives considered:**
- Single API (hook only) → rejected: limits external orchestration integration
- Three APIs (hook + stateless + auto) → rejected: auto violates brain-not-hands
- No stateless API → rejected: CI/CD and remote agents need stateless access

**Trade-offs:**
- (+) Covers 95% of use cases (local + external orchestration)
- (+) Clear separation: hook for interactive, stateless for automation
- (-) Two code paths to maintain
- (-) Documentation must cover both paths

**Rationale:** The hook API is primary (90% of users), but stateless API preserves flexibility for advanced use cases. Auto mode is deleted because it violates brain-not-hands.

### Decision 2: Dispatch Manifest Structure

**Choice:** Dispatch manifest is a JSON object with this structure:

```typescript
interface DispatchManifest {
  sessionId: string;
  currentStage: Stage;
  gatePassed: boolean | null;
  actions: DispatchAction[];
  meetings?: Meeting[];
  metadata: {
    timestamp: string;
    version: string;
    capabilities?: Capability[];
  };
}

interface DispatchAction {
  id: string;
  agentId: string;
  modelTier: 'capable' | 'standard' | 'fast';
  parallelGroup: number;
  prompt: string; // 9-section envelope
  outputSpec: {
    path: string;
    format: string;
    template?: string;
  };
  fileScope: {
    read: string[];
    write: string[];
    forbid: string[];
  };
  verification?: {
    commands: string[];
    expectedExitCode: number;
  };
  nextStep: string; // CLI command to run after completion
}
```

**Alternatives considered:**
- XML manifest → rejected: harder to parse, less agent-friendly
- YAML manifest → rejected: JSON is more universal
- Simpler manifest (no parallelGroup, no fileScope) → rejected: sub-agents need this info

**Trade-offs:**
- (+) Structured, parseable, agent-friendly
- (+) Supports parallel execution (parallelGroup)
- (+) Clear file scope constraints (read/write/forbid)
- (+) 9-section envelope provides all context sub-agent needs
- (-) Verbose JSON
- (-) Requires sub-agent to parse and understand structure

**Rationale:** The 9-section envelope provides complete context: identity, system prompt, task context, input artifacts, output spec, file scope, verification, status report protocol, and next step. This eliminates ambiguity and reduces sub-agent failures.

### Decision 3: 9-Section Envelope Format

**Choice:** The `action.prompt` field contains a 9-section envelope:

```
## 1. Identity
You are the {agentId} agent — {agent.description}
Model tier: {modelTier}

## 2. System Prompt
{From pack/agents/{agentId}-agent.md}

## 3. Task Context
Stage: {currentStage}
Session: {sessionId}
Intent: {user intent}
Action: {specific action description}
Parallel group: {parallelGroup}

## 4. Input Artifacts (READ-ONLY)
{Upstream artifacts with id, kind, path, content (truncated to 3000 chars)}

## 5. Output Specification (MUST)
Exact path: {outputSpec.path}
Template: {outputSpec.template}
Format: {outputSpec.format}
"You MUST write the artifact to the exact path above"

## 6. File Scope (MUST)
Read: {fileScope.read[]}
Write: {fileScope.write[]}
Forbid: {fileScope.forbid[]}
"Violating scope = BLOCKED status"

## 7. Verification (MUST)
Commands: {verification.commands[]}
Expected exit code: {verification.expectedExitCode}

## 8. Status Report Protocol (MUST)
You MUST return a fenced code block:
```status-report
{"status":"DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED",
 "artifacts_produced":[...],
 "concerns":[],
 "missing_context":null,
 "blocker":null,
 "summary":"..."}
```

## 9. After Completion
Next step: {nextStep}
"The coordinator will run: {nextStep}"
```

**Alternatives considered:**
- XML format (v2's prompt-construction) → rejected: more complex, less readable
- Markdown-only → rejected: no explicit priority levels
- JSON prompt → rejected: verbose for natural language
- Free-form text → rejected: no structure, agents may miss priorities

**Trade-offs:**
- (+) Clear structure, agent-friendly
- (+) Each section has explicit responsibility
- (+) MUST/SHOULD/MAY semantics via section headers
- (+) Status report protocol ensures structured responses
- (-) Verbose (but necessary for clarity)
- (-) Requires sub-agent to understand all 9 sections

**Rationale:** The 9-section envelope is already implemented in the dispatch module and proven to work. It provides complete context without ambiguity.

### Decision 4: Stage Rename (plan → tasks)

**Choice:** FSM stage `plan` is renamed to `tasks` to eliminate naming collision with `spec-graph plan` CLI command.

**What changes:**
- `STAGES` array: `'plan'` → `'tasks'`
- `Stage` type union: inferred from STAGES
- `STAGE_OUTPUTS` dictionary: `plan:` → `tasks:`
- `dispatch STAGE_OUTPUT_MAP`: `plan:` → `tasks:`
- `nextPrompt` methodology selection: `stage === 'plan'` → `stage === 'tasks'`
- `knowledge/stages/plan/` directory → `knowledge/stages/tasks/`
- Pack `agent_bindings`: `plan:` → `tasks:`
- Pack `actions` arrays: `'plan'` → `'tasks'`
- Pack `gate on_transition`: `[plan, implement]` → `[tasks, implement]`
- Test files referencing `'plan'` stage

**What does NOT change:**
- `Plan` TypeScript interface (capital P, represents Plan object)
- `state.yaml#plan` field (Plan object storage)
- `plan.capabilities` field
- `planning.generatePlan()` function
- `spec-graph plan` CLI command (strategic planning)

**Backward compatibility:**
- Dispatch auto-maps old stage name `"plan"` → `"tasks"`
- Old sessions with `stage: "plan"` in state.yaml continue to work
- Optional migration script: `spec-graph migrate`

**Alternatives considered:**
- Rename CLI command instead → rejected: `spec-graph plan` is user-facing, breaking change
- Keep both names (alias) → rejected: confusing, adds complexity
- Rename to `decompose` or `breakdown` → rejected: `tasks` matches output artifact `tasks.md`

**Trade-offs:**
- (+) Eliminates naming collision
- (+) Stage name matches output artifact (tasks stage → tasks.md)
- (+) Backward compatible (auto-mapping)
- (-) Requires grep + replace across codebase
- (-) Some confusion during transition

**Rationale:** The collision between `spec-graph plan` (strategic) and FSM `plan` stage (tactical) is confusing. Renaming the FSM stage to `tasks` is less disruptive than renaming the CLI command.

### Decision 5: Init Command Implementation

**Choice:** `spec-graph init` creates the `.spec-graph/` directory structure and auto-registers the dispatch-watcher hook.

**Directory structure:**
```
.spec-graph/
├── config.yaml     # Project context template
├── sessions/       # Empty directory for sessions
└── graph.yaml      # (optional, if packs/ exists)
```

**config.yaml template:**
```yaml
version: "1"
context:
  language: "<auto-detected>"
  framework: "<auto-detected>"
rules:
  code_style: "follow project conventions"
  test_requirement: "every source file has a test file"
references:
  readme: "README.md"
```

**Hook auto-registration:**
```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "command": "node /path/to/dispatch-watcher.mjs"
    }]
  }
}
```

**Options:**
- `--force`: Overwrite existing `.spec-graph/`
- `--skip-hook`: Create directory only, skip hook registration

**Implementation logic:**
1. Check if `.spec-graph/` exists → error unless `--force`
2. Create `.spec-graph/` directory
3. Create `sessions/` subdirectory
4. Write `config.yaml` template
5. If `--skip-hook` not set → register hook to `.claude/settings.json`
   - Read existing settings.json (if exists)
   - Merge hook configuration
   - Preserve other settings
6. If `packs/` directory exists → auto-run `compose` → `graph.yaml`

**Alternatives considered:**
- Don't auto-register hook → rejected: poor UX, users must manually configure
- Separate `install` command for hook → rejected: extra step, confusing
- Don't auto-compose → rejected: users expect immediate usability

**Trade-offs:**
- (+) One-command setup: `spec-graph init` → ready to use
- (+) Hook auto-registered → dispatch works immediately
- (+) Auto-compose if packs exist → graph.yaml ready
- (-) Modifies `.claude/settings.json` (some users may find this surprising)
- (-) Auto-compose may fail if packs are misconfigured

**Rationale:** Users should be able to start using spec-graph immediately after `init`. Auto-registering the hook and auto-composing (if packs exist) eliminates friction.

### Decision 6: Implement Gate Real Checking

**Choice:** Implement stage gate checks:
1. Source files exist (non-.md files in `implement/` directory)
2. `tsc --noEmit` passes (if `tsc` script exists in package.json)
3. Tests pass (if `test` script exists in package.json)

**Gate evaluation logic:**
```typescript
async function evaluateImplementGate(sessionDir: string): Promise<GateResult> {
  const implementDir = path.join(sessionDir, 'implement');
  
  // Check 1: Source files exist
  const files = fs.readdirSync(implementDir, {recursive: true});
  const sourceFiles = files.filter(f => !f.endsWith('.md'));
  
  if (sourceFiles.length === 0) {
    return {
      passed: false,
      failed_criteria: ['source_files_exist'],
      reasons: ['No source files found in implement/'],
      evidence: [],
      suggested_fix: 'Create at least one source file'
    };
  }
  
  // Check 2: tsc --noEmit (if available)
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    if (packageJson.scripts?.tsc) {
      const result = spawnSync('npm', ['run', 'tsc', '--', '--noEmit'], {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });
      
      if (result.status !== 0) {
        return {
          passed: false,
          failed_criteria: ['tsc_pass'],
          reasons: ['TypeScript compilation failed'],
          evidence: [result.stdout, result.stderr],
          suggested_fix: 'Fix TypeScript errors'
        };
      }
    }
    
    // Check 3: Tests (if available)
    if (packageJson.scripts?.test) {
      const result = spawnSync('npm', ['test'], {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });
      
      if (result.status !== 0) {
        return {
          passed: false,
          failed_criteria: ['tests_pass'],
          reasons: ['Tests failed'],
          evidence: [result.stdout, result.stderr],
          suggested_fix: 'Fix failing tests'
        };
      }
    }
  }
  
  return {passed: true, failed_criteria: [], reasons: [], evidence: []};
}
```

**Alternatives considered:**
- Always run tsc/tests → rejected: breaks projects without tsc/tests
- Only check file existence → rejected: doesn't catch compilation/test errors
- Run tsc/tests only if explicitly configured → rejected: too restrictive

**Trade-offs:**
- (+) Graceful degradation (only checks what's available)
- (+) Catches common errors (compilation, test failures)
- (+) Clear diagnosis on failure
- (-) Spawns child processes (but only for gate evaluation, not agent invocation)
- (-) May be slow for large projects

**Rationale:** The implement gate should verify that code is at least compilable and testable. Graceful degradation ensures it works for all projects.

### Decision 7: Hook Registration Mechanism

**Choice:** Init command auto-registers the dispatch-watcher hook to `.claude/settings.json`.

**Registration logic:**
```typescript
async function registerHook(root: string): Promise<void> {
  const claudeDir = path.join(root, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  
  fs.mkdirSync(claudeDir, {recursive: true});
  
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  
  const hookCommand = `node ${path.resolve(__dirname, '../../packages/core/hooks/dispatch-watcher.mjs')}`;
  
  const existingHook = settings.hooks.PostToolUse.find(
    (h: any) => h.matcher === 'Bash' && h.command.includes('dispatch-watcher')
  );
  
  if (!existingHook) {
    settings.hooks.PostToolUse.push({
      matcher: 'Bash',
      command: hookCommand
    });
  }
  
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
```

**Alternatives considered:**
- Don't auto-register → rejected: poor UX
- Separate `install` command → rejected: extra step
- Use absolute path → rejected: breaks if spec-graph is moved
- Use relative path → rejected: may not resolve correctly

**Trade-offs:**
- (+) One-time setup, no manual configuration
- (+) Preserves existing settings
- (+) Idempotent (checks for existing hook)
- (-) Modifies `.claude/settings.json` (some users may find this surprising)
- (-) Hook path may break if spec-graph is reinstalled

**Rationale:** Auto-registration eliminates friction. Users can skip with `--skip-hook` if they prefer manual configuration.

### Decision 8: Backward Compatibility Strategy

**Choice:** Old sessions with `stage: "plan"` are auto-mapped to `"tasks"` by dispatch.

**Implementation:**
```typescript
function normalizeStage(stage: string): Stage {
  if (stage === 'plan') return 'tasks'; // Auto-map old stage name
  return stage as Stage;
}

// In dispatch or loadSession:
const normalizedStage = normalizeStage(session.stage);
```

**What's compatible:**
- Old sessions with `stage: "plan"` → auto-mapped to `"tasks"`
- Old `state.yaml` format → still readable
- Old `machine-state.yaml` format → still readable
- Old `graph.yaml` format → still readable

**What's not compatible:**
- `auto` command → deleted (use dispatch + hook)
- XML prompts → deleted (use 9-section envelope)
- `external-coordination` module → deleted (use hook)

**Migration path:**
1. Delete `.spec-graph/` (incompatible format for some internal structures)
2. `npm uninstall -g spec-graph`
3. `npm install -g spec-graph@3`
4. `spec-graph init` (recreate `.spec-graph/`)
5. `spec-graph plan "<intent>"` (start new session)

**Alternatives considered:**
- No backward compatibility → rejected: breaks existing sessions
- Full backward compatibility (keep auto, XML) → rejected: violates brain-not-hands
- Migration script → rejected: too complex, fresh start is cleaner

**Trade-offs:**
- (+) Old sessions continue to work (stage auto-mapping)
- (+) Clear migration path for breaking changes
- (+) Semantic versioning (v3.0.0) signals breaking changes
- (-) Some manual migration required (delete `.spec-graph/`)
- (-) Auto-mapping adds complexity

**Rationale:** Auto-mapping the stage name is a small price for backward compatibility. Breaking changes (auto, XML) are necessary to enforce brain-not-hands.

## Module Design

### Dispatch Module

**Responsibility:** Generate dispatch manifests with 9-section envelopes.

**Key functions:**
- `generateManifest(session, graph, machineState) → DispatchManifest`
- `buildPrompt(action, stage, session, graph) → string` (9-section envelope)
- `normalizeStage(stage) → Stage` (backward compatibility)

**Inputs:**
- `session`: Current session state (state.yaml)
- `graph`: Composed graph (graph.yaml)
- `machineState`: Artifact tracking (machine-state.yaml)

**Outputs:**
- `DispatchManifest`: JSON object with actions, meetings, metadata

**Error handling:**
- If no actions for current stage → return empty manifest
- If agent not found in graph → throw error
- If stage not recognized → throw error

### Gate Enforcement Module

**Responsibility:** Evaluate gate criteria and provide diagnosis on failure.

**Key functions:**
- `evaluateGate(stage, sessionDir, artifacts) → GateResult`
- `diagnoseFailure(result) → Diagnosis`

**Gate criteria per stage:**
- `specify`: file exists + 4 sections (Problem/Solution/Scope/Risks)
- `design`: file exists + 4 sections + traceability to proposal
- `tasks`: checkbox format + ≥3 tasks
- `implement`: source files exist + tsc pass (if available) + tests pass (if available)
- `review`: findings + resolutions
- `test`: test results + coverage
- `accept`: acceptance criteria + manual confirmation
- `integrate`: Summary + Test Plan

**Error handling:**
- If gate evaluation fails → return diagnosis with suggested fix
- If artifact not found → return failed gate result
- If tsc/tests fail → include error output in evidence

### Automator Module

**Responsibility:** Manage FSM state transitions.

**Key functions:**
- `loadSession(sessionId) → Session`
- `saveSession(session) → void`
- `advanceStage(session, result) → Session`
- `diagnoseFailure(session) → Diagnosis`

**State transitions:**
- `paused` → `running` (on confirm)
- `running` → `running` (on advance, stage progression)
- `running` → `completed` (on final stage complete)

**Error handling:**
- If session not found → throw error
- If stage not recognized → throw error
- If gate fails → return diagnosis, don't advance

## Data Structures

### Session (state.yaml)

```yaml
sessionId: "build-jwt-auth-system"
state: "running" # paused | running | completed
stage: "tasks" # current FSM stage
plan:
  capabilities:
    - id: "auth-core"
      description: "JWT signing and verification"
      dependsOn: []
    - id: "auth-middleware"
      description: "Express middleware"
      dependsOn: ["auth-core"]
  order: ["auth-core", "auth-db", "auth-middleware", "auth-routes"]
  complexity: "medium"
  risks: ["security-sensitive"]
trace:
  - timestamp: "2026-07-02T10:00:00Z"
    trigger: "user-plan"
    fromStage: null
    toStage: null
  - timestamp: "2026-07-02T10:05:00Z"
    trigger: "user-force"
    fromStage: null
    toStage: null
completedArtifacts:
  - stage: "specify"
    path: "specify/proposal.md"
    timestamp: "2026-07-02T10:10:00Z"
  - stage: "design"
    path: "design/design.md"
    timestamp: "2026-07-02T10:20:00Z"
previousDiagnoses: []
retryCount: 0
readyForArchive: false
```

### Dispatch Manifest

```json
{
  "sessionId": "build-jwt-auth-system",
  "currentStage": "tasks",
  "gatePassed": null,
  "actions": [
    {
      "id": "tasks-001",
      "agentId": "developer",
      "modelTier": "standard",
      "parallelGroup": 0,
      "prompt": "## 1. Identity\nYou are the developer agent...",
      "outputSpec": {
        "path": ".spec-graph/sessions/build-jwt-auth-system/tasks/tasks.md",
        "format": "Markdown with checkbox format",
        "template": "knowledge/stages/tasks/templates/tasks.md"
      },
      "fileScope": {
        "read": [".spec-graph/sessions/build-jwt-auth-system/**/*"],
        "write": [".spec-graph/sessions/build-jwt-auth-system/tasks/**/*"],
        "forbid": ["src/**/*", "packages/**/*"]
      },
      "verification": null,
      "nextStep": "spec-graph advance --session build-jwt-auth-system --result '{...}'"
    }
  ],
  "meetings": [],
  "metadata": {
    "timestamp": "2026-07-02T10:25:00Z",
    "version": "3.0.0",
    "capabilities": [...]
  }
}
```

### Machine State (machine-state.yaml)

```yaml
sessionId: "build-jwt-auth-system"
artifacts:
  specify:
    proposal.md:
      status: "completed"
      path: "specify/proposal.md"
      timestamp: "2026-07-02T10:10:00Z"
  design:
    design.md:
      status: "completed"
      path: "design/design.md"
      timestamp: "2026-07-02T10:20:00Z"
  tasks:
    tasks.md:
      status: "in_progress"
      path: "tasks/tasks.md"
      timestamp: "2026-07-02T10:25:00Z"
  implement:
    auth-core:
      status: "pending"
    auth-db:
      status: "pending"
    auth-middleware:
      status: "pending"
    auth-routes:
      status: "pending"
```

## Testing Strategy

### Unit Tests

**Per module:**
- `automator/index.test.ts`: State transitions, stage normalization
- `dispatch/index.test.ts`: Manifest generation, 9-section envelope
- `gate-enforcement/index.test.ts`: Gate evaluation per stage
- `composer/index.test.ts`: Pack composition, filtering
- `planning/index.test.ts`: Intent decomposition

### Integration Tests

**End-to-end command tests:**
- `init.test.ts`: Directory creation, hook registration
- `plan.test.ts`: Session creation, capability decomposition
- `confirm.test.ts`: State transition
- `compose.test.ts`: Graph generation
- `dispatch.test.ts`: Manifest output
- `advance.test.ts`: Gate evaluation, state progression

### Manual Tests

**Full workflow:**
1. `spec-graph init` → verify `.spec-graph/` created, hook registered
2. `spec-graph plan "Build JWT auth"` → verify session created
3. `spec-graph confirm <id>` → verify state = "running"
4. `spec-graph compose` → verify `graph.yaml` created
5. `spec-graph dispatch --session <id> --json` → verify manifest JSON
6. Verify hook auto-triggers (check system-reminder injection)
7. Manually dispatch sub-agent (mock)
8. `spec-graph advance --session <id> --result '{...}'` → verify gate evaluation

### Validation

**Grep validation:**
```bash
grep -r "child_process" packages/core/src/ → 0 matches
grep -r "invokeAgent" packages/ → 0 matches
grep -r "autoRun" packages/ → 0 matches
grep -r "externalCoordination" packages/core/src/ → 0 matches
grep -r "promptConstruction" packages/core/src/ → 0 matches
```

**Compilation:**
```bash
npm run build -w packages/core
npm run build -w packages/cli
```

**Tests:**
```bash
npm test -w packages/core
npm test -w packages/cli
```

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Hook command injection | Hook path is resolved at init time, not user input |
| Manifest tampering | Manifest is read-only; sub-agent can't modify it |
| File scope violation | Sub-agent instructed to respect scope; violation = BLOCKED status |
| Path traversal | Artifact paths validated against session directory |
| State corruption | Single-session-per-project rule; YAML is human-readable for debugging |

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| CLI command latency | <100ms for status/dispatch/advance | Time from invocation to first output |
| Manifest generation | <50ms | Time to generate dispatch manifest |
| Gate evaluation | <200ms (without tsc/tests) | Time to evaluate gate criteria |
| Gate evaluation (with tsc/tests) | <5s | Time to run tsc + tests |
| State persistence | <50ms per write | Time to write state.yaml |
| Hook injection | <10ms | Time for hook to inject system-reminder |

## Future Enhancements (v3.1+)

**v3.1:**
- Compose `$or/$and` operators for pack filtering
- Tasks stage prompt includes capabilities list

**v3.2:**
- E2E tests with mock sub-agents
- E2E tests with real sub-agents (optional)

**v4.0 (future):**
- Observability: OpenTelemetry metrics export
- Alerting: On repeated gate failures
- Multi-session support (concurrent sessions per project)
- Plugin system for custom agents
