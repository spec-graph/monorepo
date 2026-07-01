# spec-graph Prompt Schema

Version: 1.0
Target consumers: AI agents (Claude Code, Codex, Gemini CLI, etc.)

## Purpose

This document defines the XML-style layered prompt format that spec-graph generates for external AI agents. The prompt is structured with three priority layers (MUST / SHOULD / MAY) so agents can reliably parse and respect priorities.

## Design principles

1. **XML-style tags** — Agents parse XML tags reliably. Avoid ambiguous free-form.
2. **Priority levels** — MUST > SHOULD > MAY. Agents MUST satisfy MUST, SHOULD follow SHOULD, MAY reference MAY.
3. **Explicit sections** — Each concern (task, criteria, constraints, methodology, context) is a separate tag.
4. **Self-contained** — A prompt should contain everything the agent needs. No implicit context.
5. **Machine-readable where possible** — Structured data (criteria, constraints) as lists, not prose.

## Layer structure

```
┌─────────────────────────────────────────────────┐
│  Layer 1: MUST (必须满足)                        │
│  - task                                          │
│  - acceptance_criteria                           │
│  - project_constraint                            │
│                                                  │
│  Agent MUST satisfy all of these.                │
│  Violation = gate failure.                       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Layer 2: SHOULD (应该遵循)                       │
│  - methodology                                   │
│    - doc_methodology (OpenSpec-style)            │
│    - domain_methodology (BMAD-style)             │
│                                                  │
│  Agent SHOULD follow these unless justified      │
│  reason not to. Deviation = requires note in     │
│  self-check.                                     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Layer 3: MAY (可以参考)                          │
│  - context                                       │
│    - upstream (artifact summaries)               │
│    - project_profile (sense output)              │
│    - similar_tasks (history)                     │
│                                                  │
│  Agent MAY reference these for context.          │
│  No penalty for not using them.                  │
└─────────────────────────────────────────────────┘
```

## Tag reference

### `<task level="MUST">` (required, exactly one)

The primary task description. What the agent should do.

```xml
<task level="MUST">
  Create the proposal document for the "add JWT authentication" change.
  The proposal establishes WHY this change is needed.
</task>
```

### `<acceptance_criteria level="MUST">` (required, exactly one)

List of criteria that MUST be satisfied. Each criterion is a bullet. The gate will check these.

```xml
<acceptance_criteria level="MUST">
  - proposal.md exists at the specified path
  - proposal.md contains Why / What Changes / Capabilities / Impact sections
  - Capabilities section lists at least 2 capabilities
  - All capability identifiers use kebab-case
  - Total length: 1-2 pages (not more)
</acceptance_criteria>
```

### `<project_constraint level="MUST">` (required, exactly one)

Constraints from the project profile that MUST be respected (language, framework, patterns).

```xml
<project_constraint level="MUST">
  - language: TypeScript
  - framework: Express
  - existing pattern: routes in src/routes/*.ts
  - existing pattern: error handler returns JSON { error: string }
  - test framework: vitest
</project_constraint>
```

### `<methodology level="SHOULD">` (required, exactly one)

Methodology guidance. Contains nested tags for different methodology sources.

```xml
<methodology level="SHOULD">
  <doc_methodology source="requirement-analysis">
    [Content from knowledge/stages/specify/skills/requirement-analysis/instruction.md]

    Create the proposal document that establishes WHY...
    Required sections: Why, What Changes, Capabilities, Impact.
    Common pitfalls: vague "why", over-scoping, capabilities as afterthought...
    Self-check questions: ...
  </doc_methodology>

  <domain_methodology source="security-basics">
    [Content from a security-related skill if applicable]

    For auth-related changes, ensure:
    - Passwords are hashed (bcrypt, cost ≥ 10)
    - JWT secrets from env vars, not hardcoded
    - Tokens have expiration
    - HTTPS only
  </domain_methodology>
</methodology>
```

### `<context level="MAY">` (required, exactly one)

Reference information the agent MAY use.

```xml
<context level="MAY">
  <upstream>
    <artifact id="plan" path=".spec-graph/plan.yaml">
      Plan confirmed. Capabilities: user, auth, middleware. Order: user → auth → middleware.
    </artifact>
  </upstream>

  <project_profile>
    Brownfield Express app (bookstore API). Existing features: book CRUD.
    No existing auth system. TypeScript + vitest.
  </project_profile>

  <similar_tasks>
    (none — first change in this project)
  </similar_tasks>
</context>
```

### `<previous_failure level="MUST">` (optional, zero or one)

Present only when the agent is retrying after a gate failure. Contains the diagnosis from the previous attempt.

```xml
<previous_failure level="MUST">
  <diagnosis retry-level="1" similar-to-previous="false">
    <failed_criteria>
      <criterion id="capabilities-kebab-case">
        <reason>Capability identifiers not in kebab-case</reason>
        <evidence>Found "UserAuth" and "JWT Token" in proposal.md</evidence>
        <suggested-fix>Rename to "user-auth" and "jwt-token"</suggested-fix>
      </criterion>
    </failed_criteria>
  </diagnosis>

  Please address the failed criteria in your next attempt.
</previous_failure>
```

### `<output_spec level="MUST">` (required, exactly one)

Where to write the output and in what format.

```xml
<output_spec level="MUST">
  Write the proposal to: .spec-graph/changes/add-jwt-auth/proposal.md
  Use the template at: knowledge/stages/specify/skills/requirement-analysis/templates/proposal.md
</output_spec>
```

### `<self_check level="MUST">` (required, exactly one)

Instructions for the agent to self-check before submitting.

```xml
<self_check level="MUST">
  Before submitting, verify:
  - All acceptance criteria are met
  - Methodology guidance was followed (or deviations noted)
  - Output is at the specified path
  Return your self-check result in the structured format specified by the agent adapter.
</self_check>
```

## Full example

A complete prompt for the specify stage (proposal):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<spec_graph_prompt version="1.0" session="add-jwt-auth" stage="specify">

  <task level="MUST">
    Create the proposal document for the "add JWT authentication" change.
  </task>

  <acceptance_criteria level="MUST">
    - proposal.md exists at .spec-graph/changes/add-jwt-auth/proposal.md
    - Contains Why / What Changes / Capabilities / Impact sections
    - Capabilities section lists at least 2 capabilities
    - All capability identifiers use kebab-case
    - Total length: 1-2 pages
  </acceptance_criteria>

  <project_constraint level="MUST">
    - language: TypeScript
    - framework: Express
    - test framework: vitest
    - brownfield project (existing book CRUD feature)
  </project_constraint>

  <methodology level="SHOULD">
    <doc_methodology source="requirement-analysis">
      Create the proposal document that establishes WHY...
      [full content from instruction.md]
    </doc_methodology>
  </methodology>

  <context level="MAY">
    <upstream>
      <artifact id="plan" path=".spec-graph/plan.yaml">
        Plan confirmed. Capabilities: user, auth, middleware.
      </artifact>
    </upstream>
    <project_profile>
      Brownfield Express app (bookstore API). No existing auth.
    </project_profile>
  </context>

  <output_spec level="MUST">
    Write to: .spec-graph/changes/add-jwt-auth/proposal.md
    Template: knowledge/stages/specify/skills/requirement-analysis/templates/proposal.md
  </output_spec>

  <self_check level="MUST">
    Verify all acceptance criteria are met before submitting.
  </self_check>

</spec_graph_prompt>
```

## Notes for prompt-construction module

The `buildPrompt(context: PromptContext)` function in `packages/core/src/prompt-construction` must:

1. Load the gate.yaml for the current stage to get exit criteria → acceptance_criteria
2. Load the project profile (from sense) → project_constraint
3. Load the methodology from knowledge-base based on stage + skill selection → methodology
4. Load upstream artifact summaries → context.upstream
5. If retrying, load previous diagnosis → previous_failure
6. Compose into XML format
7. Return as string

## Agent adapter responsibilities

Each agent adapter (Claude Code, Codex, etc.) must:

1. Receive the XML prompt
2. Pass it to the underlying agent (via CLI, SDK, etc.)
3. Receive the agent's response
4. Parse the response into a structured `AgentResult`:
   - artifacts: list of {path, content}
   - selfCheck: { acceptanceCriteriaMet: boolean, notes: string }
5. Return the AgentResult to spec-graph for gate evaluation

## Validation

A prompt is valid if:
- It has exactly one of each required tag (task, acceptance_criteria, project_constraint, methodology, context, output_spec, self_check)
- All priority levels are correct (MUST/SHOULD/MAY)
- previous_failure is present only when retrying
- All referenced paths (templates, artifacts) exist in the knowledge-base or project
