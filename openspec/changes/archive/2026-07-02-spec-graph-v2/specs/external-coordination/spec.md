## ADDED Requirements

### Requirement: Agent adapter interface

The external-coordination capability SHALL define a standard `AgentAdapter` interface:
- `id: string` — unique adapter identifier (e.g., 'claude-code', 'codex')
- `invoke(prompt: string, config: AgentConfig): Promise<AgentResponse>` — invoke the agent with a prompt
- `parseResponse(raw: string): Promise<StructuredResult>` — parse the raw agent output into structured artifacts + self-check

All adapters SHALL implement this interface.

#### Scenario: Adapter invocation
- **WHEN** an agent is invoked via `invokeAgent`
- **THEN** the adapter's `invoke` method SHALL be called with the prompt and config, returning an `AgentResponse`

#### Scenario: Custom adapter registration
- **WHEN** a user registers a custom adapter via `registerAdapter`
- **THEN** the adapter SHALL be added to the registry and available for subsequent `invokeAgent` calls

### Requirement: Claude Code adapter

The external-coordination capability SHALL ship with a `ClaudeCodeAdapter` that:
- Invokes the `claude` CLI via `child_process.spawn`
- Passes the prompt via `-p "<prompt>" --output-format text`
- Searches for `claude` on PATH, including common global npm paths (`~/.npm-global/bin`, `/usr/local/bin`, `/usr/bin`)
- Returns `agent-not-found` status if `claude` is not installed, with an actionable error message

#### Scenario: Claude is installed
- **WHEN** `claude` is found on PATH
- **THEN** the adapter SHALL spawn the process, capture stdout and stderr, and return an `AgentResponse` with `status: 'success'` if exit code is 0 and stdout is non-empty

#### Scenario: Claude not installed
- **WHEN** `claude` is not found on PATH
- **THEN** the adapter SHALL return `status: 'agent-not-found'` with an error message including the install command: "npm install -g @anthropic-ai/claude-code"

#### Scenario: Claude invocation fails
- **WHEN** `claude` exits with a non-zero exit code
- **THEN** the adapter SHALL return `status: 'failure'` with the stderr content in the error field

#### Scenario: Claude produces no output
- **WHEN** `claude` exits with code 0 but stdout is empty
- **THEN** the adapter SHALL return `status: 'partial'` with a warning message

### Requirement: Timeout handling

The external-coordination capability SHALL enforce a timeout on agent invocations. Default timeout SHALL be 300,000 ms (5 minutes). The timeout SHALL be configurable per invocation.

#### Scenario: Agent responds within timeout
- **WHEN** the agent responds within the configured timeout
- **THEN** the adapter SHALL return the response normally

#### Scenario: Agent times out
- **WHEN** the agent does not respond within the timeout
- **THEN** the adapter SHALL abort the invocation and return `status: 'timeout'` with a descriptive error

#### Scenario: Custom timeout
- **WHEN** the config specifies `timeoutMs: 60000`
- **THEN** the timeout SHALL be 60 seconds for that invocation only

### Requirement: Artifact extraction from agent output

The external-coordination capability SHALL attempt to extract structured artifacts from the agent's raw output using two patterns:
1. **Fenced code blocks with file path**: `` ```path/to/file\n<content>\n``` ``
2. **Write markers**: Lines matching `(Writing|Created|Saved):\s*<path>`

#### Scenario: Fenced code block detected
- **WHEN** the agent output contains ` ```path/to/file.md\n<content>\n``` `
- **THEN** the adapter SHALL extract `{ path: 'path/to/file.md', content: '<content>' }` into the artifacts array

#### Scenario: Write marker detected
- **WHEN** the agent output contains `Writing: path/to/file.md`
- **THEN** the adapter SHALL extract a path marker `{ path: 'path/to/file.md', content: '' }` into the artifacts array (content may be in the next line of output)

#### Scenario: No extraction patterns match
- **WHEN** the agent output does not contain any recognized patterns
- **THEN** the adapter SHALL return an empty artifacts array. The caller (automator) SHALL fall back to using the raw output as a single artifact

### Requirement: Response parsing

The external-coordination capability SHALL provide a `parseResponse` method that converts raw agent output into a `StructuredResult`:
- `artifacts`: extracted file paths + content
- `selfCheck`: parsed from agent's self-check section (if present), with `acceptanceCriteriaMet: boolean` and optional `notes`

#### Scenario: Self-check section present
- **WHEN** the agent output contains a section matching `(Self[- ]?Check|Acceptance)` that includes words like "met", "pass", or "all criteria"
- **THEN** `selfCheck.acceptanceCriteriaMet` SHALL be true

#### Scenario: No self-check section
- **WHEN** the agent output does not contain a self-check section
- **THEN** `selfCheck` SHALL be undefined

### Requirement: Agent registry

The external-coordination capability SHALL maintain an in-memory registry of adapters, keyed by adapter id. Multiple adapters can be registered concurrently.

#### Scenario: Registry starts with built-in adapters
- **WHEN** the `createClaudeCodeAdapter()` and `createCodexAdapter()` functions are called
- **THEN** the registry SHALL contain adapters with ids `claude-code` and `codex`

#### Scenario: Registry empty initially
- **WHEN** no adapters have been explicitly created
- **THEN** `listAdapters()` SHALL return an empty array

#### Scenario: Unknown adapter invocation
- **WHEN** `invokeAgent` is called with an `adapterId` not in the registry
- **THEN** the response SHALL be `status: 'failure'` with an error listing the available adapters

### Requirement: Codex adapter (stub)

The external-coordination capability SHALL provide a `CodexAdapter` that invokes the `codex` CLI via `codex exec <prompt>`. The adapter SHALL be a stub that delegates to the same parsing logic as ClaudeCodeAdapter.

#### Scenario: Codex not installed
- **WHEN** `codex` is not found on PATH
- **THEN** the adapter SHALL return `status: 'agent-not-found'` with an error message

#### Scenario: Codex installed
- **WHEN** `codex` is found on PATH
- **THEN** the adapter SHALL invoke it and return the response (delegating to the shared parsing logic)
