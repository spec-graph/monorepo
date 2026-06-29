# Prompt Envelope Standard

> The standardized format for prompts sent to sub-agents via the coordinator's
> Agent tool. Every dispatch produces an envelope; every sub-agent receives one.

## Why standardized

The coordinator (Claude Code main agent, or any external runtime) constructs the
prompt sent to a sub-agent by combining:

1. The agent's system prompt (loaded from `agent_prompt_ref`)
2. The task-specific prompt (from `dispatch.actions[0].prompt`)
3. The contents of input artifacts (read from `input_artifacts[*].path`)
4. Constraints (file_scope, allowed tools)
5. The completion protocol (recommended_command + status-report requirement)

Without a standard envelope, every coordinator implementation has to invent
its own assembly. With one, the dispatch manifest's `prompt` field IS the
envelope — the coordinator only fills in placeholders.

## Envelope structure

The `action.prompt` field produced by `spec-graph dispatch` follows this layout:

````markdown
# Spec-Graph Sub-Agent Dispatch

## Identity

You are the **{agent_id}** agent for a spec-graph workflow.

- Role: {description}
- Model tier: {model_tier}
- Can execute actions: {actions}

## System Prompt

[COORDINATOR: load content from `{agent_prompt_ref}` and paste below this line]

--- BEGIN SYSTEM PROMPT ---
[paste system prompt content here]
--- END SYSTEM PROMPT ---

## Task Context

- Current stage: {current_stage}
- Target next stage: {next_stage}
- Blocking gate: {blocking_gate}
- Required action: {action.description}
- Action type: {action.type}
- Action id: {action.id}

## Input Artifacts

[COORDINATOR: read each artifact file and paste its content below the corresponding header]

### {artifact_id}

- Kind: {kind}
- Status: {status}
- Path: {path}

```markdown
[paste content of {path} here]
```
````

### {next_artifact_id}

...

## Meeting Orchestration (only if action.meeting is present)

...

## Constraints

- Read paths: {file_scope.read}
- Write paths: {file_scope.write}
- Allowed tools: {tools}

## Completion

After completing the work, run: `{recommended_command}`
Then end your response with a `status-report` block (see `agents/status-report-protocol.md`).

Coordinator loop: see `next_step` field in manifest, or consult `agents/coordinator-protocol.md`.

```

## Coordinator assembly steps

Given a dispatch manifest action, the coordinator:

1. **Copy `action.prompt` verbatim** as the base of the sub-agent prompt.
2. **Fill `--- BEGIN SYSTEM PROMPT ---` / `--- END SYSTEM PROMPT ---`**:
   - Read the file at `action.agent_prompt_ref` (relative to the pack that
     declared the agent — coordinator knows pack dir from `graph.meta.packs_used`).
   - Paste the file content between the markers.
   - If no `agent_prompt_ref`, leave the section empty (the Identity + Task
     Context alone is the prompt).
3. **Fill each `[paste content of {path} here]` placeholder**:
   - For each entry in `action.input_artifacts`, read the file at `path`.
   - Replace the placeholder with the file content.
4. **Pass the assembled prompt to the Agent tool**:
```

Agent({
description: "{action.id} stage",
model: "{action.model_tier}",
prompt: <assembled envelope>,
})

```

## What the envelope guarantees

- **Sub-agent identity is unambiguous**: the agent knows exactly which role
it's playing (from `## Identity`).
- **System prompt is loaded**: the agent's domain-specific instructions are
present (from `## System Prompt`).
- **Task is concrete**: what to do, in which stage, against what gates (from
`## Task Context`).
- **Inputs are available**: the agent can read prior artifacts without guessing
where they live (from `## Input Artifacts`).
- **Constraints are visible**: the agent knows its read/write boundaries (from
`## Constraints`).
- **Completion is contract-bound**: the agent knows what command to suggest
running next, and that it must end with a `status-report` block (from
`## Completion`).

## What the envelope does NOT do

- Does NOT call LLMs — assembly is pure string substitution.
- Does NOT enforce constraints — the coordinator still must configure the
sub-agent's allowed tools/paths per `file_scope`.
- Does NOT include meeting broadcast content — for meetings, each round's
participant prompt is assembled separately with prior contributions (see
`coordinator-protocol.md` § Dispatching a Meeting).

## Why placeholders (not pre-filled content)

spec-graph is a neutral engine — it does not read pack files or artifact files
at dispatch time. The dispatch manifest contains **references** (paths); the
coordinator resolves them. This keeps the kernel free of file I/O for prompt
assembly, and lets the coordinator decide caching/encoding/size limits.
```
