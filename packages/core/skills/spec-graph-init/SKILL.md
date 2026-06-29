---
name: spec-graph-init
description: "Initialize a new spec-graph project. Creates .spec-graph/ directory, generates profile via Sense, and sets up permissions. Use when starting a new project or re-initializing an existing one."
---

# spec-graph init

Initialize a new spec-graph project in the current directory.

## What this does

1. Creates the `.spec-graph/` directory structure
2. Runs **Sense** — scans the repo and generates `profile.yaml` with 9 engineering dimensions
3. Generates default `permissions.yaml` for AI agent automation control
4. Optionally syncs agent configs (`.claude/settings.json`, `.opencode.json`)

## Usage

Run in the terminal:

```bash
npx spec-graph init
```

### Options

- `--force` — Overwrite existing `.spec-graph/` configuration
- `--description <text>` — Project description for context
- `--permission-level <level>` — Automation level: `full-auto`, `semi-auto` (default), `manual`
- `--sync-agent-config` — Also overwrite `.claude/settings.json` and `.opencode.json`
- `--quick` — Full bootstrap: init + compose + prime in one shot

### Quick Bootstrap

For new projects, use `--quick` to get started immediately:

```bash
npx spec-graph init --quick
```

This runs `init` → `compose` → `prime` in sequence.

## After init

1. **Review `.spec-graph/profile.yaml`** — verify the 9 profile dimensions match your project
2. **Override any incorrect facts** — edit the profile or use `spec-graph sense --show-signals` to debug
3. **Run `spec-graph compose`** to generate the workflow graph
4. **Run `spec-graph prime`** to seed the machine state

## Permission levels

| Level       | What `spec-graph run` auto-executes                   |
| ----------- | ----------------------------------------------------- |
| `full-auto` | Everything — checks, transitions, artifact completion |
| `semi-auto` | Checks + gated transitions (default)                  |
| `manual`    | Nothing — everything requires agent dispatch          |
