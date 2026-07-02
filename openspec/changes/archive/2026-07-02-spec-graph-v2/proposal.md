## Why

**Business problem**: spec-graph v1 is positioned as a "spec-driven workflow orchestration kernel" but users must manually orchestrate every step — invoking commands, interpreting dispatch manifests, and driving the workflow themselves. Despite 38 CLI commands and 17 packs, v1 fails to deliver on its core promise: automated development workflows.

**User pain points** (from 6 months of self-use and 3 beta users):
- Manual command invocation at every transition: ~40 invocations per completed change
- No clear "what's next" after dispatch — users stare at JSON manifests unsure what to do
- Gate failures produce cryptic error messages with no actionable fix suggestions
- Retry loops require manual re-invocation of commands
- No end-to-end automation — users still do the "glue work" of connecting agent outputs to state transitions

**Market context**:
- OpenSpec provides rich document refinement methodology (proposal → specs → design → tasks) but is passive — waits for agents to call it
- BMAD provides 48 expert skills (brainstorming, review, planning) but is also passive — skills are invoked explicitly
- Both tools lack automatic progression. They are "capabilities" without "orchestration"
- spec-graph's opportunity: be the orchestration layer that combines these capabilities with a strict state machine and automatic progression

**Target users**:
- AI-native developers using Claude Code / Codex / Cursor as primary development tool
- Solo developers and small teams (2-5 people) who want "autopilot" for routine changes
- Enterprises piloting AI-assisted development and need governance (gates, traceability)

**Success criteria (measurable)**:
1. `spec-graph auto "<intent>"` completes a standard feature change with <5 manual interventions (vs. v1's ~40)
2. Gate pass rate >80% on first attempt (vs. v1's unknown rate)
3. Agent invocations complete within 2 minutes average (vs. 5+ minutes with manual retry)
4. End-to-end trace from intent → code → PR is queryable and complete
5. Recovery from gate failures requires <2 user interactions (vs. v1's manual retry loops)

## What Changes

### Fundamental repositioning
- **From**: "state-tracking + dispatch manifest generator" (passive, user-driven)
- **To**: "strict-gate, prompt-driven, automatic progression development brain" (active, agent-driven)
- **Philosophy**: "Brain, not hands" — spec-graph generates rich layered XML prompts for external AI agents and evaluates their outputs, but NEVER executes directly. All execution (code writing, document writing, test running) is delegated to external agents via pluggable adapters.

### Monorepo restructuring
- **Remove**: `packages/server` (unused HTTP server, 123 LOC) and `packages/ui` (unused React UI, 84 LOC)
- **Keep**: `packages/core` (refactored from ~24k LOC v1 engine)
- **Add**: `packages/cli` (new CLI with 8 focused commands)
- **Add**: `packages/skills` (SKILL.md collection for AI agent integration)
- **Result**: 3-package monorepo (core / cli / skills)

### Module architecture (7 new modules replacing v1's 50+ commands)
- `automator`: Session lifecycle + 8-stage FSM + auto-run loop
- `prompt-construction`: XML layered prompt builder with methodology weaving
- `planning`: Intent → capability decomposition with topological ordering
- `gate-enforcement`: Entry/exit criteria evaluation + 4-level progressive retry
- `external-coordination`: Agent adapter registry (Claude Code + Codex adapters)
- `knowledge-base`: Methodology library (8 stages × multiple skills, ported from OpenSpec + BMAD)
- `recovery`: Diagnosis-driven recovery with Jaccard similarity detection

### Methodology absorption
- **OpenSpec's document methodology** (proposal/specs/design/tasks instructions) absorbed as built-in knowledge at `knowledge/stages/<stage>/skills/<skill>/`
- **BMAD's expert skills** (code-generation, code-review, test-strategy, e2e-verification, ci-integration) absorbed as native skills
- **NOT plugins**: Methodology is embedded in spec-graph's prompt generation, not loaded externally at runtime
- **Extensible**: Users override via `.spec-graph/knowledge/` in their project

### Quality gate hardening
- **Entry + exit criteria** per stage (v1 had only gate checks)
- **Rule-based evaluation** (deterministic: file exists, structure matches pattern)
- **Traceability evaluation** (artifact → upstream artifact mapping)
- **LLM-judge evaluation** (stub for future — uses rubric-based scoring)
- **Progressive retry**: Level 1 (lightweight fix) → Level 2 (swap methodology) → Level 3 (decompose task) → Level 4 (escalate to user)
- **Similarity detection**: Jaccard index ≥ 0.8 on failed criterion IDs → skip lower retry levels

### Three API surfaces
- **Auto**: `spec-graph auto "<intent>"` — single invocation, walks away, comes back when done
- **Stateless**: `next-prompt` / `status` / `advance` / `validate` — verb commands for external orchestration systems
- **Hook**: Integration with Claude Code / Codex hook mechanisms (future, stub for now)

### State persistence
- **File-based**: `.spec-graph/sessions/<session-id>/state.yaml` + `<stage>/<artifact>`
- **No database**: YAML is human-readable, git-friendly, minimal dependencies
- **Minimal YAML parser**: Custom parser for our specific format (no js-yaml dependency)
- **Session isolation**: One active session per project (list via `listSessions()`)

## Capabilities

### New Capabilities

- `automator`: Core automatic progression engine. Owns the session lifecycle: `startSession` → `confirmPlan` → `nextPrompt` → `submitResult` → `autoRun`. Implements the 8-stage FSM with explicit entry/exit criteria per stage. Coordinates with other modules (planning for plan generation, prompt-construction for prompt building, gate-enforcement for evaluation, external-coordination for agent invocation). Provides three API surfaces (auto / stateless / hook).

- `prompt-construction`: Layered XML prompt builder. Constructs prompts with three priority levels: MUST (task + acceptance criteria + project constraints), SHOULD (methodology woven from knowledge-base), MAY (upstream artifact summaries + project profile). Uses XML-style tags for agent-friendly parsing. Includes `weaveMethodology` (loads instruction.md from knowledge-base) and `summarizeArtifact` (context distillation for upstream artifacts).

- `planning`: Intent-to-plan transformer. Parses user intent for domain keywords (11 domains: auth/api/ui/db/test/cli/deploy/security/perf/refactor/agent). Generates capability list with descriptions, detects dependencies, topologically orders capabilities (Kahn's algorithm), estimates complexity (low/medium/high based on capability count + dependency count + project profile), identifies risks (security-sensitive, brownfield integration, scope creep). Replaces v1's hardcoded `capabilityHints` table.

- `gate-enforcement`: Entry/exit criteria evaluator. Loads gate.yaml from knowledge-base per stage, evaluates criteria with verification methods (rule / traceability / llm-judge / downstream-executability / human). Produces structured diagnosis on failure with failed criterion details, suggested fixes. Supports progressive retry with 4 levels. Includes `diagnoseFailure` and `nextRetryLevel` functions.

- `external-coordination`: Agent adapter registry + invocation layer. Defines `AgentAdapter` interface (`invoke` + `parseResponse`). Ships with `ClaudeCodeAdapter` (calls `claude -p` via child_process) and `CodexAdapter` (stub). Handles timeout (default 5 min), PATH search for agent CLI, structured response parsing. Includes `extractArtifacts` for detecting file writes in agent output.

- `recovery`: Diagnosis-driven recovery strategy. Maps retry level to action: Level 1 (lightweight fix: re-prompt with diagnosis), Level 2 (swap methodology: pick alternative skill from knowledge-base), Level 3 (decompose task: break into subtasks), Level 4 (escalate to user: pause and request intervention). Includes `detectSimilarity` (Jaccard index ≥ 0.8 on failed criterion IDs) to avoid wasting retries on same failing approach.

### Modified Capabilities

(none — spec-graph has no existing OpenSpec specs; all v1 concepts are replaced by new capabilities above)

## Impact

### Code (major rewrite)
- **Removed**: `packages/server/` (123 LOC), `packages/ui/` (84 LOC), `packages/core/src/commands/` (59 files, ~20k LOC)
- **Refactored**: `packages/core/` internal structure into 7 new modules (automator, prompt-construction, planning, gate-enforcement, external-coordination, knowledge-base, recovery)
- **Preserved**: None of v1's code is directly reused (new implementation of all capabilities)
- **Net change**: ~24k LOC → ~8k LOC (33% of original, but functionally richer)

### CLI (complete redesign)
- **New commands**: `plan`, `auto`, `status`, `next-prompt`, `advance`, `validate`, `intervene`, `diagnose` (8 total, down from v1's 38+)
- **Removed**: `change *`, `meeting`, `worktree`, `merge-queue`, `review`, `run`, `dashboard`, and 30+ other v1 commands
- **New behavior**: `auto` command runs the full automatic loop (delegates to Claude Code)
- **New JSON API**: Every command supports `--json` for programmatic consumption

### External integration (new dependency surface)
- **Required**: External AI agent (Claude Code, Codex, or custom)
- **Optional**: Hook integration with agent-specific mechanisms
- **Removed**: No longer depends on OpenSpec or BMAD at runtime (methodology absorbed)
- **Added**: `child_process` for spawning agent CLI (Node.js built-in)

### Dependencies
- **Removed**: `packages/server`, `packages/ui` workspace entries
- **Kept**: `packages/core` workspace (refactored)
- **Added**: `packages/cli` and `packages/skills` workspace entries
- **Runtime**: Express removed (no HTTP server); added `child_process` (built-in)

### Documentation
- **Updated**: `README.md` — completely rewritten for v2 architecture
- **Updated**: `packages/core/CLAUDE.md` — rewritten with v2 module responsibilities
- **New**: `packages/cli/README.md` — documenting 8 CLI commands
- **New**: `packages/skills/README.md` — documenting 4 SKILL.md files
- **New**: `docs/agent-integration-guide.md` — how to integrate external agents
- **New**: `docs/knowledge-base-authoring.md` — how to add/extend methodology
- **Obsolete**: 9 v1 docs in `docs/` (agent-document-workflow.md, compose-algorithm.md, etc.) — not yet removed

### Migration path
- **No data migration**: v1 state in `.spec-graph/` is not compatible with v2 format
- **Manual steps required**: Users must delete existing `.spec-graph/` directory
- **No code migration**: v1 consumers must update to new API surface

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gate evaluation too strict → infinite retry loops | Medium | High | Jaccard similarity detection + escalation to user at level 4 |
| Gate evaluation too loose → low quality output | Medium | Medium | User-configurable gate.yaml + community-driven best practices |
| Agent invocation timeout (Claude Code >5 min) | Low | High | 5-min default timeout with configurable override + retry logic |
| Knowledge-base quality insufficient → poor prompts | Medium | High | Built-in 9 skills from OpenSpec/BMAD + user override mechanism |
| Monorepo packaging complexity | Low | Medium | 3-package structure is minimal; can merge into single package later if needed |
| Breaking change for v1 users | High | High | Clear migration docs + `.spec-graph/` deletion step |

## Non-Goals

- **v2 will NOT**: Execute code, write documents, or run tests directly (always delegates to external agent)
- **v2 will NOT**: Provide fine-grained control over every step in `auto` mode (configuration only)
- **v2 will NOT**: Replace OpenSpec or BMAD as standalone tools (methodology is absorbed, not competing)
- **v2 will NOT**: Manage git operations directly (delegates to external agent)
- **v2 will NOT**: Support multiple concurrent active sessions per project (one at a time)
- **v2 will NOT**: Provide a web UI (removed with packages/ui; CLI-only)
- **v2 will NOT**: Provide an HTTP server (removed with packages/server)
