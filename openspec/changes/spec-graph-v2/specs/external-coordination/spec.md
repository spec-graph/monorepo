## ADDED Requirements

### Requirement: Execution delegation to external agents

The external-coordination capability SHALL delegate all execution (code writing, document writing, test execution, verification commands) to external AI agents. spec-graph SHALL NOT directly execute code, write to project files, or run tests itself. All execution SHALL happen via structured prompts sent to external agents.

#### Scenario: Code implementation via external agent
- **WHEN** the implement stage needs to write code for a task
- **THEN** external-coordination SHALL generate a structured prompt describing the task, hand it to an external agent (e.g., Claude Code), and receive the resulting code changes back

#### Scenario: spec-graph never writes code directly
- **WHEN** spec-graph is running
- **THEN** spec-graph's own process SHALL NOT write to the project's source files; all source file writes SHALL come from the external agent

### Requirement: Structured verification prompts

For verification tasks (end-to-end testing, security scans, performance checks), external-coordination SHALL generate a structured verification prompt that lists the scenarios to verify, the expected outcomes, and the format for reporting results. The external agent SHALL execute the verification and return results in the specified structured format.

#### Scenario: E2E verification prompt
- **WHEN** the accept stage needs to verify end-to-end behavior
- **THEN** external-coordination SHALL generate a prompt listing each scenario (e.g., "POST /login with valid credentials"), expected outcome (e.g., "200 + JWT token"), and request the agent to return a structured verification report

#### Scenario: Agent returns structured results
- **WHEN** the external agent executes the verification
- **THEN** the agent's response SHALL be a structured report with per-scenario results (status code, response body, pass/fail)

### Requirement: Structured result validation

The external-coordination capability SHALL validate the structured results returned by external agents against the acceptance criteria defined in the gate-enforcement configuration. Validation SHALL be deterministic and machine-checkable.

#### Scenario: All scenarios pass
- **WHEN** all scenarios in the verification report match their expected outcomes
- **THEN** external-coordination SHALL report gate pass to the automator

#### Scenario: One scenario fails
- **WHEN** one scenario in the verification report does not match its expected outcome
- **THEN** external-coordination SHALL report gate failure with the specific failing scenario, and the gate-enforcement capability SHALL generate a targeted diagnosis

### Requirement: Multi-agent support

The external-coordination capability SHALL support multiple external agent types (Claude Code, Codex CLI, Gemini CLI, etc.) through configurable agent adapters. Each adapter SHALL translate spec-graph's standardized prompt into the agent's native invocation format, and translate the agent's response back into spec-graph's standardized format.

#### Scenario: Switching agents between stages
- **WHEN** the user configures Claude Code for implement stage and Codex for review stage
- **THEN** external-coordination SHALL invoke Claude Code for implement tasks and Codex for review tasks, using the appropriate adapter for each

#### Scenario: New agent adapter added
- **WHEN** a maintainer adds a new agent adapter for a new AI agent
- **THEN** external-coordination SHALL be able to invoke the new agent without modifying its core logic

### Requirement: Prompt result traceability

For every prompt sent to an external agent, external-coordination SHALL persist: the prompt content, the agent invoked, the agent's response, the timestamp, and the resulting gate evaluation. This trace SHALL be queryable for diagnostics and retrospectives.

#### Scenario: Querying agent interaction history
- **WHEN** the user or a diagnostic tool queries the trace
- **THEN** external-coordination SHALL return the full history of prompt-response interactions for the current change

#### Scenario: Failed agent response analyzed
- **WHEN** an agent's response fails gate validation
- **THEN** the diagnosis engine SHALL have access to the exact prompt and response that failed, enabling targeted retry

### Requirement: Graceful agent failure handling

If an external agent fails to respond, returns malformed output, or times out, external-coordination SHALL treat this as a gate failure and feed it into the gate-enforcement retry strategy. The capability SHALL NOT crash or hang.

#### Scenario: Agent timeout
- **WHEN** an external agent does not respond within the configured timeout
- **THEN** external-coordination SHALL record a timeout, feed it to gate-enforcement as a failure, and trigger the retry strategy

#### Scenario: Malformed agent response
- **WHEN** an external agent returns output that cannot be parsed into the expected structured format
- **THEN** external-coordination SHALL record a parse error, feed it to gate-enforcement, and retry with a more explicit format instruction in the next prompt
