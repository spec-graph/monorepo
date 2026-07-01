## Why

spec-graph v1 is a state-tracking and dispatch engine, but it lacks the ability to automatically drive development from intent to working code. Users must manually invoke commands, interpret dispatch manifests, and orchestrate the workflow themselves. Meanwhile, OpenSpec and BMAD both provide rich methodologies (document refinement, expert skills) but neither offers automatic progression — they wait for the AI agent to ask.

The AI development ecosystem needs a "brain" that can automatically orchestrate the entire workflow: planning, document refinement, code generation, testing, integration — with strict quality gates at every step. This is spec-graph V2's purpose: a **strict-gate, prompt-driven, automatic progression development brain** that absorbs the best of OpenSpec's document methodology and BMAD's expert skill methodology, and adds the one thing neither provides — **an automatic beat that drives the process to completion**.

## What Changes

This is a fundamental repositioning of spec-graph, not an incremental iteration:

- **Repositioning**: From "state tracking + dispatch manifest generator" to "automated development brain"
- **Philosophy shift**: spec-graph is a "brain, not hands" — it generates rich prompts for external agents (Claude Code, Codex, etc.) and evaluates their outputs, but never executes directly
- **Methodology absorption**: OpenSpec's document refinement methodology and BMAD's expert skill methodology are absorbed as **built-in knowledge** (not plugins, not external calls). When spec-graph generates a prompt, it weaves these methodologies in.
- **Automatic progression**: New automator engine that loops through stages without manual intervention
- **Human-in-the-loop at planning only**: The planning phase (intent → plan) is the **only mandatory human confirmation point**; all subsequent phases run automatically
- **Strict gate philosophy**: Every stage has explicit entry/exit criteria; gates are enforced automatically; failures trigger diagnosis + progressive retry
- **Three API surfaces**:
  - `auto` mode: Fully automatic end-to-end (user invokes once, walks away)
  - Stateless API: External orchestration systems can drive spec-graph via `next-prompt`, `status`, `validate`, `advance` commands
  - Hook integration: Integrates with Claude Code / Codex hook mechanisms
- **Prompt as primary output**: The core output of spec-graph is a carefully structured prompt with layered methodology (MUST/SHOULD/MAY priority), not a dispatch manifest
- **No executor**: spec-graph never runs code, writes documents, or executes skills directly; all execution is delegated to external agents
- **Recovery by forward-fix**: When failures occur, spec-graph creates new "fix tasks" rather than rolling back — always moving forward
- **Scope reduction**: Drop packages/server and packages/ui; focus on the kernel
- **First end-to-end scenario**: JWT authentication on an Express app (brownfield), demonstrating full automation across document and code domains

## Capabilities

### New Capabilities

- `automator`: The core automatic progression engine. Encapsulates the 8-stage state machine (with explicit entry/exit criteria per stage), the three API surfaces (auto / stateless / hook), and the main loop that selects the next action, generates prompts, evaluates results, and advances state. Absorbs the v1 state-machine concept.

- `prompt-construction`: Constructs rich, layered prompts by weaving together methodology, project context, upstream artifacts, and acceptance criteria. Uses XML-style tags with priority levels (MUST/SHOULD/MAY). Manages the knowledge-base (absorbed OpenSpec/BMAD methodologies organized by stage → skill → artifact) and the streamlined sense system (~8 dimensions feeding into prompt context).

- `planning`: Transforms user intent ("Add JWT auth") into a structured plan before the specify stage begins. Uses planning skill methodology. **This is the only mandatory human confirmation point** — presents the plan to the user for approval or modification before automatic execution begins.

- `gate-enforcement`: Evaluates entry/exit criteria for every stage, blocks state transitions when gates fail, produces structured diagnosis output on failure, and drives a progressive retry strategy (4 levels: lightweight fix → swap methodology → decompose task → escalate to user). Includes similarity detection to avoid redundant retries. Absorbs the v1 gate-system concept.

- `external-coordination`: Coordinates external agents (Claude Code, Codex, etc.) for all execution — writing code, running tests, executing verification commands. Generates structured verification prompts; receives structured results; validates against acceptance criteria. spec-graph itself never executes directly. Absorbs the v1 dispatch-manifest concept in evolved form.

### Modified Capabilities

(none — spec-graph has no existing OpenSpec specs; v1 concepts like state-machine, gate-system, pack-system, and sense-system are absorbed into the new capabilities above)

## Impact

**Code**:
- Major rewrite/refactor of v1 codebase (~24k LOC). Core algorithms (Graph, Gate, Trace, Impact) can be preserved; most of the CLI command set needs redesign.
- Drop packages/server and packages/ui entirely; focus on core kernel.
- New module structure: core engine + knowledge-base + automator + recovery-engine + verification-coordinator.

**CLI Command Set**:
- New primary commands: `auto`, `plan`, `next-prompt`, `status`, `validate`, `advance`, `diagnose`
- Preserved but refined: `status`, `gate`, `trace`, `impact`, `sense`, `doctor`
- Removed: `change *` (use OpenSpec for change lifecycle, or spec-graph's own automator-driven flow), `meeting`, `worktree`, `merge-queue`, `review`, `run`
- Total: ~15 core commands (down from 50+)

**External Integration**:
- Requires integration with external AI agents (Claude Code CLI, Codex CLI, or Agent SDK)
- Hook mechanism integration with Claude Code / Codex hook systems
- No longer depends on OpenSpec or BMAD as external tools (methodology is absorbed internally)

**Dependencies**:
- Remove: packages/server, packages/ui
- Keep: packages/core (refactored)
- New: integration layer for external agents

**First Milestone**:
- End-to-end automation of "Add JWT authentication to Express app" scenario
- Validates: automator loop, methodology weaving, gate enforcement, recovery mechanism, verification coordination
- Success criteria: spec-graph V2 automatically runs from intent to working PR with minimal human intervention

**Documentation**:
- New methodology-authoring guide (how to write knowledge-base entries)
- New integration guide (how to connect external agents)
- Updated architecture documentation reflecting brain-vs-hands philosophy
