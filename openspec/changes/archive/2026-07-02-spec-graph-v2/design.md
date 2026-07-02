## Context

spec-graph v1 is a TypeScript/Node.js monorepo with three packages (core, server, ui) and ~24k LOC. It implements an 8-stage FSM, 50+ CLI commands, 17 packs, 22-dimension sense, and a dispatch-manifest generator. However, v1 lacks automatic progression (users must manually invoke commands), has drifted into executor territory (server, UI, merge-queue, worktree management), and its dispatch manifests are not rich enough to guide AI agents effectively.

The v2 repositioning is to become a "strict-gate, prompt-driven, automatic progression development brain" — a brain that generates rich prompts for external agents and evaluates their outputs, but never executes directly. It absorbs OpenSpec's document refinement methodology and BMAD's expert skill methodology as built-in knowledge.

Constraints:
- spec-graph v2 runs as a CLI tool, invoked by users or external orchestration
- All execution is delegated to external AI agents (Claude Code, Codex, Gemini CLI, etc.)
- The workflow is driven by a single-loop automatic progression in `auto` mode
- The only mandatory human-in-the-loop point is the planning phase
- Must be installable globally via `npm install -g spec-graph`
- Must work offline (no cloud dependencies)
- Must preserve session state across process restarts

## Product Form

spec-graph v2 is delivered as **three layers**, following the same dual-form pattern used by OpenSpec (which provides both CLI commands and Claude Code skills that orchestrate those commands).

```
┌─────────────────────────────────────────────────────────┐
│  Layer A: Skills (SKILL.md files for AI agents)         │
│   packages/skills/spec-graph-{plan,auto,status,intervene} │
│   Each SKILL.md contains: stance, steps, response       │
│   handling, edge cases. Skills orchestrate CLI commands.│
└─────────────────────────────────────────────────────────┘
                          ▲ orchestrate
┌─────────────────────────────────────────────────────────┐
│  Layer B: CLI (command-line tool, human + agent-driven) │
│   packages/cli: 8 commands                              │
│   - plan / auto / status / next-prompt / advance        │
│   - validate / intervene / diagnose                     │
│   Three API surfaces: auto / stateless / hook           │
└─────────────────────────────────────────────────────────┘
                          ▲ call
┌─────────────────────────────────────────────────────────┐
│  Layer C: core (TypeScript library — the brain)         │
│   7 modules:                                            │
│   automator / prompt-construction / planning /          │
│   gate-enforcement / external-coordination /            │
│   knowledge-base / recovery                             │
│   Exposes a TypeScript API. No direct user interaction. │
└─────────────────────────────────────────────────────────┘
```

**Three user types and how they use spec-graph:**

1. **Humans** use the CLI directly in a terminal:
   - `spec-graph plan "<intent>"` → see plan, confirm
   - `spec-graph auto "<intent>"` → watch automation run
   - `spec-graph status` → inspect current state

2. **AI agents (Claude Code, etc.)** use the skills:
   - Read `spec-graph-plan/SKILL.md` → invoke `spec-graph plan` via bash
   - Read `spec-graph-auto/SKILL.md` → invoke `spec-graph auto` via bash
   - The skill guides the agent's stance, step sequence, and response handling

3. **External orchestration systems** use the CLI's stateless API:
   - `spec-graph next-prompt --json` → get next prompt
   - Run agent with that prompt
   - `spec-graph advance --result "..."` → submit result, advance state

## Goals / Non-Goals

**Goals:**
- Deliver a single CLI tool that can automatically run a development workflow from intent to integrated PR with minimal human intervention
- Provide three API surfaces: `auto` (full automatic), `stateless` (external orchestration), `hook` (agent hook integration)
- Absorb OpenSpec and BMAD methodologies as built-in knowledge, accessible via a knowledge-base
- Enforce strict quality gates at every stage with progressive retry and diagnosis
- Keep spec-graph a "brain, not hands" — no direct execution
- Produce rich, layered prompts (MUST/SHOULD/MAY) that external agents can reliably consume
- Support multiple external agents via pluggable adapters
- Persist state to disk for crash recovery and session continuity
- First milestone: `spec-graph auto "Add JWT authentication"` on a real Express project

**Non-Goals:**
- v2 will not include an HTTP server (drop packages/server)
- v2 will not include a web UI (drop packages/ui)
- v2 will not execute code, write documents, or run tests directly
- v2 will not replace OpenSpec or BMAD as standalone tools; it absorbs their methodologies
- v2 will not manage git operations directly (delegate to external agent)
- v2 will not provide fine-grained control over every step in `auto` mode (configuration only)
- v2 will not support multiple concurrent active sessions per project

## Decisions

### Decision 1: Monorepo with three packages (core, cli, skills)

**Choice:** spec-graph v2 will be a monorepo with three packages:
- `packages/core` — TypeScript library (the engine). Exposes a TypeScript API; does not face any user directly.
- `packages/cli` — CLI application. Used directly by humans in terminals; orchestrated by skills for AI agents. Published to npm as `spec-graph`.
- `packages/skills` — SKILL.md file collection. One skill per major user-facing workflow. Each skill is a SKILL.md that Claude Code reads and follows.

**Alternatives considered:**
- Single monolithic package → rejected: SKILL.md files have a different delivery lifecycle than CLI binary; skills are copied into `.claude/skills/`, not installed via npm. Mixing these creates confusion.
- Keep v1 monorepo shape (core + server + ui) → rejected: server and ui are removed in v2
- Three separate npm packages (not monorepo) → rejected: tight coupling between core and cli means they should share a release cycle

**Trade-offs:**
- (+) Clear separation: core as library, cli as binary, skills as text
- (+) Each package can be versioned and released independently if needed
- (-) Slightly more complex build tooling than single package
- (-) Users must install all three packages (mitigated by npm workspace hoisting)

### Decision 1b: Skills installation flow

**Choice:** The `packages/skills` directory contains SKILL.md files organized as `packages/skills/<skill-name>/SKILL.md`. During `npm install -g spec-graph` (or via a post-install script), the skills are copied or symlinked into the user's `~/.claude/skills/` directory (or project-local `.claude/skills/`). Alternatively, users manually install skills via a `spec-graph install-skills` command.

**Alternatives considered:**
- Users manually copy SKILL.md files → rejected: poor UX
- Publish skills as a separate npm package → rejected: adds friction; better to ship with the CLI
- Auto-detect Claude Code installation and copy on first use → rejected: too magical, violates user control

**Trade-offs:**
- (+) One-command installation: `npm install -g spec-graph` sets up everything
- (+) Users can override individual skills by copying to project-local `.claude/skills/`
- (-) Global install modifies user's `~/.claude/skills/` — some users may find this surprising

### Decision 2: File-based state persistence (not database)

**Choice:** spec-graph v2 will persist all state in a `.spec-graph/` directory at the project root using YAML and JSON files. No external database.

**Files:**
- `.spec-graph/sessions/<session-id>/state.yaml` — current state machine state, active stage, plan, trace log
- `.spec-graph/sessions/<session-id>/<stage>/<artifact>.md` — artifacts produced by each stage

**Alternatives considered:**
- SQLite → rejected: unnecessary dependency, state is small enough for YAML, and YAML is human-readable for debugging
- Cloud state store → rejected: violates the "local-first" philosophy; spec-graph must work offline
- JSON files → rejected: YAML is more readable for humans editing state files directly

**Trade-offs:**
- (+) Zero additional dependencies
- (+) State is inspectable and editable by users
- (+) Git-friendly (the .spec-graph/ directory can be committed or .gitignored per user preference)
- (-) YAML parsing requires a custom parser (we wrote a minimal one; no js-yaml dependency)
- (-) Concurrent writes from multiple processes could corrupt state (mitigated by single-session-per-project rule)

### Decision 3: Knowledge-base as directory tree (not embedded code)

**Choice:** The knowledge-base will be a directory tree of markdown files organized as `knowledge/stages/<stage>/skills/<skill>/{instruction.md, templates/}`. spec-graph ships with a default knowledge-base; users can extend or override by placing files in `.spec-graph/knowledge/`.

**Structure:**
```
knowledge/
├── stages/
│   ├── specify/
│   │   ├── skills/
│   │   │   ├── requirement-analysis/
│   │   │   │   ├── instruction.md     (OpenSpec-style proposal instruction)
│   │   │   │   └── templates/
│   │   │   │       └── proposal.md
│   │   └── gate.yaml                  (entry/exit criteria for specify stage)
│   ├── design/
│   │   ├── skills/
│   │   │   ├── specs-authoring/
│   │   │   └── design-authoring/
│   │   └── gate.yaml
│   ├── plan/
│   │   ├── skills/
│   │   │   └── task-decomposition/
│   │   └── gate.yaml
│   ├── implement/
│   │   ├── skills/
│   │   │   └── code-generation/
│   │   └── gate.yaml
│   ├── review/
│   │   ├── skills/
│   │   │   └── code-review/
│   │   └── gate.yaml
│   ├── test/
│   │   ├── skills/
│   │   │   └── test-strategy/
│   │   └── gate.yaml
│   ├── accept/
│   │   ├── skills/
│   │   │   └── e2e-verification/
│   │   └── gate.yaml
│   └── integrate/
│       ├── skills/
│       │   └── ci-integration/
│       └── gate.yaml
└── shared/
    ├── prompt-schema.md             (XML prompt format specification)
    ├── project-context.md           (project profile template)
    └── verification-format.md       (agent result format specification)
```

**Alternatives considered:**
- Embed methodologies as TypeScript strings → rejected: hard to edit, hard to extend, no version control for methodology
- Use a database → rejected: overkill, loses the "text is the interface" property
- Follow OpenSpec's schema format exactly → rejected: too rigid; spec-graph has 8 stages not 4, and methodology needs to be stage-specific
- JSON/YAML methodology format → rejected: markdown is better for methodology (long-form prose, code blocks, formatting)

**Trade-offs:**
- (+) Methodologies are primarily text (instructions, templates); markdown is the natural format
- (+) Directory tree is easy to navigate, edit, and extend
- (+) OpenSpec's instructions and BMAD's SKILL.md are already in this format
- (+) Users can add new skills without code changes
- (+) Layered override: knowledge-base (default) → .spec-graph/knowledge (local override)
- (-) Requires a loader to walk the directory tree at startup
- (-) Skills are not versioned (mitigated by knowledge-base being part of the package release)

### Decision 4: Agent adapters via plugin interface

**Choice:** External agent integration is via pluggable adapters. spec-graph ships with a Claude Code adapter (using `claude -p`) and a Codex adapter (stub). Each adapter implements a standard interface: `invoke(prompt, config) → AgentResponse` and `parseResponse(raw) → StructuredResult`.

**Interface:**
```typescript
interface AgentAdapter {
  id: string;
  invoke(prompt: string, config: AgentConfig): Promise<AgentResponse>;
  parseResponse(raw: string): Promise<StructuredResult>;
}

interface AgentResponse {
  raw: string;
  artifacts: Array<{ path: string; content: string }>;
  status: 'success' | 'failure' | 'partial' | 'timeout' | 'parse-error' | 'agent-not-found';
  error?: string;
  durationMs?: number;
}
```

**Alternatives considered:**
- Hardcode Claude Code → rejected: limits the ecosystem; users want flexibility
- Use a standard protocol (e.g., Anthropic Agent Protocol) → rejected: not yet mature enough for broad adoption; revisit in future versions
- Shell out to any command → rejected: too loose; we need structured responses, not arbitrary shell output

**Trade-offs:**
- (+) Different agents have different invocation mechanisms (CLI flags, SDKs, protocols); adapter interface isolates these differences
- (+) New agents can be supported by adding new adapters without touching the core
- (+) Users can write custom adapters for internal agents
- (+) Claude Code adapter can use `child_process.spawn` directly (no SDK dependency)
- (-) Each adapter must implement both `invoke` and `parseResponse`, which may duplicate logic

### Decision 5: Prompt template engine using XML-style tags

**Choice:** Prompts will be constructed using XML-style tags (`<task>`, `<acceptance_criteria>`, `<project_constraint>`, `<methodology>`, `<context>`, `<output_spec>`, `<self_check>`, `<previous_failure>`) with priority levels (`level="MUST"`, `level="SHOULD"`, `level="MAY"`). A small template engine handles tag composition, variable substitution, and methodology weaving.

**Alternatives considered:**
- Markdown-only prompts → rejected: less explicit structure, agents may miss priorities
- JSON prompts → rejected: verbose for natural language, harder for agents to read
- Free-form text → rejected: no way to express priority or structure
- YAML prompts → rejected: YAML's indentation-sensitive syntax conflicts with markdown content

**Trade-offs:**
- (+) XML-style tags are agent-friendly (Claude, GPT, Gemini all parse them well)
- (+) Tags provide explicit structure, reducing ambiguity
- (+) Priority levels (MUST/SHOULD/MAY) map to agent behavior
- (+) OpenSpec already uses this format in its instructions output
- (+) A small template engine (no external dependencies) keeps spec-graph lean
- (-) XML escaping for user content requires care (we implemented `escapeXml()`)
- (-) Agents that don't understand XML will fail (mitigated by targeting agents that do)

### Decision 6: Recovery strategy with 4 progressive levels

**Choice:** The recovery-engine will implement a 4-level progressive retry strategy, configurable per stage. Each level attempts a different class of fix:
- Level 1: Lightweight fix — re-prompt with diagnosis woven in
- Level 2: Swap methodology — use a different skill from knowledge-base
- Level 3: Decompose task — split the task into smaller subtasks
- Level 4: Escalate to user — pause and request human intervention

Each retry SHALL use the diagnosis from gate-enforcement to generate a targeted prompt. The strategy SHALL include similarity detection (Jaccard index ≥ 0.8 on failed criterion IDs) to avoid retrying the same failing approach.

**Alternatives considered:**
- Single retry strategy for all failures → rejected: different failures need different approaches
- Always escalate to user → rejected: defeats the purpose of automation
- Unlimited retries → rejected: risks infinite loops and cost explosion
- Exponential backoff with retries → rejected: time-based backoff doesn't help; we need strategy changes

**Trade-offs:**
- (+) Different failure types require different fix strategies
- (+) Escalating through levels avoids both premature escalation and infinite retries
- (+) Similarity detection prevents the automator from getting stuck
- (+) Per-stage configuration allows fine-tuning (e.g., implement stage gets more retries)
- (-) Jaccard threshold (0.8) is heuristic; may need tuning per project
- (-) Level 3 (decompose task) requires the agent to understand task decomposition — not all agents do this well

### Decision 7: Forward-fix recovery (no rollback)

**Choice:** When a later stage (e.g., accept) discovers a problem in an earlier stage's output (e.g., implement), spec-graph will create a new "fix task" and append it to the tasks list, then re-enter the implement stage. It will NOT roll back the state or undo completed work.

**Alternatives considered:**
- Full rollback to the failing stage → rejected: loses completed work, complex state management
- Partial rollback (only revert the failing task) → rejected: complex, unclear boundaries for what "reverting a task" means
- Git revert of commits → rejected: too aggressive; spec-graph operates on artifacts, not git commits

**Trade-offs:**
- (+) Rollback is complex (need to track code changes, state changes); forward-fix avoids this
- (+) Forward-fix preserves the audit trail (the tasks.md shows the fix history)
- (+) Matches how human developers work (fix forward, don't undo)
- (+) Simpler state management for the automator
- (-) tasks.md will grow with fix tasks (mitigated by archiving completed sessions)
- (-) If a fundamental design flaw is discovered late, forward-fix may not be sufficient (mitigated by escalating to user)

### Decision 8: Planning via keyword-based decomposition

**Choice:** The planning module will use keyword-based decomposition to transform user intent into capabilities. It maintains a knowledge table mapping 11 domain keywords (auth, api, ui, db, test, cli, deploy, security, perf, refactor, agent) to capability templates. Each template has a kebab-case id, description, and dependency list. Capabilities are topologically ordered using Kahn's algorithm.

**Alternatives considered:**
- Pure keyword table (v1's approach) → rejected: too rigid; doesn't account for dependency ordering or risk identification
- LLM-based planning → rejected: adds latency and cost at planning phase; planning should be fast and deterministic
- User-written plan → rejected: defeats the purpose of automation
- Hybrid keyword + LLM → rejected: too complex for v2; pure keyword is sufficient for common cases

**Trade-offs:**
- (+) Fast and deterministic: no LLM call at planning phase
- (+) 11 domain keywords cover common development tasks
- (+) Topological ordering ensures correct execution order
- (+) Complexity estimation and risk identification add value without cost
- (-) Keyword matching is limited; unusual intents may fall back to generic capability
- (-) Keyword matching is substring-based, so "author" matches "auth" (acceptable for now)

### Decision 9: Session ID derivation from intent

**Choice:** Session IDs are derived from the user's intent via kebab-case conversion: lowercase, replace non-alphanumeric with hyphens, remove leading/trailing hyphens, truncate to 64 characters.

**Alternatives considered:**
- UUID-based session IDs → rejected: not human-readable; users can't easily query sessions by name
- Timestamp-based session IDs → rejected: less readable than intent-based
- Intent-based with counter for collisions → rejected: collisions are rare; simpler to reject duplicates

**Trade-offs:**
- (+) Session IDs are human-readable and queryable
- (+) Collision is rare for typical development intents
- (-) Very similar intents may collide (e.g., "Add JWT auth" vs "Add JWT auth refresh")
- (-) 64-char truncation loses info for very long intents

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gate evaluation too strict → infinite retry loops | Medium | High | Jaccard similarity detection + escalation to user at level 4 + per-stage max-retry config |
| Gate evaluation too loose → low quality output | Medium | Medium | User-configurable gate.yaml + community-driven best practices + explicit format requirements in prompts |
| Agent invocation timeout (Claude Code >5 min) | Low | High | 5-min default timeout with configurable override + retry logic + user interrupt via SIGINT |
| Knowledge-base quality insufficient → poor prompts | Medium | High | Built-in 9 skills from OpenSpec/BMAD + user override mechanism + community contributions |
| Monorepo packaging complexity | Low | Medium | 3-package structure is minimal; can merge into single package later if needed |
| Breaking change for v1 users | High | High | Clear migration docs + `.spec-graph/` deletion step + semantic versioning (v2.0.0) |
| YAML parser bugs → state corruption | Low | High | Minimal parser reduces attack surface; unit tests; graceful degradation to fresh session |
| Concurrent process writes to state.yaml | Low | Medium | Single-session-per-project rule; document this constraint |
| Agent produces malformed output → parse errors | Medium | Low | Fallback to raw output as single artifact; retry with format hints |
| Skill keyword matching misses unusual intents | Medium | Medium | Fallback to single generic capability; user can manually extend capabilities via `intervene modify-plan` |

## Open Questions

| Question | Answer | Rationale |
|----------|--------|-----------|
| **Q1: How do we bootstrap the initial knowledge-base?** | Port OpenSpec's 4 instructions + 5 key BMAD skills | Provides immediate value without requiring users to author anything. 9 skills cover the 8 stages with design having 2 skills. |
| **Q2: What is the minimal viable set of stages for the first release?** | All 8 stages | The 8-stage FSM is spec-graph's core identity. Skipping stages would undermine the value proposition. Each stage is implemented as a module, not hard-wired. |
| **Q3: How do we handle concurrent changes?** | One active session per project | Simpler state management. Users can archive a session and start a new one. Document this constraint clearly. |
| **Q4: What's the story for brownfield projects?** | sense system (streamlined to ~8 dimensions) feeds project profile into prompts | Brownfield is the primary use case for spec-graph. Profile is included in MAY layer of every prompt so agents can adapt. |
| **Q5: How do we test spec-graph itself?** | Three-layer testing: unit tests per module (vitest), integration tests via CLI commands, E2E test on Express starter | Mocking agents loses realism; running real agents is costly. Three-layer approach balances both. |
| **Q6: How do we handle security-sensitive changes?** | Security skill in knowledge-base + explicit "requires security review" risk flag in planning | Gate-enforcement can flag security-sensitive changes and require explicit user approval at the `accept` stage. |

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| CLI command latency | <100ms for status/next-prompt/advance | Time from command invocation to first output |
| Agent invocation latency | <5 min per stage | End-to-end from `next-prompt` to `advance` completion |
| State persistence latency | <50ms per write | Time to write state.yaml after state transition |
| Knowledge-base loading | <200ms for full load | Time to scan knowledge/ directory and parse all files |
| Session startup (auto mode) | <500ms from intent to first prompt | End-to-end from `spec-graph auto "..."` to first `next-prompt` completion |
| Retry cycle (gate failure) | <2 min for lightweight fix retry | From gate failure detection to re-prompt generation and agent response |

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Prompt injection via user intent | spec-graph generates prompts from templates; user intent is included in `<task>` tag but is not executed as code |
| Agent output contains malicious content | spec-graph does not execute agent output; it only evaluates gate criteria. Users are responsible for reviewing code before merging |
| State.yaml contains sensitive data | `.spec-graph/` should be gitignored; users can configure `.gitignore` per project |
| Agent credentials exposed | Agent adapters do not handle credentials; they delegate to the agent CLI which manages its own auth |
| Path traversal via artifact paths | spec-graph validates artifact paths against session directory; rejects paths outside `.spec-graph/sessions/<id>/` |

## Observability

spec-graph provides observability via:
- **Trace log**: Every state transition is recorded in `state.yaml` with timestamp, fromStage, toStage, trigger, and result
- **Diagnosis**: Every gate failure produces a structured diagnosis with failed criteria, reasons, evidence, and suggested fixes
- **CLI status**: `spec-graph status` returns current state, progress, blockers, and recent diagnosis
- **CLI diagnose**: `spec-graph diagnose` returns the most recent gate failure diagnosis in detail
- **Future**: Metrics export (OpenTelemetry) and alerting (on repeated gate failures) are out of scope for v2 but planned for v3

## Deployment Strategy

spec-graph v2 deployment via:
- **npm global install**: `npm install -g spec-graph` — primary distribution
- **npx**: `npx spec-graph --version` — no-install usage
- **Project-local**: `npm install --save-dev spec-graph` — for CI integration

Post-install script:
- Copies `packages/skills/*` to `~/.claude/skills/` (with confirmation prompt)
- Creates `.spec-graph/` directory skeleton if not present

Versioning:
- Semantic versioning (v2.0.0 is a breaking change from v1)
- Breaking changes require major version bump
- Knowledge-base updates can be minor version bumps

## Migration Plan

v1 to v2 migration path:

1. **Backup v1 state**: Users should backup their `.spec-graph/` directory before migration (incompatible format)
2. **Delete v1 `.spec-graph/`**: Required for v2 to start fresh
3. **Install v2**: `npm install -g spec-graph@2` (or equivalent)
4. **Install skills**: Post-install script copies skills to `~/.claude/skills/`
5. **First run**: `spec-graph --help` verifies installation
6. **First session**: `spec-graph plan "<intent>" --confirm` creates a v2 session

Estimated migration effort: ~5 minutes per user (mostly deleting old state).

## Rollback Plan

If v2 has critical issues:
1. Reinstall v1: `npm install -g spec-graph@1`
2. Restore v1 state from backup
3. Document the issue for v2.0.1 fix
