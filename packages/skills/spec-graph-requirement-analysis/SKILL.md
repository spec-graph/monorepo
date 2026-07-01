---
name: spec-graph-requirement-analysis
description: Guide the host agent to perform requirement analysis with auto-detected depth. Adapts analysis depth based on intent complexity: light, medium, or heavy.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Guide the host agent through requirement analysis with adaptive depth.

## When to use

- Before designing a new feature
- When understanding complex requirements
- For stakeholder alignment

## Steps

### 1. Detect analysis depth

```bash
spec-graph analyze "<intent>"
# Returns: { depth: "light" | "medium" | "heavy", reason: "..." }
```

Auto-detection based on:
- Intent length and complexity
- Keywords (build/architect = heavy; fix/refactor = medium; add/rename = light)
- Domain count (multiple domains = heavy)

### 2. Conduct analysis at appropriate depth

**LIGHT depth** (simple tasks: add button, rename, fix typo):
- Problem statement (1-2 sentences)
- Why now (1 sentence)
- Acceptance criteria (3-5 bullets)

**MEDIUM depth** (refactoring, modifications):
- Problem statement
- Impact analysis (what files change)
- Risks
- Acceptance criteria
- Technical constraints

**HEAVY depth** (new systems, complex features):
- Problem statement
- User personas (2-3 with goals/pain points)
- Market context (why this vs alternatives?)
- Stakeholder analysis
- Feasibility assessment
- Risks
- Success metrics
- Out of scope

### 3. Output analysis document

The analysis output should be in markdown:

```markdown
# Requirement Analysis: <feature-name>

## Problem Statement
<1-3 sentences>

## Why Now
<Why is this needed at this time>

## User Personas (HEAVY only)
### <Persona>
- Goals
- Pain points

## Impact Analysis (MEDIUM+)
- Files affected
- Components affected
- Risks

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Out of Scope
- <what's NOT included>
```

### 4. Validate auto-depth

User can override the auto-detected depth:
```bash
spec-graph analyze "<intent>" --depth heavy
```

## Edge cases

- **User disagrees with auto-depth**: user can manually set depth
- **Intent is ambiguous**: ask for clarification before proceeding
- **Out of scope unclear**: default to including it (conservative)

## Self-check questions

- Is the problem statement clear and specific?
- For HEAVY: are personas grounded (not made up)?
- For MEDIUM+: are risks identified?
- For HEAVY: are success metrics measurable?
- Is the depth appropriate for the intent?
