---
name: spec-graph-dispatch
description: "Generate an agent dispatch manifest for the next workflow action. Creates a manifest with 17+ fields including distilled context, constitution principles, codebase summary, and active change. Use when handing off work to an AI agent."
---

# spec-graph dispatch

Generate an agent dispatch manifest for the next workflow action.

## What this does

Creates a structured manifest that AI agents (Claude Code, Codex) can consume. The manifest is computed from the next plan, enriched with trace-graph context and governance data.

### Manifest fields (17+)

| Field | Description |
|-------|-------------|
| `actions` | Work actions with agent_id, prompt, file_scope, model_tier |
| `done` | Whether the workflow is complete |
| `gate_passed` | Whether the current gate is satisfied |
| `distilled_context` | Minimal relevant artifacts from reverse-BFS on trace graph |
| `constitution_principles` | Active constitution principles for governance |
| `active_change` | Current change descriptor (title, type, priority, scope) |
| `codebase_summary` | Human-readable repo analysis summary |
| `agent_prompt_ref` | Path to agent system prompt |
| `document_guidance` | Pack-level document guidance |
| `next_step` | Post-action instruction (complete artifact, run check, transition) |

## Usage

```bash
# Show dispatch for next action
npx spec-graph dispatch

# Include all currently suggested actions
npx spec-graph dispatch --all

# Write to a file
npx spec-graph dispatch -o manifest.yaml

# JSON output (for hook injection)
npx spec-graph dispatch --json
```

### Options

- `--all` — Include all currently suggested actions
- `-o, --output <file>` — Write manifest YAML to a file
- `--json` — Output as JSON

## Agent roles

| Role | Actions |
|------|---------|
| `spec-author` | Produce artifacts (PRDs, designs, etc.) |
| `quality-runner` | Run checks (lint, test, typecheck) |
| `traceability-reviewer` | Verify trace links |
| `governance-reviewer` | Resolve forbidden violations |
| `workflow-operator` | Execute gated transitions |
| `stage-agent` | Full stage work (produce + check + verify) |

## Integration

After dispatch, the AI agent:

1. Reads the manifest
2. Performs the assigned work
3. Updates machine state via `spec-graph machine update`
4. Runs `spec-graph next` to check progress

When `meeting` is present in the action, use the meeting protocol (`packs/foundation.pack/agents/meeting-protocol.md`) for multi-agent discussion.
