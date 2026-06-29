---
name: spec-graph-distill
description: "Compress an artifact document into a minimal summary for context injection. Preserves headings, bullets, key sentences, and code blocks. Reduces token usage when injecting large artifacts into dispatch manifests."
---

# spec-graph distill

Compress an artifact document into a minimal summary for context injection.

## What this does

Reads an artifact from `.spec-graph/artifacts/<kind>/` and produces a compressed summary that:

- Preserves headings (##, ###)
- Preserves bullet points and numbered lists
- Preserves code blocks
- Keeps key sentences (containing "must", "required", "critical", "warning", "decision", etc.)
- Removes normal paragraph text
- Respects max length limit

Use this to:
- Reduce token usage when injecting context into dispatch manifests
- Create minimal summaries for AI agent context
- Audit what information is essential in an artifact

## Usage

```bash
# Distill and print to terminal
npx spec-graph distill --artifact plan/tasks

# Distill and save to .spec-graph/distilled/
npx spec-graph distill --artifact plan/tasks --save

# Limit output to 500 characters
npx spec-graph distill --artifact plan/tasks --max-length 500

# JSON output with compression stats
npx spec-graph distill --artifact plan/tasks --json
```

### Options

- `--artifact <id>` — Artifact ID to distill (required)
- `--save` — Save distilled output to `.spec-graph/distilled/<artifact-id>.md`
- `--max-length <chars>` — Maximum output length (default: 2000)
- `--json` — Output as JSON with compression stats

## Output

Terminal output shows:
```
Source: .spec-graph/artifacts/plan/plan-tasks.md
Original: 8432 chars → Compressed: 1247 chars (85% reduction)

## Dependencies
- Requires: design/arch, requirement/prd
- External: auth-service API

## Key Decisions
- Decision: Use existing auth middleware
- Critical: Must handle token refresh

...
```

JSON output includes:
```json
{
  "original_length": 8432,
  "compressed_length": 1247,
  "compression_ratio": 85,
  "output": "...",
  "source": ".spec-graph/artifacts/plan/plan-tasks.md"
}
```

## Integration with dispatch

The dispatch manifest can use distilled artifacts to reduce token usage. Run:

```bash
npx spec-graph distill --artifact plan/tasks --save
```

Then the distilled version at `.spec-graph/distilled/plan-tasks.md` can be injected into agent prompts instead of the full artifact.
