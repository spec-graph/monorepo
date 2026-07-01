## ADDED Requirements

### Requirement: Layered prompt structure with priority levels

The prompt-construction capability SHALL generate prompts with a three-layer structure, each layer tagged with a priority level via XML attributes:
1. **MUST layer** — task description, acceptance criteria, project constraints; the agent MUST satisfy these. Violation of any MUST criterion SHALL result in a gate failure.
2. **SHOULD layer** — methodology guidance (doc methodology + domain methodology); the agent SHOULD follow these unless there is a justified reason not to. Deviation from SHOULD guidance SHALL be documented in the agent's self-check.
3. **MAY layer** — context information (upstream artifacts summary, project profile, historical similar tasks); the agent MAY reference these as context. No penalty for not using MAY content.

Each layer SHALL be wrapped in XML-style tags (`<task>`, `<acceptance_criteria>`, `<project_constraint>`, `<methodology>`, `<context>`) that are parseable by common AI agents (Claude Code, Codex, Gemini).

#### Scenario: Prompt with all three layers
- **WHEN** prompt-construction generates a prompt for the design stage
- **THEN** the output SHALL contain a MUST section (with acceptance criteria like "design.md MUST cover every spec requirement"), a SHOULD section (with OpenSpec-style design methodology and any domain-specific methodology such as security), and a MAY section (with upstream proposal summary and project profile)

#### Scenario: Priority level ordering
- **WHEN** an agent receives a prompt with layered structure
- **THEN** the agent's output SHALL be evaluated against MUST criteria first. Only after MUST criteria are satisfied SHALL SHOULD and MAY guidance be evaluated for quality

#### Scenario: XML escape safety
- **WHEN** the prompt content contains characters that require XML escaping (e.g., `<`, `>`, `&`, `"`, `'`)
- **THEN** the prompt builder SHALL escape these characters correctly so the prompt parses as valid XML

### Requirement: Methodology weaving from knowledge-base

The prompt-construction capability SHALL accept a list of skill IDs from the knowledge-base, load the corresponding `instruction.md` content from the knowledge-base directory tree, and weave them into the SHOULD layer of the prompt.

#### Scenario: Multiple methodologies woven
- **WHEN** constructing a prompt for the design stage with skillIds `['specs-authoring', 'design-authoring']`
- **THEN** prompt-construction SHALL load instruction.md for each skill and wrap each in a `<doc_methodology source="<skillId>">` tag within the SHOULD layer

#### Scenario: Missing skill
- **WHEN** a requested skillId does not exist in the knowledge-base
- **THEN** prompt-construction SHALL skip that skill silently (no error), and the resulting prompt SHALL simply omit that methodology section

#### Scenario: Methodology selection based on stage
- **WHEN** the stage is `specify`, the automator SHALL request the `requirement-analysis` skill; when `design`, `specs-authoring` and `design-authoring`; when `plan`, `task-decomposition`; when `implement`, `code-generation`; when `review`, `code-review`; when `test`, `test-strategy`; when `accept`, `e2e-verification`; when `integrate`, `ci-integration`

### Requirement: Upstream artifact integration

The prompt-construction capability SHALL read all completed upstream artifacts (based on stage ordering), summarize each, and include the summaries in the MAY layer's `<upstream>` section.

#### Scenario: Design stage receives proposal + specs summaries
- **WHEN** constructing a prompt for the design stage
- **THEN** prompt-construction SHALL include summaries of the completed proposal.md and all spec files in the `<upstream>` section

#### Scenario: Implement stage receives full upstream chain
- **WHEN** constructing a prompt for the implement stage
- **THEN** prompt-construction SHALL include summaries of proposal, specs, design, and tasks in the `<upstream>` section

#### Scenario: Artifact content truncated
- **WHEN** an upstream artifact is larger than 500 characters
- **THEN** prompt-construction SHALL truncate it to 500 characters with a `...` suffix, to keep prompt size manageable

### Requirement: Acceptance criteria embedding

The prompt-construction capability SHALL embed the exit criteria of the current stage (as defined in the stage's `gate.yaml`) into the MUST layer's `<acceptance_criteria>` tag. Each criterion SHALL include its id, description, and (if applicable) format expectations.

#### Scenario: Agent self-checks against criteria
- **WHEN** an agent receives a prompt with embedded acceptance criteria
- **THEN** the agent's output SHALL be structured to satisfy all embedded criteria, and the agent MAY include a self-check summary in its response

#### Scenario: Format hints for structure checks
- **WHEN** a criterion checks for a specific format (e.g., capabilities in `- \`kebab-case\`: description` format)
- **THEN** the criterion's description in the prompt SHALL include the expected format as guidance

### Requirement: Previous failure injection

When the session's retry count is >0, the prompt SHALL include a `<previous_failure>` section in the MUST layer containing the most recent diagnosis, so the agent can learn from previous failures.

#### Scenario: First attempt has no previous failure
- **WHEN** the agent is invoked for the first time on a stage (retryCount = 0)
- **THEN** the prompt SHALL NOT contain a `<previous_failure>` section

#### Scenario: Retry includes diagnosis
- **WHEN** the agent is invoked for a retry attempt (retryCount > 0)
- **THEN** the prompt SHALL include the most recent diagnosis in the `<previous_failure>` section, with: failed criteria IDs, reasons, evidence, and suggested fixes

### Requirement: Standardized prompt format

The prompt-construction capability SHALL output prompts in a standardized XML format compatible with multiple external agent types (Claude Code, Codex, Gemini CLI). The format SHALL:
- Use XML-style tags for structure
- Avoid agent-specific syntax (no JSON wrapping, no markdown fences for the outer prompt)
- Include an XML declaration: `<?xml version="1.0" encoding="UTF-8"?>`
- Wrap the entire prompt in a `<spec_graph_prompt>` root tag with `version`, `session`, and `stage` attributes

#### Scenario: Same prompt consumed by different agents
- **WHEN** the same generated prompt is fed to Claude Code and to Codex
- **THEN** both agents SHALL be able to parse the prompt structure and produce appropriate outputs

### Requirement: Knowledge-base integration

The prompt-construction capability SHALL integrate with the knowledge-base module to load methodology entries. The knowledge-base SHALL be loaded once per session and cached for the session duration.

#### Scenario: Knowledge-base loaded on first prompt
- **WHEN** the first prompt is generated in a session
- **THEN** the knowledge-base SHALL be loaded from disk and cached

#### Scenario: Knowledge-base reload on override change
- **WHEN** the user modifies `.spec-graph/knowledge/` during a session
- **THEN** the next prompt generation SHALL reload the knowledge-base from disk to pick up the override

### Requirement: Template integration

The prompt-construction capability SHALL embed the path to the stage's template (from `knowledge/stages/<stage>/skills/<skill>/templates/<template>.md`) in the MUST layer's `<output_spec>` section, so the agent can reference the expected format.

#### Scenario: Template exists
- **WHEN** the stage has a template (e.g., `proposal.md` for specify stage)
- **THEN** the `<output_spec>` SHALL include `Template: knowledge/stages/.../templates/<template>.md`

#### Scenario: Template missing
- **WHEN** the stage does not have a template for the selected skill
- **THEN** the `<output_spec>` SHALL omit the `Template:` line
