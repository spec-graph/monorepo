## ADDED Requirements

### Requirement: Layered prompt structure with priority levels

The prompt-construction capability SHALL generate prompts with a three-layer structure, each layer tagged with a priority level:
1. **MUST layer** — task description, acceptance criteria, project constraints; the agent MUST satisfy these
2. **SHOULD layer** — methodology guidance (document methodology, domain methodology); the agent SHOULD follow these unless there is a justified reason not to
3. **MAY layer** — context information (upstream artifacts summary, project profile, historical similar tasks); the agent MAY use these as reference

Each layer SHALL be wrapped in a distinct XML-style tag so the agent can distinguish priority.

#### Scenario: Prompt with all three layers
- **WHEN** prompt-construction generates a prompt for the design stage
- **THEN** the output SHALL contain a MUST section (with acceptance criteria like "design MUST cover every spec requirement"), a SHOULD section (with OpenSpec-style design methodology and security methodology), and a MAY section (with upstream proposal summary and project profile)

#### Scenario: Agent respects priority
- **WHEN** an external agent receives a prompt with layered structure
- **THEN** the agent's output SHALL satisfy all MUST criteria, follow SHOULD guidance where possible, and MAY reference context information as needed

### Requirement: Methodology weaving from knowledge-base

The prompt-construction capability SHALL maintain a knowledge-base of methodologies organized by: stage (8 stages) → skill (multiple skills per stage) → artifact template (OpenSpec-style) → instruction (methodology guidance). When constructing a prompt, prompt-construction SHALL select the relevant methodology entries and weave them into the SHOULD layer.

#### Scenario: Design stage uses multiple methodologies
- **WHEN** constructing a prompt for the design stage
- **THEN** prompt-construction SHALL weave in the OpenSpec-style design instruction AND any domain-specific methodology (e.g., security methodology for auth-related tasks)

#### Scenario: Methodology selection based on intent
- **WHEN** the user's intent indicates a specific domain (e.g., authentication)
- **THEN** prompt-construction SHALL select the matching domain methodology from the knowledge-base and include it in the prompt

### Requirement: Upstream artifact integration

The prompt-construction capability SHALL read all completed upstream artifacts, summarize them, and include the summary in the MAY layer of the generated prompt. This ensures the agent has access to prior context.

#### Scenario: Design stage receives proposal + specs summaries
- **WHEN** constructing a prompt for the design stage
- **THEN** prompt-construction SHALL include summaries of the completed proposal.md and all spec files in the MAY layer

#### Scenario: Implement stage receives full upstream chain
- **WHEN** constructing a prompt for the implement stage
- **THEN** prompt-construction SHALL include summaries of proposal, specs, design, and tasks in the MAY layer

### Requirement: Acceptance criteria embedding

The prompt-construction capability SHALL embed the exit criteria of the current stage (as defined in the stage configuration) into the MUST layer of the generated prompt. This allows the agent to self-check before submitting.

#### Scenario: Agent self-checks against criteria
- **WHEN** an agent receives a prompt with embedded acceptance criteria
- **THEN** the agent's output SHALL be structured to satisfy all embedded criteria, and the agent MAY include a self-check summary

### Requirement: Standardized prompt format

The prompt-construction capability SHALL output prompts in a standardized format that is compatible with multiple external agent types (Claude Code, Codex, Gemini CLI, etc.). The format SHALL use XML-style tags and avoid agent-specific syntax.

#### Scenario: Same prompt consumed by different agents
- **WHEN** the same generated prompt is fed to Claude Code and to Codex
- **THEN** both agents SHALL be able to parse the prompt structure and produce appropriate outputs

### Requirement: Knowledge-base organization

The knowledge-base SHALL be organized as a directory tree: `stages/<stage>/skills/<skill>/` containing `instruction.md` (methodology guidance) and `templates/` (artifact format templates). The knowledge-base SHALL be extensible — users and maintainers can add new skills without modifying spec-graph's core.

#### Scenario: Adding a new skill
- **WHEN** a maintainer wants to add a new "performance-audit" skill for the review stage
- **THEN** the maintainer SHALL create `stages/review/skills/performance-audit/instruction.md` and optional templates, and the prompt-construction capability SHALL be able to select and weave this new skill without code changes

#### Scenario: OpenSpec-style instruction preserved
- **WHEN** the knowledge-base contains an OpenSpec-style instruction (with sections like "Common pitfalls", "Why this matters", "Delta operations")
- **THEN** prompt-construction SHALL preserve this rich guidance when weaving it into the prompt
