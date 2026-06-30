---
name: spec-graph-init
description: "Initialize a new spec-graph project. Creates .spec-graph/ directory, generates profile, and sets up permissions. AI agent is responsible for analyzing the project and providing required parameters (stack, build, description). Use when starting a new project or re-initializing an existing one."
---

# spec-graph init

Initialize a new spec-graph project in the current directory.

## Architecture Principle

**spec-graph does NOT analyze your project.** It is a pure execution engine.

- ❌ spec-graph does not scan files
- ❌ spec-graph does not detect tech stack
- ❌ spec-graph does not read README
- ✅ spec-graph only receives parameters and writes config

**The AI agent is responsible for all analysis.** The agent reads files, determines tech stack, and passes parameters to spec-graph.

## Required Parameters

| Parameter | Required | Source |
|-----------|----------|--------|
| `--stack <name>` | ✅ Required | Agent analyzes project |
| `--build <list>` | ⚠️ Recommended | Agent analyzes project |
| `--description <text>` | ⚠️ Recommended | Agent asks user or summarizes |

### Supported Stacks

`typescript`, `javascript`, `python`, `go`, `rust`, `java`, `java-gradle`, `kotlin`, `cpp-cmake`, `cpp-make`, `dotnet`, `ruby`, `php`, `swift`, `generic`

## Agent Workflow: Missing Parameters Protocol

When `spec-graph init` is called without required parameters, spec-graph returns an error. The AI agent must then follow this protocol to collect missing information.

### Step 1: Analyze the project

The agent reads project files to determine parameters:

```
Read these files (if they exist):
  - package.json     → JavaScript/TypeScript project
  - pyproject.toml   → Python project
  - Cargo.toml       → Rust project
  - go.mod           → Go project
  - pom.xml          → Java/Maven project
  - build.gradle     → Java/Gradle or Kotlin project
  - CMakeLists.txt   → C/C++ project
  - Makefile         → C/C++ or generic
  - *.csproj         → .NET project
  - Gemfile          → Ruby project
  - composer.json    → PHP project
  - Package.swift    → Swift project
  - README.md        → Project description source
```

### Step 2: Present options to user

After analysis, show the user what was detected and let them choose:

```
I analyzed your project. Here's what I found:

  Detected tech stack: TypeScript (tsconfig.json + React + Vite)
  Build targets: spa + api (React frontend + Express backend)
  Description: (not found in README)

How would you like to proceed?

  ❯ 1. Use detected configuration (recommended)
    2. Modify tech stack
    3. Modify build targets
    4. Enter description manually
    5. I'll analyze and summarize the project for description
```

### Step 3: Handle missing description

If description is missing, offer these options to the user:

```
Project description is missing. Choose how to provide it:

  ❯ 1. I'll type it now
    2. Analyze project and summarize (I'll read README/package.json)
    3. Skip (not recommended — agents work better with descriptions)
```

**Option 2 (Agent summarizes):**
1. Read README.md, package.json#description, or other docs
2. Synthesize a 1-2 sentence description
3. Show user for confirmation: "I summarize as: '<description>'. Correct? (Y/n)"
4. Only proceed after user confirms

### Step 4: Verify parameters are complete

Before calling `spec-graph init`, verify:

- [ ] `--stack` is provided and is a valid value
- [ ] `--build` matches the stack (e.g., don't pair `typescript` with `embedded`)
- [ ] `--description` is provided (or user explicitly chose to skip)

### Step 5: Execute

```bash
spec-graph init --stack <stack> --build <targets> --description "<text>"
```

## Usage Examples

### Agent-driven (recommended)

```bash
# Agent analyzed project, user confirmed
spec-graph init \
  --stack typescript \
  --build spa,api \
  --description "E-commerce platform with payment integration"
```

### With all options

```bash
spec-graph init \
  --stack python \
  --build api \
  --description "ML model serving API" \
  --permission-level semi-auto \
  --sync-agent-config \
  --quick
```

### Quick bootstrap

`--quick` runs `init` → `compose` → `prime` in sequence:

```bash
spec-graph init --stack typescript --build spa --quick
```

## Options Reference

| Option | Description |
|--------|-------------|
| `--stack <name>` | Tech stack (required) |
| `--build <list>` | Build targets: spa, api, lib, cli, embedded (comma-separated) |
| `--description <text>` | Project description |
| `--permission-level <level>` | Automation level: `full-auto`, `semi-auto` (default), `manual` |
| `--sync-agent-config` | Overwrite `.claude/settings.json` and `.opencode.json` |
| `--quick` | Full bootstrap: init + compose + prime |
| `--force` | Overwrite existing `.spec-graph/` configuration |

## What spec-graph creates

```
.spec-graph/
├── profile.yaml       # All dimensions = unknown (agent fills via overrides)
├── permissions.yaml   # Automation level config
├── commands.yaml      # Stack-specific commands (test/lint/build)
├── changes/           # Change descriptors
├── artifacts/         # Generated documents
└── traces/            # Traceability data
```

## Initialization Scenarios

spec-graph init handles several distinct scenarios. The agent must identify which scenario applies and follow the corresponding flow.

### Scenario 1: Greenfield Project (empty directory)

**Situation**: User just created a new empty directory, no code yet.

**Agent flow**:
```
1. Detect: directory is empty (no package.json, no source files)
2. Ask user:
   "This is a new project. What tech stack do you want to use?"
   - Present recommended options: TypeScript, Python, Go, Rust
   - User picks one
3. Ask user:
   "What does this project do?" (description)
4. Ask user:
   "Build targets?" (spa / api / lib / cli / embedded)
5. Execute: spec-graph init --stack X --build Y --description Z
```

**Key**: Agent cannot analyze files (none exist), so it must ask the user directly.

---

### Scenario 2: Existing Project, Full Info Available

**Situation**: Project has README.md, package.json with description, clear tech stack.

**Agent flow**:
```
1. Detect: read package.json → stack detected
2. Read package.json#description or README.md first paragraph
3. Show user:
   "I found:
      - Stack: TypeScript (detected from package.json)
      - Description: '...' (from README)
      - Build: spa (React detected)
    Confirm? (Y/n)"
4. User confirms → execute
```

**Key**: Agent extracts everything, user just confirms.

---

### Scenario 3: Existing Project, Partial Info

**Situation**: Tech stack detectable, but no README or description.

**Agent flow**:
```
1. Detect stack from manifest files
2. Description missing → offer options:
   "I detected TypeScript. But no description found.
    How to get description?
      ❯ 1. I'll type it
        2. Analyze source code and summarize
        3. Skip"
3. If option 2: read source files, summarize, show user for confirmation
4. Execute
```

**Key**: Agent fills gaps by analyzing code or asking user.

---

### Scenario 4: Monorepo (multiple packages)

**Situation**: Directory has `packages/` or `apps/` subdirectories, each with different stacks.

**Agent flow**:
```
1. Detect: scan subdirectories
2. Ask user:
   "This is a monorepo with:
      - packages/frontend (TypeScript + React)
      - packages/backend (Python + FastAPI)
      - packages/shared (TypeScript library)
    Which package to initialize spec-graph for?
      ❯ 1. All packages (workspace setup)
        2. Just one (select)
        3. Root level (govern all)"
3. Based on choice, determine primary stack or use 'generic'
4. Execute
```

**Key**: Monorepo needs user decision on scope.

---

### Scenario 5: Brownfield with Unclear Stack

**Situation**: Old project, mixed languages, unclear primary stack.

**Agent flow**:
```
1. Detect: multiple manifests exist (e.g., setup.py + package.json)
2. Open sub-agents to analyze:
   - Sub-agent A: analyze Python portion
   - Sub-agent B: analyze JS portion
3. Synthesize: "Primary stack appears to be Python (more code), 
                 with JS tooling (build scripts)"
4. Ask user:
   "I'm unsure. Detected both Python and JavaScript.
    Which is primary?
      ❯ 1. Python (recommended, 80% of code)
        2. JavaScript
        3. Mixed — use 'generic'"
5. Execute
```

**Key**: Complex projects may need sub-agent analysis + user input.

---

### Scenario 6: Re-initialization (already has .spec-graph/)

**Situation**: Project already initialized, user wants to re-run.

**Agent flow**:
```
1. Detect: .spec-graph/ exists
2. Ask user:
   "Project already initialized. What do you want?
      ❯ 1. Overwrite (need --force)
        2. Update specific config
        3. Cancel"
3. If overwrite: spec-graph init --force --stack X ...
```

**Key**: Don't silently overwrite; confirm with user.

---

### Scenario 7: CI/CD Environment (non-interactive)

**Situation**: Running in GitHub Actions, no user to ask.

**Agent flow**:
```
1. Detect: CI=true env var, no TTY
2. No user interaction possible
3. Require all params from config file or env vars:
   spec-graph init --config .spec-graph-init.yaml
4. If params missing → fail with clear error
```

**Key**: CI requires pre-configured params, no prompts.

## Common Patterns Across Scenarios

1. **Always analyze first** — read files before asking user (reduces friction)
2. **Confirm before executing** — show detected config, let user verify
3. **Offer skip for optional params** — don't block on description if user wants to skip
4. **Use sub-agents for complex analysis** — large/brownfield projects may need parallel investigation
5. **Never invent parameters** — if unsure, ask; don't guess stack or description
