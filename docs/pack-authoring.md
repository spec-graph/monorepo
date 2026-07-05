# Pack Authoring Guide

This guide explains how to create, modify, or extend packs in spec-graph.

## Overview

Packs are composable configuration units that provide artifacts, checks, gates, agents, agent bindings, meetings, and skills for each stage. They live in `packs/` and are merged by `compose` into `.spec-graph/graph.yaml`.

```
packs/
├── foundation.pack/               # Always loaded — core stages + agents
│   ├── pack.yaml                  # Top-level provides declarations
│   ├── agents/                    # Agent prompt files
│   ├── shared/                    # Shared documents
│   └── stages/                    # Per-stage gate.yaml + skills/
│       └── <stage>/
│           ├── gate.yaml          # Entry/exit criteria
│           └── skills/
│               └── <skill>/
│                   ├── instruction.md   # Methodology guidance
│                   └── templates/
│                       └── *.md         # Format templates
├── requirement-analysis.pack/     # Domain-specific planning pack
├── architecture.pack/             # Architecture design pack
├── ddd.pack/                      # DDD pack (conditional)
└── ... (17 packs total)
```

## pack.yaml Structure

```yaml
name: foundation
version: "1"
kind: domain
priority: 0                         # Lower = merged first; higher overrides
description: Core stages, agents, and skills

applies_when: always                # "always" | { dimension: true/false/string/$exists }
# applies_when_change:              # Optional: filter by change type
#   type: [feature, bugfix]

provides:
  artifacts:                        # Artifact declarations
    - id: verification/review-report
      kind: verification
      schema_ref: templates/review-report.json

  actions:                          # Action names (mapped to agent bindings)
    - specify
    - design
    - implement
    - review

  checks:                           # Validation commands
    - id: lint
      kind: lint
      command: "npm run lint"
      layer: unit
      touchfiles: ["src/**/*.ts"]

  gates:                            # Transition gates
    - id: entry-implement
      on_transition: [tasks, implement]
      require_artifacts: [design/design.md, tasks/tasks.md]
      require_checks: [lint, typecheck]
      fail_mode: block
      enabled: true

  gate_patches:                     # Modify existing gates from other packs
    entry-implement:
      add_checks: [security-scan]

  agents:                           # Agent declarations
    - id: developer
      description: Software Developer
      prompt_ref: agents/developer-agent.md
      model_tier: standard
      input_artifact_kinds: [design/*, plan/*]
      output_artifact_kinds: [implementation/*]
      actions: [implement, plan]

  agent_bindings:                   # Maps action → agent
    design: architect
    implement: developer

  meetings:                         # Multi-agent discussion protocols
    - id: requirements-meeting
      on_actions: [propose, specify]
      participants: [...]
      rounds: [...]
```

## Profile-Based Filtering

`applies_when` filters packs by project profile facts:

| Condition | Meaning |
|-----------|---------|
| `always` | Always loaded |
| `{ has_ui: true }` | Loaded if dimension exists with non-empty value |
| `{ has_ui: false }` | Loaded if dimension is absent/empty |
| `{ boundary: "published-api" }` | Loaded if dimension equals specific value |
| `{ has_ui: [web, native] }` | Loaded if dimension value is in array |
| `{ criticality: "!prototype" }` | Loaded if dimension differs from value |
| `{ persistence: "$exists" }` | Loaded if dimension has any non-empty value |
| `{ $or: [{a: x}, {b: y}] }` | Loaded if any branch matches |

Note: Complex filtering (`$or`, string matching, arrays) is a known limitation — currently only `true`/`false` boolean filters work. See the design Non-Goal in `openspec/changes/v3-routing-dispatch/`.

## Adding a New Skill

### 1. Create the directory structure

```bash
mkdir -p packs/foundation.pack/stages/review/skills/security-review/templates
```

### 2. Write instruction.md

This gets read by the sub-agent from the manifest's `skills[]` path.

```markdown
# Security Review — review stage methodology

## Purpose
Review the implementation for security vulnerabilities and compliance.

## Required checks
### Input validation
- All user input is validated
- SQL/NoSQL queries are parameterized

### Authentication / Authorization
- Credentials are not hardcoded
- Session tokens expire
```

### 3. Add format templates

```bash
# packs/foundation.pack/stages/review/skills/security-review/templates/security-report.md
```

### 4. Compose and verify

```bash
spec-graph compose
# Check that graph.yaml stages.review.skills includes security-review
```

The `composer` module scans `packs/*/stages/<stage>/skills/` and writes the skills list into `graph.yaml`. Dispatch then reads this list and includes skill paths in the manifest.

## Writing Good gate.yaml

Gate criteria are evaluated by `gate-enforcement`. Each criterion has:

```yaml
- id: unique-identifier
  description: Human-readable description
  verification: rule | traceability | llm-judge | downstream-executability | human
```

### Tips

- **Keep descriptions actionable** — "proposal.md has all sections" is better than "proposal is valid"
- **Include format hints** — describe the expected format in the description
- **Balance strictness** — too strict = auto-retry loops; too loose = low quality

### Example gate.yaml

```yaml
entry:
  - id: previous-stage-passed
    description: The previous stage's exit gate passed
    verification: rule

exit:
  - id: artifact-exists
    description: design.md has been created
    verification: rule

  - id: artifact-structure
    description: design.md contains Context / Goals / Decisions / Risks sections
    verification: rule

  - id: covers-specs
    description: Every spec requirement is covered in design.md
    verification: traceability
```

## Writing Good instruction.md

A good instruction.md:

### ✓ Has explicit stance
- "Be specific about findings, not vague"
- "Focus on why, not how"

### ✓ Lists required structure
- "Include these sections: ..."
- "Use this format: - `name`: desc"

### ✓ Has common pitfalls
- "Pitfall: Vague requirements"
- "Pitfall: Missing scenarios"

### ✓ Has self-check questions
- "Did I cover all spec requirements?"
- "Are all capability identifiers kebab-case?"

## Local Overrides

Users can override pack fields by placing a `.spec-graph/pack-overrides.yaml` file:

```yaml
version: "1"
overrides:
  foundation:
    checks:
      lint:
        command: "pnpm lint"
        touchfiles: ["src/**/*.ts"]
    gates:
      exit-merged:
        add_checks: [security-scan]
```

See `types/index.ts` for the `PackOverrides` interface.
