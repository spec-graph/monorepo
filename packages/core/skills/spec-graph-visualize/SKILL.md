---
name: spec-graph-visualize
description: "Generate workflow graph visualization in DOT (Graphviz), Mermaid, or JSON format. Use for visual overview or embedding in docs."
---

# spec-graph visualize

Generate workflow graph visualization.

## Usage

```bash
# Graphviz DOT (default) — render with dot -Tpng
npx spec-graph visualize --output graph.dot

# Mermaid — paste into GitHub/GitLab/Notion for inline rendering
npx spec-graph visualize --format mermaid --output graph.mmd

# Mermaid to stdout
npx spec-graph visualize --format mermaid

# JSON summary (programmatic)
npx spec-graph visualize --format json
```

### Options

- `--format <type>` — Output format: `dot` (default), `mermaid`, `json`
- `-o, --output <file>` — Write output to file

## DOT format

Render with Graphviz:

```bash
npx spec-graph visualize --output graph.dot
dot -Tpng graph.dot -o workflow.png
```

Includes:
- Pipeline stages as colored nodes
- Artifacts grouped by kind with colored clusters
- Trace edges as dashed arrows
- Gates as bold red arrows

## Mermaid format

Paste directly into:
- GitHub markdown (```mermaid blocks)
- GitLab wiki
- Notion pages
- Mermaid Live Editor (mermaid.live)

Includes:
- Pipeline flowchart (LR direction)
- Artifacts with kind-based styling
- Trace edges (dashed arrows)
- Gates (thick arrows with labels)

## JSON summary

```bash
npx spec-graph visualize --format json
```

Returns:
```json
{
  "stages": ["specify", "design", "plan", "implement", "review", "accept"],
  "artifact_count": 15,
  "artifact_kinds": ["requirement", "design", "plan", "contract"],
  "check_count": 8,
  "gate_count": 7,
  "agent_count": 6,
  "track_count": 3
}
```
