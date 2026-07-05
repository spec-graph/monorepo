## ADDED Requirements

### Requirement: README updated with dispatch documentation

The README.md SHALL include comprehensive documentation for the dispatch command and workflow.

#### Scenario: Dispatch command section
- **WHEN** README.md is read
- **THEN** it SHALL contain a section on `spec-graph dispatch` command
- **AND** it SHALL explain:
  - Command syntax: `spec-graph dispatch --session <id> --json`
  - Output: DispatchManifest JSON with 9-section envelopes
  - Usage: Used by hook or external orchestrator to get next action

#### Scenario: Hook documentation
- **WHEN** README.md is read
- **THEN** it SHALL document the dispatch-watcher.mjs hook
- **AND** it SHALL explain:
  - How to register hook (auto via init, or manual)
  - How hook works (PostToolUse, detects dispatch, injects system-reminder)
  - Configuration in .claude/settings.json

#### Scenario: 8-stage FSM diagram
- **WHEN** README.md is read
- **THEN** it SHALL contain updated 8-stage FSM diagram
- **AND** stages SHALL be: specify, design, tasks, implement, review, test, accept, integrate
- **AND** it SHALL NOT reference 'plan' stage

#### Scenario: CLI command table
- **WHEN** README.md is read
- **THEN** it SHALL contain updated CLI command table
- **AND** it SHALL include: init, plan, confirm, compose, dispatch, advance, status, intervene, diagnose, sessions, validate, config, machine, artifact-complete, check-run, completion
- **AND** it SHALL NOT include: auto, next-prompt (if deleted)

#### Scenario: machine-state.yaml documentation
- **WHEN** README.md is read
- **THEN** it SHALL document machine-state.yaml file
- **AND** it SHALL explain:
  - Purpose: artifact state tracking
  - Structure: sessionId, artifacts (per stage, per capability)
  - Status values: pending, in_progress, completed, failed

### Requirement: spec-graph-dispatch SKILL created

A new SKILL file SHALL be created at `packages/skills/spec-graph-dispatch/SKILL.md`.

#### Scenario: SKILL file exists
- **WHEN** packages/skills/ is inspected
- **THEN** `spec-graph-dispatch/SKILL.md` SHALL exist

#### Scenario: SKILL frontmatter
- **WHEN** SKILL.md is read
- **THEN** it SHALL have frontmatter:
  ```yaml
  ---
  name: spec-graph-dispatch
  description: >
    通过 dispatch + hook 路径运行 spec-graph 工作流.
    每次 dispatch --json 后, hook 自动注入 system-reminder,
    Claude Code 主 agent 用 Agent tool 派发 sub-agent.
    重复 8 阶段循环直到 done.
  ---
  ```

#### Scenario: When to use section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "何时使用" section
- **AND** it SHALL explain:
  - User wants to run complete spec-graph workflow
  - User has confirmed plan (state.yaml state = "running")

#### Scenario: Prerequisites section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "前提条件" section
- **AND** it SHALL list:
  - spec-graph CLI installed
  - .spec-graph/ directory exists (init run)
  - Current session state = "running"
  - Hook registered (dispatch-watcher in .claude/settings.json)

#### Scenario: Workflow section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "工作流" section
- **AND** it SHALL describe the 8-stage loop:
  1. Run `spec-graph dispatch --session <id> --json`
  2. Hook auto-injects system-reminder
  3. Dispatch sub-agent(s) per system-reminder
  4. Collect sub-agent output (artifacts)
  5. Run `spec-graph advance --session <id> --result '<json>'`
  6. Check result (advanced/done/error)
  7. Repeat until state = "completed"

#### Scenario: Parallel dispatch section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "并行 dispatch" section
- **AND** it SHALL explain:
  - When manifest.actions.length > 1
  - Same parallel_group → dispatch simultaneously
  - Multiple parallel_groups → dispatch in order

#### Scenario: Error handling section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "错误处理" section
- **AND** it SHALL cover:
  - Gate failure: read diagnosis, fix artifact, retry
  - Agent returns BLOCKED: report to user, wait for guidance
  - Hook didn't trigger: check settings.json, check hook path, manual install

### Requirement: spec-graph-init SKILL created

A new SKILL file SHALL be created at `packages/skills/spec-graph-init/SKILL.md`.

#### Scenario: SKILL file exists
- **WHEN** packages/skills/ is inspected
- **THEN** `spec-graph-init/SKILL.md` SHALL exist

#### Scenario: SKILL frontmatter
- **WHEN** SKILL.md is read
- **THEN** it SHALL have frontmatter:
  ```yaml
  ---
  name: spec-graph-init
  description: >
    初始化一个 spec-graph 项目. 创建 .spec-graph/ 目录,
    写 config.yaml, 注册 hook 到 .claude/settings.json.
  ---
  ```

#### Scenario: When to use section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "何时使用" section
- **AND** it SHALL explain:
  - First time using spec-graph
  - Project doesn't have .spec-graph/ directory

#### Scenario: Steps section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "步骤" section
- **AND** it SHALL describe:
  1. Run `spec-graph init`
  2. Creates .spec-graph/config.yaml
  3. Creates .spec-graph/sessions/
  4. Auto-registers hook to .claude/settings.json
  5. If packs/ exists → auto-compose → graph.yaml

#### Scenario: Verification section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "验证" section
- **AND** it SHALL explain:
  - `ls .spec-graph/` should show config.yaml + sessions/
  - `cat .claude/settings.json` should show hook configuration
  - `spec-graph compose` should work (if packs exist)

#### Scenario: Next steps section
- **WHEN** SKILL.md is read
- **THEN** it SHALL contain "接下来" section
- **AND** it SHALL explain:
  - `spec-graph plan "<intent>"`
  - Enter spec-graph-dispatch SKILL

### Requirement: Migration guide created

A migration guide SHALL be created at `docs/migration-3.0.md`.

#### Scenario: Migration guide exists
- **WHEN** docs/ directory is inspected
- **THEN** `migration-3.0.md` SHALL exist

#### Scenario: Migration steps
- **WHEN** migration guide is read
- **THEN** it SHALL contain step-by-step migration instructions:
  1. Delete `.spec-graph/` (incompatible format)
  2. `npm uninstall -g spec-graph`
  3. `npm install -g spec-graph@3`
  4. `spec-graph init` (recreate .spec-graph/)
  5. `spec-graph plan "<intent>"` (start new session)

#### Scenario: Breaking changes section
- **WHEN** migration guide is read
- **THEN** it SHALL document breaking changes:
  - `auto` command deleted → use dispatch + hook instead
  - `next-prompt` XML format deleted → use dispatch --json instead
  - `external-coordination` deleted → use hook instead
  - FSM stage `plan` renamed to `tasks`

#### Scenario: What's preserved section
- **WHEN** migration guide is read
- **THEN** it SHALL document what's preserved:
  - Stateless API (next-prompt --json + advance) if implemented
  - Hook API (dispatch --json + advance)
  - All other commands (plan, confirm, compose, status, ...)
  - 8-stage FSM
  - knowledge-base
  - gate-enforcement

#### Scenario: Rationale section
- **WHEN** migration guide is read
- **THEN** it SHALL explain rationale:
  - v3.0 enforces "brain, not hands" principle
  - spec-graph is declaration engine, not executor
  - All agent invocation delegated to external coordinators

### Requirement: packages/core/CLAUDE.md updated

The `packages/core/CLAUDE.md` file SHALL be updated to reflect the new workflow.

#### Scenario: New workflow documented
- **WHEN** packages/core/CLAUDE.md is read
- **THEN** it SHALL document:
  - dispatch + hook workflow
  - 9-section envelope format
  - Stage names (including 'tasks' not 'plan')

#### Scenario: external-coordination references removed
- **WHEN** packages/core/CLAUDE.md is read
- **THEN** it SHALL NOT reference external-coordination module
- **AND** it SHALL NOT reference invokeAgent or autoRun

#### Scenario: Module list updated
- **WHEN** packages/core/CLAUDE.md is read
- **THEN** module list SHALL include:
  - automator, planning, gate-enforcement, knowledge-base, recovery, sense, composer, machine-state, dispatch, dependency-analyzer
- **AND** it SHALL NOT include:
  - external-coordination, prompt-construction
