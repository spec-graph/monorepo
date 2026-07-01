## 1. Project Restructuring

- [ ] 1.1 Remove packages/server and packages/ui from the monorepo
- [ ] 1.2 Restructure packages/core into the new layout (automator, prompt-construction, planning, gate-enforcement, external-coordination, knowledge-base modules)
- [ ] 1.3 Update root package.json (name, description, publish config) and convert from monorepo to single-package layout
- [ ] 1.4 Preserve v1 Graph/Gate/Trace/Impact algorithms; move them into the new module structure

## 2. Knowledge-Base

- [ ] 2.1 Design and create the knowledge-base directory structure: knowledge/stages/<stage>/skills/<skill>/{instruction.md, templates/}
- [ ] 2.2 Port OpenSpec-style instructions for all 8 stages (specify through integrate) into the knowledge-base
- [ ] 2.3 Port BMAD-style expert skills for key stages (security for design, code-generation for implement, review methodology for review)
- [ ] 2.4 Implement knowledge-base loader that reads the directory tree, resolves local overrides from .spec-graph/knowledge/, and exposes skill selection API

## 3. Prompt Construction Engine

- [ ] 3.1 Design the XML-style tag format with priority levels (MUST/SHOULD/MAY) and document the prompt schema
- [ ] 3.2 Implement the prompt template engine: tag composition, variable substitution, and methodology weaving from knowledge-base
- [ ] 3.3 Implement upstream artifact summarization (read completed artifacts, produce summaries) and integration into the MAY layer

## 4. State Machine Core

- [ ] 4.1 Extend the v1 state machine with explicit entry criteria and exit criteria per stage, each criterion expressed as a verifiable assertion
- [ ] 4.2 Implement file-based state persistence: .spec-graph/state.yaml (current state), .spec-graph/plan.yaml (plan artifact), .spec-graph/trace.yaml (transition log)
- [ ] 4.3 Implement restart/resume logic that loads persisted state and continues from the last successful stage

## 5. Automator Loop

- [ ] 5.1 Implement the main automator loop: select next action → generate prompt → delegate to agent → evaluate result → advance state or retry
- [ ] 5.2 Implement stage-selection logic that uses the plan, state machine, and gate status to determine the next action
- [ ] 5.3 Implement the `spec-graph auto "<intent>"` CLI command that runs the full workflow end-to-end with one invocation

## 6. Gate Enforcement + Recovery

- [ ] 6.1 Implement gate evaluation that checks entry and exit criteria against artifact state, producing structured pass/fail output
- [ ] 6.2 Implement structured diagnosis output on gate failure: failed criterion, reason, evidence, suggested fix
- [ ] 6.3 Implement the 4-level progressive retry strategy (lightweight fix → swap methodology → decompose task → escalate to user) with per-stage configuration
- [ ] 6.4 Implement similarity detection that compares new failure diagnoses against recent previous diagnoses and skips lower retry levels on repeated root causes

## 7. External Agent Coordination

- [ ] 7.1 Define the AgentAdapter interface (invoke, parseResponse, AgentResponse shape) and document it for third-party adapter authors
- [ ] 7.2 Implement the Claude Code adapter that shells out to `claude -p "<prompt>"` and parses the response
- [ ] 7.3 Implement the Codex CLI adapter using the same interface
- [ ] 7.4 Implement structured result parsing that validates agent output against the expected format and feeds malformed output to gate-enforcement

## 8. Planning

- [ ] 8.1 Implement intent-to-plan transformation: takes user intent + project profile, produces a structured plan with capabilities, dependencies, complexity, risks
- [ ] 8.2 Implement the human confirmation flow: present plan to user, accept approval / modification / rejection, regenerate on modification
- [ ] 8.3 Implement plan persistence to .spec-graph/plan.yaml and enforce plan as the scope contract in later stages

## 9. Sense System

- [ ] 9.1 Streamline the v1 sense system from 22 dimensions to approximately 8 core dimensions that are relevant to prompt generation (type, framework, language, existing features, patterns, brownfield status, tech stack, testing approach)
- [ ] 9.2 Wire sense results into the MAY layer of prompts via the prompt-construction engine

## 10. CLI Refactoring

- [ ] 10.1 Implement the new core commands: auto, plan, next-prompt, status, validate, advance, diagnose, knowledge (inspect knowledge-base), agent (manage adapters)
- [ ] 10.2 Remove deprecated commands from v1: change create/apply/complete/archive, meeting, worktree, merge-queue, review, run, and other executor-oriented commands
- [ ] 10.3 Implement the stateless API surface: next-prompt, status, validate, advance as JSON-returning commands suitable for external orchestration

## 11. Hook Integration

- [ ] 11.1 Implement the Claude Code hook integration: spec-graph is invoked after each agent task, validates result, advances state
- [ ] 11.2 Document the hook integration protocol for users of other agent systems

## 12. End-to-End Validation

- [ ] 12.1 Create an Express + TypeScript starter project (bookstore API with basic CRUD, no auth) as the test scenario input
- [ ] 12.2 Run spec-graph V2's `auto "Add JWT authentication"` end-to-end on the starter project and record the execution
- [ ] 12.3 Collect learnings from the first end-to-end run: identify friction points, adjust knowledge-base, refine gate criteria, iterate on design

## 13. Documentation

- [ ] 13.1 Update README.md for spec-graph V2 (positioning, philosophy, quick start, three API surfaces)
- [ ] 13.2 Write the knowledge-base authoring guide (how to add new skills, how to write good instructions, format reference)
- [ ] 13.3 Write the external agent integration guide (how to configure adapters, how to write custom adapters)
- [ ] 13.4 Update architecture-overview.md and other docs in docs/ to reflect the V2 design
