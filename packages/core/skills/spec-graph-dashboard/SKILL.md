---
name: spec-graph-dashboard
description: "Show rich workflow dashboard with pipeline progress, artifact/check status, gate evaluation, trace coverage, and active change. Supports terminal, HTML, and JSON output. Use for visual overview of project state."
---

# spec-graph dashboard

Show rich workflow dashboard with pipeline progress, artifacts, gates, and traces.

## What this does

Generates a comprehensive visual overview of the workflow state:

- **Pipeline progress** — stage bar showing current position
- **Stats summary** — artifact/check/gate/trace completion with progress bars
- **Artifact grid** — all artifacts grouped by kind with status icons
- **Gate evaluation** — passed/blocked gates with missing items listed
- **Active change** — current change title, type, priority
- **Constitution** — version and principle count

Three output formats:
- **Terminal** (default) — box-drawing characters, colored progress bars
- **HTML** — dark-themed interactive dashboard file
- **JSON** — programmatic data structure

## Usage

```bash
# Terminal dashboard (default)
npx spec-graph dashboard

# Generate HTML file
npx spec-graph dashboard --html

# HTML with custom output path
npx spec-graph dashboard --html -o reports/dashboard.html

# JSON output
npx spec-graph dashboard --json
```

### Options

- `--html` — Generate HTML dashboard file
- `--json` — Output as JSON
- `-o, --output <file>` — Output file path for HTML (default: `.spec-graph/dashboard.html`)

## Terminal output example

```
  ╔══════════════════════════════════════════════════════╗
  ║  spec-graph Dashboard — my-project                   ║
  ╚══════════════════════════════════════════════════════╝

  ▸ Pipeline: implement
  ■ → ■ → ■ → ◆ → □ → □
  specify    design     plan       implement  review     accept

  ▸ Progress:
    Artifacts  8/15 (53%)  [██████████░░░░░░░░░░] 53%
    Checks     5/8 (63%)   [████████████░░░░░░░░] 63%
    Gates      4/7 (57%)   [███████████░░░░░░░░░] 57%
    Traces     12/20 (60%) [████████████░░░░░░░░] 60%
```

## When to use

- At the start of each work session to see project state
- Before dispatch to understand what's blocked
- As a CI/CD status report
- Share HTML output with team for visual review
