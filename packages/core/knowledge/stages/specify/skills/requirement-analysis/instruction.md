# Requirement Analysis — specify stage methodology

## Purpose

Create the proposal document that establishes WHY a change is needed. The proposal is the foundation — specs, design, and tasks all build on it.

## Stance

- **Why first, how later.** A proposal without a clear "why" is a solution looking for a problem.
- **Scope discipline.** The Capabilities section creates the contract between proposal and specs. Every capability listed here needs a corresponding spec file later.
- **Concise.** 1-2 pages. No implementation details — those belong in design.md.
- **Research first.** Before listing capabilities, check existing specs (if any). Don't duplicate.

## Required sections

### Why (1-2 sentences)
What problem does this solve? Why now? What happens if we don't do this?

### What Changes
Bullet list of changes. Be specific about new capabilities, modifications, or removals. Mark breaking changes with **BREAKING**.

### Capabilities
Identify which specs will be created or modified:
- **New Capabilities**: List capabilities being introduced. Each becomes a new `specs/<name>/spec.md`. Use kebab-case names (e.g., `user-auth`, `data-export`).
- **Modified Capabilities**: List existing capabilities whose REQUIREMENTS are changing. Only include if spec-level behavior changes (not just implementation details). Each needs a delta spec file.

### Impact
Affected code, APIs, dependencies, or systems.

## Common pitfalls

- **Pitfall: Vague "why".** "We need auth because it's a good practice" is not a why. Be specific: what user scenario fails without it?
- **Pitfall: Over-scoping in proposal.** The proposal identifies WHAT, not HOW. If you're discussing implementation details, you've gone too far.
- **Pitfall: Capabilities section is an afterthought.** This section is the most important — it defines the scope contract. Spend time here.
- **Pitfall: Not checking existing specs.** Before listing "new" capabilities, check `openspec/specs/` (or equivalent) to see if one already exists.

## Why this matters

The proposal is read by:
- The specs stage (to know what capabilities to spec out)
- The design stage (to know what to design for)
- Future maintainers (to know why this change was made)

A bad proposal cascades into bad specs, bad design, and bad implementation. Invest in getting this right.

## Self-check questions

Before submitting, ask:
1. Can I explain the "why" in one sentence?
2. Are all capabilities kebab-case?
3. Does each capability have enough description that someone could write a spec for it?
4. Is this 1-2 pages, not a 10-page essay?
5. Did I check for existing specs that cover similar ground?
