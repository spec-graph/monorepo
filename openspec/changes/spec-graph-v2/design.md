## Context

spec-graph v1 is a TypeScript/Node.js monorepo with three packages (core, server, ui) and ~24k LOC. It implements a 8-stage FSM, 50+ CLI commands, 17 packs, 22-dimension sense, and a dispatch-manifest generator. However, v1 lacks automatic progression (users must manually invoke commands), has drifted into executor territory (server, UI, merge-queue, worktree management), and its dispatch manifests are not rich enough to guide AI agents effectively.

The v2 repositioning is to become a "strict-gate, prompt-driven, automatic progression development brain" — a brain that generates rich prompts for external agents and evaluates their outputs, but never executes directly. It absorbs OpenSpec's document refinement methodology and BMAD's expert skill methodology as built-in knowledge.

Constraints:
- spec-graph v2 runs as a CLI tool and/or library, invoked by users or external orchestration
- All execution is delegated to external AI agents (Claude Code, Codex, Gemini CLI, etc.)
- The workflow is driven by a single-loop automatic progression in `auto` mode
- The only mandatory human-in-the-loop point is the planning phase

## Goals / Non-Goals

**Goals:**
- Deliver a single CLI tool that can automatically run a development workflow from intent to integrated PR with minimal human intervention
- Provide three API surfaces: `auto` (full automatic), `stateless` (external orchestration), `hook` (agent hook integration)
- Absorb OpenSpec and BMAD methodologies as built-in knowledge, accessible via a knowledge-base
- Enforce strict quality gates at every stage with progressive retry and diagnosis
- Keep spec-graph a "brain, not hands" — no direct execution
- Produce rich, layered prompts (MUST/SHOULD/MAY) that external agents can reliably consume
- Support multiple external agents via pluggable adapters

**Non-Goals:**
- v2 will not include an HTTP server (drop packages/server)
- v2 will not include a web UI (drop packages/ui)
- v2 will not execute code, write documents, or run tests directly
- v2 will not replace OpenSpec or BMAD as standalone tools; it absorbs their methodologies
- v2 will not manage git operations directly (delegate to external agent)
- v2 will not provide fine-grained control over every step in `auto` mode (configuration only)

## Product Form

spec-graph v2 is delivered as **three layers**, following the same dual-form pattern used by OpenSpec (which provides both CLI commands and Claude Code skills that orchestrate those commands).

```
┌─────────────────────────────────────────────────────────┐
│  Layer A: Skills (SKILL.md files for AI agents)         │
│                                                          │
│   • spec-graph-plan      "启动规划流程"                  │
│   • spec-graph-auto      "启动自动化流程"                │
│   • spec-graph-status    "查看状态"                      │
│   • spec-graph-intervene "介入当前流程"                  │
│                                                          │
│   Each SKILL.md contains:                                │
│   • Methodology / stance (how the agent should think)    │
│   • Steps (which CLI commands to invoke, in what order)  │
│   • Response handling (how to process CLI output)        │
│   • Edge cases (what to do on error)                     │
│                                                          │
│   Skills orchestrate CLI commands — they are the         │
│   "编排层" (orchestration layer) for AI agents.          │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ orchestrate
┌─────────────────────────────────────────────────────────┐
│  Layer B: CLI (command-line tool)                        │
│                                                          │
│   • spec-graph plan "<intent>"                           │
│   • spec-graph auto "<intent>"                           │
│   • spec-graph status                                    │
│   • spec-graph next-prompt --json                        │
│   • spec-graph advance                                   │
│   • spec-graph validate                                  │
│   • spec-graph intervene                                 │
│                                                          │
│   Provides the actual capabilities.                      │
│   Used directly by humans; orchestrated by skills.       │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ call
┌─────────────────────────────────────────────────────────┐
│  Layer C: core (TypeScript library)                      │
│                                                          │
│   • Automaton (state machine loop)                       │
│   • Gate enforcement (entry/exit criteria evaluation)    │
│   • Knowledge-base (methodology storage)                 │
│   • Prompt construction (layered prompt generation)      │
│   • Recovery engine (diagnosis + retry strategy)         │
│                                                          │
│   Exposes a TypeScript API. Does not face any user       │
│   directly — consumed by CLI and (indirectly) skills.    │
└─────────────────────────────────────────────────────────┘
```

**Three user types and how they use spec-graph:**

1. **Humans** use the CLI directly in a terminal:
   - `spec-graph plan "Add JWT auth"` → see plan, confirm
   - `spec-graph auto "Add JWT auth"` → watch automation run
   - `spec-graph status` → inspect current state

2. **AI agents (Claude Code, etc.)** use the skills:
   - Read `spec-graph-plan/SKILL.md` → invoke `spec-graph plan` via bash
   - Read `spec-graph-auto/SKILL.md` → invoke `spec-graph auto` via bash
   - The skill guides the agent's stance, step sequence, and response handling

3. **External orchestration systems** use the CLI's stateless API:
   - `spec-graph next-prompt --json` → get next prompt
   - Run agent with that prompt
   - `spec-graph advance --result "..."` → submit result, advance state

## Decisions

### Decision 1: Monorepo with three packages (core, cli, skills)

**Choice:** spec-graph v2 will be a monorepo with three packages:
- `packages/core` — TypeScript library (the engine). Exposes a TypeScript API; does not face any user directly.
- `packages/cli` — CLI application. Used directly by humans in terminals; orchestrated by skills for AI agents. Published to npm as `spec-graph`.
- `packages/skills` — SKILL.md file collection. One skill per major user-facing workflow (`spec-graph-plan`, `spec-graph-auto`, `spec-graph-status`, `spec-graph-intervene`). Each skill is a SKILL.md that Claude Code reads and follows.

The root `package.json` declares workspaces and handles build/test orchestration.

**Rationale:**
- Three distinct user-facing surfaces need separate deliverables (CLI binary, SKILL.md files, core library)
- Skills are consumed by Claude Code's skill-loading mechanism (which reads `.claude/skills/<name>/SKILL.md`); they are not TypeScript code
- CLI is the installable binary (`npm install -g spec-graph`)
- core is the reusable engine that could be embedded in other tools in the future
- Mirrors the pattern used by OpenSpec (CLI + skills) and BMAD (skills + supporting tools)

**Alternatives considered:**
- Single monolithic package → rejected: cannot easily deliver SKILL.md files alongside a CLI binary; skills have a different lifecycle (they're installed into user's `.claude/skills/` directory, not into node_modules)
- Keep v1 monorepo shape (core + server + ui) → rejected: server and ui are removed in v2

### Decision 1b: Skills installation flow

**Choice:** The `packages/skills` directory contains SKILL.md files organized as `packages/skills/<skill-name>/SKILL.md`. During `npm install -g spec-graph` (or via a post-install script), the skills are copied / symlinked into the user's `~/.claude/skills/` directory (or project-local `.claude/skills/`). Alternatively, users manually install skills via a `spec-graph install-skills` command.

**Rationale:**
- Skills must live in `.claude/skills/<name>/SKILL.md` for Claude Code to recognize them
- Users should not need to manually copy files
- A post-install hook or explicit install command makes the experience seamless

**Alternatives considered:**
- Users manually copy SKILL.md files → rejected: poor UX
- Publish skills as a separate npm package → rejected: adds friction; better to ship with the CLI

### Decision 2: File-based state persistence (not database)

**Choice:** spec-graph v2 will persist all state in a `.spec-graph/` directory at the project root using YAML and JSON files. No external database.

**Rationale:**
- Keeps spec-graph zero-dependency beyond Node.js
- State is inspectable and editable by users
- Git-friendly (the .spec-graph/ directory can be committed or .gitignored)
- v1 already uses this approach; the file format can be evolved

**Files:**
- `.spec-graph/state.yaml` — current state machine state, active stage, completed artifacts
- `.spec-graph/plan.yaml` — persisted plan from planning phase
- `.spec-graph/trace.yaml` — trace log of all state transitions and agent interactions
- `.spec-graph/profile.yaml` — project profile from sense system
- `.spec-graph/knowledge/` — local overrides of knowledge-base (optional)

**Alternatives considered:**
- SQLite → rejected: unnecessary dependency, state is small enough for YAML
- Cloud state store → rejected: violates the "local-first" philosophy

### Decision 3: Knowledge-base as directory tree (not embedded code)

**Choice:** The knowledge-base will be a directory tree of markdown files organized as `knowledge/stages/<stage>/skills/<skill>/{instruction.md, templates/}`. spec-graph ships with a default knowledge-base; users can extend or override by placing files in `.spec-graph/knowledge/`.

**Rationale:**
- Methodologies are primarily text (instructions, templates); markdown is the natural format
- Directory tree is easy to navigate, edit, and extend
- OpenSpec's instructions and BMAD's SKILL.md are already in this format
- Users can add new skills without code changes
- Layered override: knowledge-base (default) → .spec-graph/knowledge (local override)

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
│   │   │   └── brainstorm/
│   │   │       ├── instruction.md     (BMAD-style brainstorm methodology)
│   │   │       └── templates/
│   │   └── gate.yaml                  (entry/exit criteria for specify stage)
│   ├── design/
│   │   ├── skills/
│   │   │   ├── architecture/
│   │   │   ├── api-design/
│   │   │   └── security/              (domain-specific methodology)
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
│   ├── test/
│   ├── accept/
│   └── integrate/
└── shared/
    ├── project-context.md             (template for project context)
    └── verification-format.md         (template for verification result format)
```

**Alternatives considered:**
- Embed methodologies as TypeScript strings → rejected: hard to edit, hard to extend
- Use a database → rejected: overkill, loses the "text is the interface" property
- Follow OpenSpec's schema format exactly → rejected: too rigid, spec-graph has 8 stages not 4

### Decision 4: Agent adapters via plugin interface

**Choice:** External agent integration is via pluggable adapters. spec-graph ships with a Claude Code adapter (using `claude -p "..."`) and a Codex adapter. Each adapter implements a standard interface: `invoke(prompt, config) → AgentResponse`.

**Rationale:**
- Different agents have different invocation mechanisms (CLI flags, SDKs, protocols)
- An adapter interface isolates these differences from the core
- New agents can be supported by adding new adapters without touching the core
- Users can write custom adapters for internal agents

**Interface:**
```typescript
interface AgentAdapter {
  invoke(prompt: string, config: AgentConfig): Promise<AgentResponse>;
  parseResponse(raw: string): Promise<StructuredResult>;
}

interface AgentResponse {
  raw: string;
  artifacts: Array<{ path: string; content: string }>;
  status: 'success' | 'failure' | 'partial';
}
```

**Alternatives considered:**
- Hardcode Claude Code → rejected: limits the ecosystem
- Use a standard protocol (e.g., Anthropic Agent Protocol) → rejected: not yet mature enough, revisit later
- Shell out to any command → rejected: too loose, need structured responses

### Decision 5: Prompt template engine using XML-style tags

**Choice:** Prompts will be constructed using XML-style tags (`<task>`, `<acceptance_criteria>`, `<methodology>`, `<context>`, etc.) with priority levels. A small template engine handles tag composition, variable substitution, and methodology weaving.

**Rationale:**
- XML-style tags are agent-friendly (Claude, GPT, Gemini all parse them well)
- Tags provide explicit structure, reducing ambiguity
- Priority levels (MUST/SHOULD/MAY) map to agent behavior
- OpenSpec already uses this format in its instructions output
- A small template engine (no external dependencies) keeps spec-graph lean

**Example prompt output:**
```xml
<task level="MUST">
  Create design.md for JWT authentication feature.
</task>

<acceptance_criteria level="MUST">
  - design.md MUST cover every requirement in specs/user/spec.md
  - design.md MUST cover every requirement in specs/auth/spec.md
  - design.md MUST include a Risks section
  - design.md MUST include technical choices with rationale
</acceptance_criteria>

<project_constraint level="MUST">
  - language: TypeScript
  - framework: Express
  - existing pattern: routes in src/routes/*.ts
</project_constraint>

<methodology level="SHOULD">
  <doc_methodology>
    [OpenSpec-style design instruction with sections, pitfalls, rationale]
  </doc_methodology>
  <domain_methodology>
    [Security-focused methodology: password hashing, token expiration, HTTPS]
  </domain_methodology>
</methodology>

<context level="MAY">
  <upstream>
    [Summaries of proposal.md, specs/user/spec.md, specs/auth/spec.md]
  </upstream>
  <project_profile>
    [Streamlined sense output]
  </project_profile>
</context>
```

**Alternatives considered:**
- Markdown-only prompts → rejected: less explicit structure, agents may miss priorities
- JSON prompts → rejected: verbose for natural language, harder for agents to read
- Free-form text → rejected: no way to express priority or structure

### Decision 6: Recovery strategy with 4 progressive levels

**Choice:** The recovery-engine will implement a 4-level progressive retry strategy, configurable per stage. Each level attempts a different class of fix:
- Level 1: Lightweight fix — re-prompt with diagnosis woven in
- Level 2: Swap methodology — use a different skill from knowledge-base
- Level 3: Decompose task — split the task into smaller subtasks
- Level 4: Escalate to user — pause and request human intervention

Each retry SHALL use the diagnosis from gate-enforcement to generate a targeted prompt. The strategy SHALL include similarity detection to avoid retrying the same failing approach.

**Rationale:**
- Different failure types require different fix strategies
- Escalating through levels avoids both premature escalation and infinite retries
- Similarity detection prevents the automator from getting stuck
- Per-stage configuration allows fine-tuning (e.g., implement stage gets more retries)

**Alternatives considered:**
- Single retry strategy for all failures → rejected: different failures need different approaches
- Always escalate to user → rejected: defeats the purpose of automation
- Unlimited retries → rejected: risks infinite loops and cost explosion

### Decision 7: Forward-fix recovery (no rollback)

**Choice:** When a later stage (e.g., accept) discovers a problem in an earlier stage's output (e.g., implement), spec-graph will create a new "fix task" and append it to the tasks list, then re-enter the implement stage. It will NOT roll back the state or undo completed work.

**Rationale:**
- Rollback is complex (need to track code changes, state changes)
- Forward-fix preserves the audit trail (the tasks.md shows the fix history)
- Matches how human developers work (fix forward, don't undo)
- Simpler state management for the automator

**Alternatives considered:**
- Full rollback to the failing stage → rejected: loses completed work
- Partial rollback (only revert the failing task) → rejected: complex, unclear boundaries

## Risks / Trade-offs

**Risk: Knowledge-base quality determines output quality**
→ Mitigation: Start with a small, high-quality knowledge-base (port OpenSpec's 4 artifacts + 5 key BMAD skills). Iterate based on real-world usage. Provide guidance for users to author new methodologies.

**Risk: LLM-as-judge for document gates is unreliable**
→ Mitigation: Use deterministic checks (structure, traceability) as the primary verification. LLM-as-judge is supplementary for quality evaluation only. Allow human override.

**Risk: Agent invocation cost (tokens) may be high**
→ Mitigation: Use context distillation (summarize upstream artifacts rather than include in full). Use small prompts for simple tasks. Log token usage per change for visibility.

**Risk: First end-to-end scenario (JWT auth on Express) may reveal unforeseen issues**
→ Mitigation: Treat the first scenario as a learning exercise. Expect to iterate on the design after the first full run. Keep the scenario scope small (3 capabilities: user, auth, middleware).

**Trade-off: Single-package simplicity vs. future extensibility**
→ We chose a single package for simplicity. If spec-graph grows to need plugins or multiple modules, we can split later. The cost of splitting is low compared to the cost of maintaining a monorepo prematurely.

**Trade-off: File-based state vs. performance**
→ YAML files are slower than a database but the state is small (kilobytes, not gigabytes). The performance cost is negligible compared to LLM invocation time.

## Open Questions

**Q1: How do we bootstrap the initial knowledge-base?**
Do we port OpenSpec's instructions verbatim, or rewrite them to fit spec-graph's layered format? Do we port BMAD skills as-is, or extract the essence?

**Q2: What is the minimal viable set of stages for the first release?**
8 stages is the full set. For MVP, can we support fewer stages (e.g., specify → design → implement → test)?

**Q3: How do we handle concurrent changes?**
If the user has multiple active changes, does spec-graph track them separately? Or one change at a time?

**Q4: What's the story for brownfield projects?**
The first scenario (JWT on Express) is brownfield. How does spec-graph handle the existing codebase when generating prompts? Does sense fully capture the existing patterns?

**Q5: How do we test spec-graph itself?**
spec-graph is a tool that orchestrates LLM agents. Testing it requires either mocking agents (loses realism) or running real agents (costly, non-deterministic). What's the testing strategy?

## Migration Plan

v1 to v2 migration path:
1. Preserve the Graph / Gate / Trace / Impact algorithms from v1 core
2. Preserve the sense system (streamline from 22 to ~8 dimensions)
3. Drop packages/server and packages/ui
4. Refactor CLI to the new ~15 command set
5. Build the new knowledge-base directory structure
6. Build the prompt-construction engine
7. Build the automator loop
8. Build the recovery-engine
9. Build the external-coordination adapters
10. Validate end-to-end on the JWT auth scenario

Estimated scope: 4-6 weeks of focused development for a single developer.
