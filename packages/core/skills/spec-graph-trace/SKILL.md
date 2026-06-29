---
name: spec-graph-trace
description: "Trace requirements to implementation and manage trace edges. Supports add, forward/backward trace, and cardinality queries. Use when checking traceability or adding new trace links."
---

# spec-graph trace

Trace requirements to implementation through the traceability graph.

## What this does

Builds a traceability index from:

- **Graph declarations** — artifacts with producer/consumer relationships
- **Gate requirements** — trace queries declared in gates
- **Trace files** — `.spec-graph/traces/*.yaml` linking requirements to implementations

Supports both **forward** (requirement → implementation) and **backward** (implementation → requirement) tracing.

## Usage

```bash
# List all traceable nodes
npx spec-graph trace

# Trace backward from a node (what does this depend on?)
npx spec-graph trace <node-id> --direction backward

# Trace forward from a node (what does this enable?)
npx spec-graph trace <node-id> --direction forward

# Filter by node type
npx spec-graph trace --type requirement

# Add a new trace edge
npx spec-graph trace add --from <artifact-id> --to <artifact-id> --via <relation>
```

### Options

- `--direction <direction>` — `backward` (default) or `forward`
- `--type <type>` — Filter by node type: requirement, artifact, check, gate, track

### trace add options

- `--from <id>` — Source artifact ID
- `--to <id>` — Target artifact ID
- `--via <relation>` — Relation type: derives, refines, implements, verifies, depends-on
- `--json` — Output as JSON

## Trace file format

Trace files in `.spec-graph/traces/` declare links:

```yaml
traces:
  - from: plan/story
    from_kind: plan
    to: requirement/prd
    to_kind: requirement
    relation: derives
```

## Trace query cardinality

Gates declare trace queries with cardinality:

- `exists` — at least one trace path must exist
- `single` — exactly one trace path must exist
- `every` — every source node must trace to a target
