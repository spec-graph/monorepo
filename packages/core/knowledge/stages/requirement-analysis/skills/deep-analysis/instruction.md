# Requirement Analysis — methodology

## Purpose

Analyze user requirements to understand the problem space, market context, stakeholders, and feasibility. Depth is **auto-detected** based on intent complexity.

## Stance

- **Requirements are not specifications.** Understand the problem before solving it.
- **Stakeholders matter.** Different users have different needs.
- **Trade-offs are explicit.** Every choice has costs.

## Auto-Depth Selection

```
Intent complexity    →    Analysis depth
─────────────────────────────────────────────
"add login button"   →    LIGHT (1-2 sentences)
"refactor auth"      →    MEDIUM (impact analysis + risks)
"build payment sys"  →    HEAVY (market + stakeholders + ROI + feasibility)
```

## Required Sections

### LIGHT (simple tasks)
- Problem statement (1-2 sentences)
- Why now
- Acceptance criteria (3-5 bullets)

### MEDIUM (refactoring)
- Problem statement
- Impact analysis
- Risks
- Acceptance criteria
- Technical constraints

### HEAVY (new systems)
- Problem statement
- User personas
- Market context
- Stakeholder analysis
- Feasibility
- Risks
- Success metrics
- Out of scope
