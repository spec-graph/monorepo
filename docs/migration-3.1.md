# v3.0 → v3.1 Migration Guide

## Overview

v3.1 adds worktree isolation, meeting runtime, propose stage, LLM-based planning, and unified gate evaluation. The core dispatch + hook workflow is unchanged.

## Breaking Changes

### None

All v3.0 sessions are backward-compatible. Sessions starting at 'specify' continue from 'specify'. Sessions starting at 'propose' use the new 9-stage FSM.

## New Features

### 1. 9-Stage FSM (specify → specs → design → tasks → ... → integrate)

v3.0 sessions start at 'specify' and skip 'propose'. v3.1 sessions can optionally start at 'propose' for richer requirement framing.

### 2. Worktree Isolation

Parallel sub-agents (implement stage with multiple capabilities) now run in isolated git worktrees:

```bash
spec-graph worktree list              # List all worktrees
spec-graph worktree status <unit-id>  # Check status
spec-graph worktree verify <unit-id>  # Verify after sub-agent completes
spec-graph worktree merge <unit-id>   # Merge worktree branch → main
spec-graph worktree abandon <unit-id> # Abandon on conflict
```

The dispatch manifest automatically sets `action.isolation` for parallel actions.

### 3. Meeting Runtime

Meetings are now fully stateful with CLI support:

```bash
spec-graph meeting list                              # List all meetings
spec-graph meeting init <id> --purpose "..."          # Start meeting
spec-graph meeting record <id> --participant <id> ... # Record contribution
spec-graph meeting advance <id>                       # Next round
spec-graph meeting complete <id> --summary "..."      # Conclude
spec-graph meeting abandon <id>                       # Cancel
```

### 4. LLM-Based Planning

v3.1 planning supports true LLM intent decomposition via manifest:

```bash
spec-graph plan "Add JWT authentication"
# → Outputs planning manifest (intent + schema + examples)
# → Feed to LLM agent → get structured plan JSON back
# → Confirm plan via spec-graph confirm

spec-graph plan "..." --fallback
# → Uses keyword matching (v3.0 fallback)
```

### 5. Unified Gate Evaluation

gate-enforcement now merges knowledge/stages/*/gate.yaml with graph.yaml gate declarations. No duplicate gate configurations needed.

### 6. Hook System

The hook is now a CLI command:

```bash
spec-graph hook dispatch
# → Reads stdin (PostToolUse hook context)
# → Parses dispatch manifest
# → Outputs hookSpecificOutput with system-reminder
```

Configure in `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "command": "spec-graph hook dispatch"
    }]
  }
}
```

## New CLI Commands

| Command | Description |
|---------|-------------|
| `spec-graph worktree list` | List all worktree units |
| `spec-graph worktree status <id>` | Check worktree status |
| `spec-graph worktree verify <id>` | Verify worktree after agent |
| `spec-graph worktree merge <id>` | Merge worktree → main |
| `spec-graph worktree abandon <id>` | Abandon worktree |
| `spec-graph meeting list` | List all meetings |
| `spec-graph meeting init <id>` | Start new meeting |
| `spec-graph meeting record <id>` | Record contribution |
| `spec-graph meeting advance <id>` | Advance to next round |
| `spec-graph meeting complete <id>` | Complete meeting |
| `spec-graph meeting abandon <id>` | Cancel meeting |
| `spec-graph hook dispatch` | Process hook context |
| `spec-graph validate --knowledge` | Validate knowledge base |

## Removed

Nothing removed. All v3.0 commands continue to work.

## File Structure Changes

```
.spec-graph/
├── isolation/
│   └── worktrees.yaml    ← NEW: worktree state
├── meetings/
│   └── <meeting-id>.yaml ← NEW: meeting state
└── sessions/
    └── <id>/
        ├── state.yaml
        ├── propose/       ← NEW: propose stage artifacts
        └── specs/         ← NEW: specs stage artifacts
```
