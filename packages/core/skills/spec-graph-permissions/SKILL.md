---
name: spec-graph-permissions
description: "Manage automation permissions for AI agents. Configure what spec-graph run can auto-execute, set per-role tool/file permissions, and sync agent configs. Use when setting up or adjusting agent automation."
---

# spec-graph permissions

Manage automation permissions for AI agents.

## What this does

Two-level permission model:

1. **Project-level** — what `spec-graph run` can auto-execute
2. **Sub-agent-level** — per-role tool + file permissions for AI agents

## Permission levels

| Level       | Auto-execute         | Agent tools                          |
| ----------- | -------------------- | ------------------------------------ |
| `full-auto` | Everything           | All tools allowed                    |
| `semi-auto` | Checks + transitions | Read/Write/Edit/Bash (safe commands) |
| `manual`    | Nothing              | Read-only                            |

## Usage

```bash
# Show current permissions
npx spec-graph permissions show

# Set permission level
npx spec-graph permissions set --level full-auto

# List configured agents
npx spec-graph permissions list-agents

# Sync agent configs (write .claude/settings.json, .opencode.json)
npx spec-graph permissions sync --force
```

### Options

- `--level <level>` — Set permission level: full-auto, semi-auto, manual
- `--force` — Overwrite existing agent config files
- `--json` — Output as JSON

## Agent roles

| Role                    | Purpose                 | Actions                                  |
| ----------------------- | ----------------------- | ---------------------------------------- |
| `spec-author`           | Produces spec artifacts | produce_artifact                         |
| `quality-runner`        | Runs checks             | run_check                                |
| `traceability-reviewer` | Verifies trace links    | verify_trace                             |
| `governance-reviewer`   | Resolves violations     | resolve_violation                        |
| `workflow-operator`     | Advances transitions    | transition                               |
| `stage-agent`           | Full stage work         | perform_stage + all artifact/check/trace |

## Agent configs

The `sync` command writes:

- `.claude/settings.json` — Claude Code permissions (allow/deny/ask)
- `.opencode.json` — OpenCode permissions

Configs map spec-graph permissions to IDE-specific permission formats.
