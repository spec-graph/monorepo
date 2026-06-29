---
name: spec-graph-sense
description: "Analyze the project repo and generate a profile. Scans 40+ signals across 22 dimensions (frameworks, languages, test tools, build tools, CI, monorepo structure, etc.) and produces a codebase summary. Use when setting up a new project or when project structure changes."
---

# spec-graph sense

Analyze the project repository and generate `profile.yaml`.

## What this does

The **Sense engine** scans the project directory for 40+ signals:

- Package managers, frameworks (React/Vue/Next.js/Nuxt/Express), build tools (Vite/Webpack/Turbopack)
- Language detection (TypeScript, JavaScript, Python, Rust, Go)
- Test frameworks (Jest, Vitest, Mocha, Cypress, Playwright)
- Monorepo tools (Lerna, Nx, Turborepo), directory structure (components/, pages/, app/, lib/, api/)
- Linting/formatting (ESLint, Prettier)
- API schemas (OpenAPI, GraphQL, gRPC)
- Embedded configs (PlatformIO, Arduino)
- Deployment configs (Docker, K8s)
- Existing spec-graph configuration detection

It maps these signals to **22 profile dimensions** (9 core + 13 enhanced):

| Dimension | Example values |
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
| `frameworkVersions` | Detected framework versions |
| `hasTypeScript` | TypeScript presence |
| `hasVitest` / `hasJest` / `hasCypress` / `hasPlaywright` | Test tool detection |
| `isMonorepo` / `hasNx` / `hasTurborepo` | Monorepo structure |
| `hasComponentsDir` / `hasPagesDir` / `hasAppDir` | Directory structure |
| `buildTool` | Vite, Webpack, Turbopack, etc. |

## Usage

```bash
npx spec-graph sense
```

### Options

- `-o, --output <file>` — Output file path (default: `.spec-graph/profile.yaml`)
- `--show-signals` — Show raw repo scan signals (40+ fields)
- `--json` — Output profile as JSON (includes codebase_summary)

### Codebase summary

The `--json` output includes a `codebase_summary` field — a human-readable analysis of the repo derived from all detected signals. This summary is injected into dispatch manifests for AI agent context.

## After sense

1. **Review the profile** — open `.spec-graph/profile.yaml` and verify each dimension
2. **Fix incorrect facts** — edit values or add `overrides:` entries
3. **Freeze the profile** — set `meta.source.reviewed_at` to mark it reviewed
4. **Run `spec-graph compose`** to generate the workflow graph

## Important

- Repo-detected facts (`source: repo`) are **high confidence** — hard evidence from file scanning
- LLM-classified facts (`source: llm`) are **low confidence** — should be reviewed
- User overrides (`source: user/override`) always win over repo/LLM detection
- **LLM cannot downgrade hard evidence** — if repo has `package.json` + `exports`, boundary is forced to `published-lib` minimum
