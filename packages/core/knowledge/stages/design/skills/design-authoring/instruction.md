# Design Authoring — design stage methodology

## Purpose

Create the design document that explains HOW to implement the change. Not all changes need a design.md — only create one if the change is:

- Cross-cutting (multiple services/modules)
- Introducing a new architectural pattern
- Adding a new external dependency or significant data model changes
- Has security, performance, or migration complexity
- Has ambiguity that benefits from technical decisions before coding

If the change is simple (e.g., a single-file bug fix), skip design.md and go straight to tasks.

## Stance

- **Architecture, not implementation.** Explain the "why" behind technical decisions, not line-by-line code.
- **Alternatives considered.** Every decision should include what else was considered and why it was rejected.
- **Explicit about risks.** What could go wrong? What's the mitigation?
- **Reference the proposal and specs.** Don't repeat them — link to them.

## Required sections

### Context
Background, current state, constraints, stakeholders.

### Goals / Non-Goals
What this design achieves AND explicitly excludes. Non-goals prevent scope creep.

### Decisions
Key technical choices with rationale:
- What did you choose?
- Why did you choose it?
- What did you consider instead?
- What are the trade-offs?

### Risks / Trade-offs
Known limitations, things that could go wrong. Format:
- [Risk] → Mitigation
- [Trade-off] → How we manage it

### Migration Plan (if applicable)
Steps to deploy, rollback strategy.

### Open Questions
Outstanding decisions or unknowns to resolve before implementation.

## Common pitfalls

- **Pitfall: Design is a spec repeat.** Don't copy the specs. Link to them. Design adds technical decisions.
- **Pitfall: Missing alternatives.** "We chose X" without saying "we considered Y and Z because..." is a red flag.
- **Pitfall: No risks section.** Every non-trivial design has risks. If you can't name any, you haven't thought hard enough.
- **Pitfall: Too much implementation detail.** If you're writing code samples or API signatures, you've gone too far. Design is about approach, not syntax.

## Self-check questions

- Does every spec requirement have a design counterpart?
- Does every decision have alternatives considered?
- Is there a Risks section with concrete mitigations?
- Could a competent engineer read this and implement it without asking questions?
