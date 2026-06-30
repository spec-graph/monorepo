---
name: spec-graph-sense
description: "Generate a profile skeleton (all dimensions = unknown). spec-graph does NOT scan files, collect signals, or analyze the project. All analysis is the AI agent's responsibility. The agent passes information via --stack, --build, and --profile-override to init, or edits profile.yaml directly. Use when the agent needs a profile skeleton to fill in manually, or as a reference for the sense command's current (minimal) behavior."
---

# spec-graph sense

Generate a profile skeleton. **Does not analyze the project.**

## Architecture Principle

**spec-graph does NOT scan files, collect signals, or infer dimensions.**

- spec-graph does not scan the repo
- spec-graph does not detect frameworks, languages, or build tools
- spec-graph does not classify dimensions via LLM
- spec-graph does not collect RepoSignals

**All analysis is the AI agent's responsibility.** The agent:
1. Reads project files itself (or spawns sub-agents)
2. Analyzes tech stack, structure, dimensions
3. Passes results to `spec-graph init --stack X --build Y --profile-override "..."` (or edits profile.yaml directly)

## What `sense` Actually Does

`sense` is a minimal / empty-shell command. It generates a `profile.yaml` with **all 9 dimensions set to `unknown`** (confidence: low, source: fallback). It does not read any project files.

The generated profile skeleton looks like:

```yaml
version: "1"
meta:
  created_at: "2026-06-30T..."
  source:
    repo_scan: false
    llm_classified: false
facts:
  has_ui:
    value: unknown
    confidence: low
    source: fallback
    evidence: "Not analyzed by spec-graph -- AI agent should provide via --stack / --build / --profile-override"
  boundary:
    value: unknown
    confidence: low
    source: fallback
  # ... all 9 dimensions = unknown
```

## Current Status

`sense` is currently an empty-shell command. It exists in the CLI but produces no meaningful analysis.

**Note**: This command may be removed or redesigned in a future version. Agents should prefer using `spec-graph init` (which writes the profile skeleton directly) or editing `profile.yaml` manually rather than calling `sense` separately.

## How Agents Should Provide Project Information

Since spec-graph does not analyze the project, agents provide information through these channels:

### Channel 1: During `init`

```bash
spec-graph init \
  --stack typescript \
  --build spa,api \
  --description "E-commerce platform" \
  --profile-override "has_ui=web,boundary=published-api,field=brownfield"
```

`init` writes the profile skeleton AND applies `--profile-override` values. This is the recommended path.

### Channel 2: Direct profile.yaml editing

After init, the agent can read and edit `.spec-graph/profile.yaml` directly to fill in dimension values:

```yaml
facts:
  has_ui:
    value: web
    confidence: high
    source: agent
    evidence: "React SPA with component library"
  boundary:
    value: published-api
    confidence: high
    source: agent
    evidence: "Express API with OpenAPI spec"
```

### Channel 3: `spec-graph profile` command

```bash
spec-graph profile set has_ui web --confidence high --source agent
```

## Dimensions Reference

The 9 profile dimensions (for agent reference when filling values):

| Dimension | Example Values |
|-----------|---------------|
| `has_ui` | `none`, `cli`, `gui`, `web`, `native` |
| `boundary` | `internal`, `published-api`, `published-lib` |
| `topology` | `mono`, `federated` |
| `deployment` | `process`, `package`, `binary`, `firmware`, `hosted-service` |
| `consumers` | `self`, `internal-team`, `external-public` |
| `field` | `greenfield`, `brownfield` |
| `criticality` | `prototype`, `standard`, `compliance` |
| `team` | `solo`, `small`, `multi` |
| `persistence` | `none`, `embedded-store`, `database` |

## Usage

```bash
# Generate profile skeleton (writes to stdout or file)
spec-graph sense

# Write to specific output
spec-graph sense --output .spec-graph/profile.yaml

# With description (stored in profile for agent reference)
spec-graph sense --description "My project description"
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path |
| `--description <text>` | Project description (stored in profile.meta.description) |

### Removed Options

These options no longer exist:
- `--llm-classify` -- removed. spec-graph does not perform LLM classification.
- `--show-signals` -- removed. spec-graph does not collect signals.
- `--build` -- removed from sense. Pass `--build` to `init` instead.
- `--profile-override` -- removed from sense. Pass `--profile-override` to `init` instead.

## Execution Rules

### When to Use

- **Rarely needed.** `init` already writes the profile skeleton. Only use `sense` if you need to regenerate the skeleton without re-running init.

### When NOT to Use

- **For project analysis.** sense does not analyze. The agent must do analysis itself.
- **As a replacement for init.** init writes profile + composes graph + primes state. sense only writes a skeleton profile.
- **To fill dimensions.** Use `spec-graph profile set` or edit profile.yaml directly.

## 衔接关系

- **前置**: 不需要 (sense 独立运行,甚至不需要 .spec-graph/)
- **替代方案**: `spec-graph init` (推荐,同时做 profile + compose + prime)
- **profile 填写**: agent 直接编辑 `.spec-graph/profile.yaml` 或用 `spec-graph profile set`
- **后续**: `spec-graph compose` (需要 .spec-graph/ 已存在)
