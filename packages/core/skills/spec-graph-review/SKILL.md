---
name: spec-graph-review
description: "Generate multi-model review prompts for an artifact. Supports Claude, Codex, Gemini with model-specific prompts. Use for dual-voice review or multi-model consensus."
---

# spec-graph review

Generate multi-model review prompts for an artifact.

## What this does

Creates structured review requests for multiple AI models to independently review the same artifact. Each model gets a tailored system prompt and the artifact content, enabling:

- **Dual-voice review** (Claude + Codex) — two perspectives catch different issues
- **Multi-model consensus** — agreement across models increases confidence
- **Model-specific focus** — each model's prompt emphasizes its strengths
- **Distilled context** — optionally compress artifact to save tokens

## Usage

```bash
# Default: Claude + Codex review
npx spec-graph review --artifact plan/tasks

# Custom models
npx spec-graph review --artifact design/arch --models "claude,codex,gemini"

# Focus on specific areas
npx spec-graph review --artifact plan/tasks --focus "security,performance"

# Save review files to .spec-graph/reviews/
npx spec-graph review --artifact plan/tasks --save

# Include full artifact (default: distilled)
npx spec-graph review --artifact plan/tasks --full

# JSON output
npx spec-graph review --artifact plan/tasks --json
```

### Options

- `--artifact <id>` — Artifact ID to review (required)
- `--models <list>` — Comma-separated model names (default: `claude,codex`)
- `--focus <areas>` — Comma-separated focus areas
- `--full` — Include full artifact content (default: distilled)
- `--save` — Save review prompts to `.spec-graph/reviews/`
- `--json` — Output as JSON

## Supported models

| Model | Focus |
|-------|-------|
| `claude` | Correctness, completeness, consistency, clarity, risks |
| `codex` | Technical precision, feasibility, edge cases, dependencies |
| `gemini` | Holistic quality, integration, maintenance, documentation |
| custom | Generic review prompt |

## Workflow

1. Generate review prompts: `spec-graph review --artifact plan/tasks --save`
2. Send each generated file to the corresponding model
3. Collect responses and compare findings
4. Resolve conflicts and update artifact if needed
5. Re-run gate checks to verify

## Output

Terminal output shows prompts inline for each model. Use `--save` to write files to `.spec-graph/reviews/<artifact>-<model>-review.md`.
