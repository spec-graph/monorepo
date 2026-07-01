# Requirement Analysis — methodology

## Purpose

Analyze user requirements to understand the problem space, market context, stakeholders, and feasibility before designing solutions. The depth of analysis is **auto-detected** based on intent complexity.

## Stance

- **Requirements are not specifications.** Understand the problem before solving it.
- **Stakeholders matter.** Different users have different needs.
- **Trade-offs are explicit.** Every choice has costs.
- **Auto-depth based on complexity.** Simple tasks don't need full analysis.

## Auto-Depth Selection

```
Intent complexity    →    Analysis depth
─────────────────────────────────────────────
"add login button"   →    LIGHT (1-2 sentences)
"refactor auth"      →    MEDIUM (impact analysis + risks)
"build payment sys"  →    HEAVY (market + stakeholders + ROI + feasibility)
```

Detection heuristic:
- Intent length (>50 words → heavier analysis)
- Multiple domains detected (auth + payment → HEAVY)
- Keywords: "build", "design", "implement" new system → HEAVY
- Keywords: "fix", "refactor", "modify" → MEDIUM
- Keywords: "add", "rename" → LIGHT

## Required Sections (depth-adaptive)

### LIGHT depth (simple tasks)
- Problem statement (1-2 sentences)
- Why now (1 sentence)
- Acceptance criteria (3-5 bullets)

### MEDIUM depth (refactoring, modifications)
- Problem statement
- Impact analysis (what changes?)
- Risks
- Acceptance criteria
- Technical constraints

### HEAVY depth (new systems, complex features)
- Problem statement
- User personas (who benefits?)
- Market context (why this vs alternatives?)
- Stakeholder analysis
- Feasibility assessment
- Risks
- Success metrics
- Out of scope

## Common Pitfalls

- **Pitfall: Vague problem statement.** "We need to improve X" is not a problem statement.
- **Pitfall: Skipping personas.** For HEAVY analysis, skipping personas leads to wrong solutions.
- **Pitfall: Over-analyzing LIGHT tasks.** Don't add market analysis for "add login button".
- **Pitfall: Not validating auto-depth.** User can override the auto-detected depth.

## Self-Check Questions

- Is the problem statement clear and specific?
- For HEAVY: Are personas grounded in real research (not made up)?
- For MEDIUM/HEAVY: Are risks identified?
- For HEAVY: Are success metrics measurable?
- Is the depth appropriate for the intent complexity?
