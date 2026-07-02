---
name: spec-graph-requirement-analysis
description: Guide requirement analysis with auto-detected depth (LIGHT/MEDIUM/HEAVY) based on intent complexity.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-requirement-analysis

## Depth Selection

- **LIGHT** (simple): "add button", "rename field"
  - Problem statement (1-2 sentences)
  - Why now
  - 3-5 acceptance criteria

- **MEDIUM** (refactoring): "refactor auth", "improve perf"
  - Problem statement
  - Impact analysis
  - Risks
  - Acceptance criteria
  - Technical constraints

- **HEAVY** (new systems): "build payment", "design database"
  - Problem statement
  - User personas
  - Market context
  - Stakeholder analysis
  - Feasibility
  - Risks
  - Success metrics
  - Out of scope

## Conservative

When in doubt about depth, use heavier analysis.
