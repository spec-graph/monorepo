# Tasks: spec-graph V2

## Estimation

Total: ~40 tasks across 13 phases. Estimated effort: 4-6 weeks for a single developer at ~4 hours/day.

**Story point scale:**
- 1 point = 2 hours (small, well-defined)
- 2 points = 4 hours (medium, some complexity)
- 3 points = 6-8 hours (large, significant complexity)
- 5 points = 10+ hours (very large, high risk)

**Total estimate:** ~80 story points

## Milestones

| Milestone | Tasks | Estimate | Deliverable |
|-----------|-------|----------|-------------|
| M1: Skeleton | 1.1-1.5 | 10 points | Monorepo structure builds and runs |
| M2: Knowledge-base | 2.1-2.4 | 12 points | Knowledge-base loads with all 9 skills |
| M3: Prompt + Gate + Recovery | 3.1-3.3, 6.1-6.5 | 18 points | Layered prompts generated, gates evaluated |
| M4: Automator + Agent | 5.1-5.3, 7.1-7.4 | 15 points | autoRun loop works with Claude Code |
| M5: Planning + CLI | 8.1-8.3, 10.1-10.3 | 10 points | CLI commands all functional |
| M6: E2E + Docs | 9.1-9.2, 11.1-11.2, 12.1-12.3, 13.1-13.4 | 15 points | Full E2E on Express starter, docs complete |

## Dependencies

```
1.x (Project Restructuring)
  └─► 2.x (Knowledge-base)
        └─► 3.x (Prompt Construction)
              └─► 5.x (Automator)
                    └─► 7.x (External Agent)
                          └─► 12.x (E2E Validation)

6.x (Gate + Recovery) is parallel to 5.x
8.x (Planning) is parallel to 5.x
9.x (Sense) is parallel to 3.x
10.x (CLI) is parallel to 5.x
11.x (Hook Integration) depends on 5.x and 7.x
13.x (Documentation) is parallel to everything
```

## Acceptance Criteria Standards

Each task's acceptance criteria should be:
- **Verifiable**: A test or manual check confirms completion
- **Specific**: No vague "looks good" criteria
- **Complete**: All edge cases mentioned
- **Aligned**: Matches the corresponding spec

---

## 1. Project Restructuring

### Task 1.1: Remove packages/server and packages/ui
- **Points**: 1
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] `packages/server/` directory does not exist
  - [ ] `packages/ui/` directory does not exist
  - [ ] Root `package.json` workspaces array does not include server or ui
  - [ ] `npm install` succeeds after removal
  - [ ] No remaining imports of server or ui in other packages

### Task 1.2: Restructure packages/core internal modules
- **Points**: 3
- **Blocked by**: 1.1
- **Acceptance criteria**:
  - [ ] packages/core/src/ contains 7 module directories: automator/, prompt-construction/, planning/, gate-enforcement/, external-coordination/, knowledge-base/, recovery/
  - [ ] Each module has an `index.ts` that exports its public API
  - [ ] packages/core/src/index.ts re-exports all modules
  - [ ] `npx tsc --noEmit` in packages/core passes with 0 errors
  - [ ] v1 src/commands/ directory is removed (replaced by packages/cli)
  - [ ] v1 src/engine/ directory is removed (logic migrated to new modules)

### Task 1.3: Update root package.json for new monorepo
- **Points**: 1
- **Blocked by**: 1.1
- **Acceptance criteria**:
  - [ ] Root package.json has `workspaces: ["packages/core", "packages/cli", "packages/skills"]`
  - [ ] Root package.json name is `spec-graph-monorepo`
  - [ ] Root package.json version is `2.0.0`
  - [ ] Root package.json has scripts for `build`, `test`, `dev:core`, `dev:cli`, `lint`, `lint:fix`

### Task 1.4: Create packages/cli skeleton
- **Points**: 2
- **Blocked by**: 1.3
- **Acceptance criteria**:
  - [ ] packages/cli/package.json exists with name `spec-graph`, bin entry, dependencies on `@spec-graph/core`
  - [ ] packages/cli/tsconfig.json exists with strict mode
  - [ ] packages/cli/src/index.ts has shebang and commander setup
  - [ ] `npx tsx packages/cli/src/index.ts --help` prints help without errors
  - [ ] All 8 commands registered: plan, auto, status, next-prompt, advance, validate, intervene, diagnose

### Task 1.5: Create packages/skills with initial SKILL.md files
- **Points**: 2
- **Blocked by**: 1.3
- **Acceptance criteria**:
  - [ ] packages/skills/package.json exists
  - [ ] 4 SKILL.md files exist: spec-graph-plan, spec-graph-auto, spec-graph-status, spec-graph-intervene
  - [ ] Each SKILL.md has valid frontmatter (name, description, metadata)
  - [ ] Each SKILL.md has a "Steps" section listing CLI commands to invoke

---

## 2. Knowledge-Base

### Task 2.1: Design knowledge-base directory structure
- **Points**: 2
- **Blocked by**: 1.2
- **Acceptance criteria**:
  - [ ] knowledge/ directory exists at packages/core/knowledge/
  - [ ] 8 stage directories: specify, design, plan, implement, review, test, accept, integrate
  - [ ] Each stage directory has a gate.yaml file
  - [ ] Each stage directory has a skills/ subdirectory
  - [ ] shared/ directory exists with prompt-schema.md, project-context.md, verification-format.md

### Task 2.2: Port OpenSpec-style instructions for 8 stages
- **Points**: 5
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] 9 skills total (one per stage, except design has 2: specs-authoring and design-authoring)
  - [ ] Each skill has instruction.md with "Purpose", "Stance", "Required sections", "Common pitfalls", "Self-check questions" sections
  - [ ] Each skill (except review, test, accept, integrate) has at least one template in templates/
  - [ ] instruction.md content is adapted from OpenSpec's schema.yaml instruction fields
  - [ ] Each instruction uses SHALL/MUST where appropriate

### Task 2.3: Port BMAD-style expert skills
- **Points**: 3
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] 5 BMAD-style skills: code-generation, code-review, test-strategy, e2e-verification, ci-integration
  - [ ] Each skill has instruction.md with expert stance, checklists, and pitfalls
  - [ ] Each instruction addresses security, performance, and maintainability where applicable

### Task 2.4: Implement knowledge-base loader
- **Points**: 2
- **Blocked by**: 2.2, 2.3
- **Acceptance criteria**:
  - [ ] `loadKnowledgeBase()` returns a `KnowledgeBase` with all 9 skills loaded
  - [ ] `selectSkill(kb, stage, intent)` returns the appropriate skill
  - [ ] `getSkillsForStage(kb, stage)` returns all skills for a stage
  - [ ] `getStageGate(kb, stage)` returns entry/exit criteria
  - [ ] Local overrides from `.spec-graph/knowledge/` are merged
  - [ ] Loading a missing path returns an empty knowledge-base with a warning (no crash)

---

## 3. Prompt Construction Engine

### Task 3.1: Design XML-style tag format
- **Points**: 1
- **Blocked by**: 2.1
- **Acceptance criteria**:
  - [ ] knowledge/shared/prompt-schema.md documents the full prompt schema
  - [ ] Schema defines all required tags: task, acceptance_criteria, project_constraint, methodology, context, output_spec, self_check, previous_failure
  - [ ] Schema documents priority levels: MUST, SHOULD, MAY
  - [ ] Schema includes at least one full example prompt

### Task 3.2: Implement prompt template engine
- **Points**: 3
- **Blocked by**: 3.1, 2.4
- **Acceptance criteria**:
  - [ ] `buildPrompt(context: PromptContext)` returns `BuiltPrompt` with `xml` and `metadata`
  - [ ] Prompt XML validates against the schema in prompt-schema.md
  - [ ] `weaveMethodology(skillIds, kbPath)` loads instruction.md files and returns methodology entries
  - [ ] `summarizeArtifact(id, content)` truncates to 500 chars
  - [ ] XML escaping handles `<`, `>`, `&`, `"`, `'` correctly
  - [ ] Prompt includes all MUST/SHOULD/MAY layers

### Task 3.3: Implement methodology weaving logic
- **Points**: 2
- **Blocked by**: 3.2
- **Acceptance criteria**:
  - [ ] Methodology entries from knowledge-base are wrapped in `<doc_methodology>` and `<domain_methodology>` tags
  - [ ] Source attribute is included on each methodology tag
  - [ ] Multiple methodologies are concatenated within the `<methodology>` tag
  - [ ] Missing skill is silently skipped (no error)

---

## 4. State Machine Core

### Task 4.2: Extend state machine with entry/exit criteria
- **Points**: 2
- **Blocked by**: 2.4
- **Acceptance criteria**:
  - [ ] `STAGES` array has 8 stages in order: specify, design, plan, implement, review, test, accept, integrate
  - [ ] `STAGE_OUTPUTS` maps each stage to its artifact directory and filename
  - [ ] Entry/exit criteria are loaded from gate.yaml
  - [ ] Transition only occurs when exit criteria pass

### Task 4.3: Implement file-based state persistence
- **Points**: 2
- **Blocked by**: 4.2
- **Acceptance criteria**:
  - [ ] `saveSession(data)` writes state.yaml
  - [ ] `loadSession(sessionId)` reads state.yaml from disk
  - [ ] Session state includes: sessionId, intent, stage, state, plan, completedArtifacts, trace, previousDiagnoses, retryCount
  - [ ] State file is human-readable YAML
  - [ ] Corrupted state file triggers fresh session (no crash)

---

## 5. Automator Loop

### Task 5.1: Implement main automator loop
- **Points**: 3
- **Blocked by**: 4.3, 3.2, 6.1
- **Acceptance criteria**:
  - [ ] `startSession(intent)` creates session with paused state
  - [ ] `confirmPlan(sessionId)` transitions to running state
  - [ ] `nextPrompt(sessionId)` generates XML prompt for current stage
  - [ ] `submitResult(sessionId, result)` evaluates gate, advances if passed
  - [ ] `status(sessionId)` returns current state
  - [ ] `listSessions()` returns all session ids

### Task 5.2: Implement stage selection logic
- **Points**: 1
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [ ] Stage selection respects the 8-stage order
  - [ ] Completed stages are not re-selected
  - [ ] Failed stages trigger recovery, not re-selection

### Task 5.3: Implement `auto` command in automator
- **Points**: 3
- **Blocked by**: 5.1, 7.2
- **Acceptance criteria**:
  - [ ] `autoRun(sessionId, options)` loops until done, failed, or interrupted
  - [ ] Each iteration: nextPrompt → invokeAgent → submitResult → check result
  - [ ] onProgress callback is invoked for each stage transition
  - [ ] SIGINT handling pauses the loop gracefully
  - [ ] Max retries per stage is enforced

---

## 6. Gate Enforcement + Recovery

### Task 6.1: Implement gate evaluation
- **Points**: 2
- **Blocked by**: 2.4
- **Acceptance criteria**:
  - [ ] `loadGateConfig(stage, kbPath)` returns entry and exit criteria
  - [ ] `evaluateGate(stage, criteriaType, context, kbPath)` returns GateResult with pass/fail per criterion
  - [ ] Missing gate.yaml falls back to built-in configuration
  - [ ] Malformed YAML falls back gracefully

### Task 6.2: Implement structured diagnosis
- **Points**: 2
- **Blocked by**: 6.1
- **Acceptance criteria**:
  - [ ] `diagnoseFailure(gateResult, previousDiagnoses)` returns Diagnosis with failed criteria, retryLevel, similarToPrevious
  - [ ] Each failed criterion has id, reason, evidence, suggestedFix
  - [ ] suggestedFix is pulled from known suggestions map, with fallback

### Task 6.3: Implement 4-level retry strategy
- **Points**: 2
- **Blocked by**: 6.2
- **Acceptance criteria**:
  - [ ] Level 1: re-prompt with diagnosis woven in
  - [ ] Level 2: swap methodology (different skill from knowledge-base)
  - [ ] Level 3: decompose task into subtasks
  - [ ] Level 4: escalate to user with reason
  - [ ] Retry level is tracked per session and increments on each failure

### Task 6.4: Implement similarity detection
- **Points**: 2
- **Blocked by**: 6.2
- **Acceptance criteria**:
  - [ ] `detectSimilarity(diagnosis, previousDiagnoses)` returns boolean
  - [ ] Jaccard index ≥ 0.8 on failed criterion IDs means "similar"
  - [ ] Empty previous list returns false
  - [ ] Identical failures return true

### Task 6.5: Implement user escalation mechanism
- **Points**: 1
- **Blocked by**: 6.3
- **Acceptance criteria**:
  - [ ] Level 4 escalation pauses the automator with a clear error message
  - [ ] Escalation reason includes all failed criteria and suggested fixes
  - [ ] User can resume via `spec-graph intervene resume`

---

## 7. External Agent Coordination

### Task 7.1: Define AgentAdapter interface
- **Points**: 1
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] AgentAdapter interface defined: id, invoke, parseResponse
  - [ ] AgentConfig interface defined: adapterId, timeoutMs, model, args
  - [ ] AgentResponse interface defined: raw, artifacts, status, error, durationMs
  - [ ] StructuredResult interface defined: artifacts, selfCheck

### Task 7.2: Implement Claude Code adapter
- **Points**: 3
- **Blocked by**: 7.1
- **Acceptance criteria**:
  - [ ] `createClaudeCodeAdapter()` returns AgentAdapter with id 'claude-code'
  - [ ] `invoke` spawns `claude -p "<prompt>" --output-format text`
  - [ ] PATH search includes ~/.npm-global/bin, /usr/local/bin, /usr/bin
  - [ ] Missing `claude` returns `agent-not-found` with install instructions
  - [ ] Timeout handling: default 5 minutes, configurable
  - [ ] Exit code 0 with non-empty stdout → status 'success'
  - [ ] Non-zero exit code → status 'failure' with stderr in error field
  - [ ] Empty stdout → status 'partial'

### Task 7.3: Implement Codex adapter (stub)
- **Points**: 1
- **Blocked by**: 7.1
- **Acceptance criteria**:
  - [ ] `createCodexAdapter()` returns AgentAdapter with id 'codex'
  - [ ] Adapter invokes `codex exec <prompt>`
  - [ ] Missing `codex` returns `agent-not-found`

### Task 7.4: Implement structured result parsing
- **Points**: 2
- **Blocked by**: 7.2
- **Acceptance criteria**:
  - [ ] `extractArtifacts(raw)` detects fenced code blocks with file paths
  - [ ] `extractArtifacts(raw)` detects `Writing:` markers
  - [ ] `parseAgentOutput(raw)` returns StructuredResult with artifacts and optional selfCheck
  - [ ] Self-check section is parsed from "Self[- ]?Check" or "Acceptance" headers

---

## 8. Planning

### Task 8.1: Implement intent-to-plan transformation
- **Points**: 3
- **Blocked by**: 2.4
- **Acceptance criteria**:
  - [ ] `generatePlan(input: PlanInput)` returns PlanOutput
  - [ ] 11 domain keywords matched: auth, api, ui, db, test, cli, deploy, security, perf, refactor, agent
  - [ ] Each keyword maps to 2-4 capabilities with dependencies
  - [ ] Unknown intent produces a single generic capability

### Task 8.2: Implement human confirmation flow
- **Points**: 1
- **Blocked by**: 8.1
- **Acceptance criteria**:
  - [ ] `confirmPlan(sessionId, plan)` transitions state from paused to running
  - [ ] Plan can be modified before confirmation
  - [ ] Rejection keeps state paused

### Task 8.3: Implement plan persistence
- **Points**: 1
- **Blocked by**: 8.2
- **Acceptance criteria**:
  - [ ] Plan is serialized to state.yaml
  - [ ] Plan is loaded from state.yaml on session resume
  - [ ] Plan modifications are persisted

---

## 9. Sense System

### Task 9.1: Streamline sense from 22 to ~8 dimensions
- **Points**: 2
- **Blocked by**: 1.2
- **Acceptance criteria**:
  - [ ] Sense module scans project for: language, framework, runtime, test framework, build tool, existing features, existing tests, brownfield flag
  - [ ] Output is a `ProjectProfile` object
  - [ ] Unknown projects return a profile with all nulls

### Task 9.2: Wire sense results into prompt context
- **Points**: 2
- **Blocked by**: 9.1, 3.2
- **Acceptance criteria**:
  - [ ] Project profile is included in MAY layer of every prompt
  - [ ] Profile is serialized to .spec-graph/sessions/<id>/profile.yaml
  - [ ] Profile is loaded on session resume

---

## 10. CLI Refactoring

### Task 10.1: Implement new core CLI commands
- **Points**: 3
- **Blocked by**: 5.3
- **Acceptance criteria**:
  - [ ] `spec-graph plan "<intent>" [--confirm] [--json]` works
  - [ ] `spec-graph auto "<intent>" [--adapter <id>] [--max-retries <n>]` works
  - [ ] `spec-graph status [--json] [--session <id>]` works
  - [ ] `spec-graph next-prompt [--session <id>]` works
  - [ ] `spec-graph advance [--result <json>] [--session <id>]` works
  - [ ] `spec-graph validate` works
  - [ ] `spec-graph intervene <action>` works with all 4 actions
  - [ ] `spec-graph diagnose [--json]` works

### Task 10.2: Remove deprecated commands
- **Points**: 1
- **Blocked by**: 10.1
- **Acceptance criteria**:
  - [ ] v1 commands removed: change, meeting, worktree, merge-queue, review, run, dashboard, distill, and 30+ others
  - [ ] No references to removed commands in codebase
  - [ ] Migration docs mention which v1 commands have no v2 equivalent

### Task 10.3: Update CLI help and examples
- **Points**: 1
- **Blocked by**: 10.1
- **Acceptance criteria**:
  - [ ] `spec-graph --help` prints updated help with all 8 commands
  - [ ] Each command's `--help` is clear and accurate
  - [ ] README.md examples use v2 commands

---

## 11. Hook Integration

### Task 11.1: Implement Claude Code hook integration
- **Points**: 3
- **Blocked by**: 5.3, 7.2
- **Acceptance criteria**:
  - [ ] Post-task hook calls spec-graph to validate result
  - [ ] Pre-task hook generates the next prompt if needed
  - [ ] Hook configuration is documented in `docs/agent-integration-guide.md`

### Task 11.2: Implement stateless API for external orchestration
- **Points**: 2
- **Blocked by**: 5.1
- **Acceptance criteria**:
  - [ ] `next-prompt --json` returns structured JSON
  - [ ] `advance --result "<json>"` accepts structured JSON
  - [ ] `status --json` returns structured JSON
  - [ ] All commands exit with appropriate exit codes (0 success, 1 failure, 2 no session)

---

## 12. End-to-End Validation

### Task 12.1: Create Express starter for E2E validation
- **Points**: 2
- **Blocked by**: —
- **Acceptance criteria**:
  - [ ] examples/express-bookstore-starter/ directory exists
  - [ ] Starter has 6 REST endpoints: health, GET/POST/PUT/DELETE books
  - [ ] Starter has TypeScript strict mode
  - [ ] Starter has tests (vitest + supertest) that all pass
  - [ ] Starter has README with setup instructions

### Task 12.2: Run JWT auth scenario end-to-end
- **Points**: 5
- **Blocked by**: 12.1, M4
- **Acceptance criteria**:
  - [ ] `spec-graph auto "Add JWT authentication"` runs on the starter
  - [ ] At least specify stage completes (proposal.md generated)
  - [ ] At least design stage completes (specs + design.md generated)
  - [ ] Gate evaluation works: proposal passes structure check
  - [ ] Gate failure and retry works: proposal without sections triggers retry
  - [ ] Full 8-stage completion is attempted (best-effort; may fail on later stages)

### Task 12.3: Collect learnings and iterate
- **Points**: 2
- **Blocked by**: 12.2
- **Acceptance criteria**:
  - [ ] Document friction points encountered during E2E
  - [ ] Document gate criteria that were too strict or too loose
  - [ ] Document methodology that needs improvement
  - [ ] Create follow-up tasks for V2.1 improvements

---

## 13. Documentation

### Task 13.1: Update README for V2
- **Points**: 1
- **Blocked by**: M5
- **Acceptance criteria**:
  - [ ] Root README.md reflects v2 architecture
  - [ ] README includes quick start section
  - [ ] README includes architecture diagram
  - [ ] README includes CLI commands table
  - [ ] README includes agent integration section
  - [ ] README includes knowledge-base section

### Task 13.2: Write knowledge-base authoring guide
- **Points**: 1
- **Blocked by**: M2
- **Acceptance criteria**:
  - [ ] docs/knowledge-base-authoring.md exists
  - [ ] Guide explains how to add a new skill
  - [ ] Guide explains how to add a new stage (advanced)
  - [ ] Guide explains good gate.yaml patterns
  - [ ] Guide explains good instruction.md patterns
  - [ ] Guide explains local overrides via .spec-graph/knowledge/

### Task 13.3: Write external agent integration guide
- **Points**: 1
- **Blocked by**: M4
- **Acceptance criteria**:
  - [ ] docs/agent-integration-guide.md exists
  - [ ] Guide covers CLI integration (any agent)
  - [ ] Guide covers Claude Code skills integration
  - [ ] Guide covers custom adapter implementation
  - [ ] Guide covers XML prompt format
  - [ ] Guide covers result format
  - [ ] Guide covers error handling

### Task 13.4: Update architecture-overview.md and other docs
- **Points**: 2
- **Blocked by**: M5
- **Acceptance criteria**:
  - [ ] Obsolete v1 docs in docs/ are either removed or marked as obsolete
  - [ ] packages/core/CLAUDE.md reflects v2 module responsibilities
  - [ ] packages/cli/README.md documents all 8 commands
  - [ ] packages/skills/README.md documents all 4 skills

---

## Summary

| Phase | Tasks | Points | Status |
|-------|-------|--------|--------|
| 1. Project Restructuring | 1.1-1.5 | 9 | ✓ |
| 2. Knowledge-Base | 2.1-2.4 | 12 | ✓ |
| 3. Prompt Construction | 3.1-3.3 | 6 | ✓ |
| 4. State Machine | 4.2-4.3 | 4 | ✓ |
| 5. Automator Loop | 5.1-5.3 | 7 | ✓ |
| 6. Gate + Recovery | 6.1-6.5 | 9 | ✓ |
| 7. Agent Coordination | 7.1-7.4 | 7 | ✓ |
| 8. Planning | 8.1-8.3 | 5 | ✓ |
| 9. Sense System | 9.1-9.2 | 4 | ✗ (not implemented) |
| 10. CLI | 10.1-10.3 | 5 | ✓ |
| 11. Hook Integration | 11.1-11.2 | 5 | ✗ (not implemented) |
| 12. E2E Validation | 12.1-12.3 | 9 | Partial (12.1 done) |
| 13. Documentation | 13.1-13.4 | 5 | ✓ |
| **TOTAL** | | **87** | |

**Current completion: ~73/87 points (84%)**
