---
name: spec-graph-doctor
description: "Diagnose project health and configuration. Checks .spec-graph/ directory, profile, graph, machine state, permissions, traces, and enhanced features (dispatch, impact, retro, rollback, etc.). Use when something is not working or for routine health checks."
---

# spec-graph doctor

Diagnose project health and configuration issues.

## What this does

Runs a comprehensive health check across all subsystems:

### Project Initialization

- `.spec-graph/` directory exists
- `profile.yaml` is valid and has all dimensions
- `permissions.yaml` exists and is valid

### Graph Composition

- `graph.yaml` exists and is valid
- Has artifacts, checks, and gates declared
- Gates have valid transitions

### Machine State

- `machine-state.yaml` exists
- Current stage is valid
- Artifact/check statuses are consistent

### Permissions

- Permission level is set
- Agent configs are synced

### Trace Files

- Trace skeleton files exist for gate-required queries
- Trace links are valid

### Enhanced Features

- Context distiller readiness
- Atomic merge guard status
- Impact analysis coverage
- Retrospective entries
- Rollback safety-net snapshots
- Dispatch manifest validity

## Usage

```bash
npx spec-graph doctor
```

### Options

- `--json` — Output as JSON
- `--fix` — Auto-fix recoverable issues (e.g., creates missing `machine-state.yaml`)

## When to use

- **First command** when joining an existing spec-graph project
- When `spec-graph run` fails unexpectedly
- After merging changes that may have broken the config
- As a CI/CD health gate
