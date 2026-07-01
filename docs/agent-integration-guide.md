# External Agent Integration Guide

This guide explains how to integrate external AI agents (Claude Code, Codex, Gemini CLI, etc.) with spec-graph.

## Overview

spec-graph is a development "brain, not hands." It generates rich layered XML prompts and evaluates agent outputs through strict quality gates. Agents do the hands-on work; spec-graph does the thinking.

```
┌─────────────┐      prompt (XML)      ┌─────────────┐
│  spec-graph │ ──────────────────────▶ │   Agent     │
│   (brain)   │                         │   (hands)   │
│             │ ◀────────────────────── │             │
└─────────────┘    result (JSON)        └─────────────┘
```

## Integration Methods

### 1. CLI (Any Agent)

Any agent that can execute shell commands can drive spec-graph:

```bash
# Start session
spec-graph plan "Add JWT auth" --confirm --json

# Get prompt (returns XML)
spec-graph next-prompt

# Execute prompt, produce artifacts
# (agent does the work)

# Submit result
spec-graph advance --result '{"artifacts": [{"path": "...", "content": "..."}]}'

# Check progress
spec-graph status --json
```

### 2. Claude Code Skills

Install SKILL.md files for Claude Code to orchestrate the CLI:

```bash
cp -r packages/skills/spec-graph-* ~/.claude/skills/
```

Then in Claude Code: `/spec-graph-plan "..."`, `/spec-graph-auto "..."`, etc.

### 3. Custom Adapter (TypeScript)

Implement the `AgentAdapter` interface and register it:

```typescript
import { externalCoordination } from '@spec-graph/core';

const myAdapter = {
  id: 'my-agent',

  async invoke(prompt, config) {
    // Send prompt to your agent
    const response = await sendToAgent(prompt);
    return {
      raw: response.text,
      artifacts: [{ path: response.path, content: response.content }],
      status: response.ok ? 'success' : 'failure',
    };
  },

  async parseResponse(raw) {
    // Parse your agent's output into structured format
    return {
      artifacts: [...],
      selfCheck: { acceptanceCriteriaMet: true, notes: '' },
    };
  },
};

externalCoordination.registerAdapter(myAdapter);
```

Then use it:

```typescript
await core.externalCoordination.invokeAgent(prompt.xml, {
  adapterId: 'my-agent',
});
```

## XML Prompt Format

spec-graph generates prompts in a layered XML format with three priority levels:

```xml
<?xml version="1.0"?>
<spec_graph_prompt version="1.0" session="..." stage="specify">

  <task level="MUST">
    Create the proposal document...
  </task>

  <acceptance_criteria level="MUST">
    - proposal.md contains Why / What Changes / Capabilities / Impact
    - Capabilities section lists at least 2 capabilities
    - All capability identifiers use kebab-case
  </acceptance_criteria>

  <project_constraint level="MUST">
    - language: TypeScript
    - framework: Express
  </project_constraint>

  <methodology level="SHOULD">
    <doc_methodology source="requirement-analysis">
      [OpenSpec-style instruction on how to write proposals]
    </doc_methodology>
  </methodology>

  <context level="MAY">
    <upstream>
      <artifact id="plan">...</artifact>
    </upstream>
    <project_profile>...</project_profile>
  </context>

  <output_spec level="MUST">
    Write to: .spec-graph/sessions/.../specify/proposal.md
    Template: knowledge/stages/specify/.../templates/proposal.md
  </output_spec>

  <self_check level="MUST">
    Before submitting, verify all acceptance criteria are met.
  </self_check>

</spec_graph_prompt>
```

### Priority Levels

| Level | Meaning | Agent Action |
|-------|---------|--------------|
| MUST | Must satisfy | Violation = gate failure |
| SHOULD | Should follow | Deviation requires note in self-check |
| MAY | Can reference | Optional context |

See `knowledge/shared/prompt-schema.md` for the full specification.

## Result Format

Agents should return structured results:

```typescript
interface AgentResult {
  artifacts: Array<{
    path: string;    // relative path where artifact was written
    content: string; // content of the artifact
  }>;
  selfCheck?: {
    acceptanceCriteriaMet: boolean;
    notes?: string;
  };
}
```

The `specify-output` file will be used as a fallback if no artifacts are provided.

## Session Persistence

All session state is persisted in `.spec-graph/sessions/<session-id>/`:

```
.spec-graph/
└── sessions/
    └── add-jwt-auth/
        ├── state.yaml       # Session state + trace log
        ├── specify/
        │   └── proposal.md  # Artifact
        └── design/
            ├── specs.md
            └── design.md
```

## Error Handling

When a gate fails, the agent receives a diagnosis via `spec-graph diagnose`:

```json
{
  "gateId": "proposal-structure",
  "failedCriteria": [
    {
      "id": "capabilities-enumerated",
      "reason": "No capabilities found. Expected at least 1.",
      "suggestedFix": "List your capabilities in the format: - `name`: desc or - **name**: desc"
    }
  ],
  "retryLevel": 1,
  "similarToPrevious": false
}
```

The automator's recovery module uses this diagnosis to generate a re-prompt.

## Timeout

Default timeout for agent invocation is 5 minutes. Override with:

```typescript
await invokeAgent(prompt, {
  adapterId: 'claude-code',
  timeoutMs: 300_000,
});
```
