# Dev Stories — methodology

## Purpose

Transform user stories into technical development stories. Each dev story specifies implementation approach, file impact, and acceptance criteria from a technical perspective.

## Stance

- **User story first, dev story second.** Dev stories implement user stories.
- **Technical depth, not user perspective.** Dev stories focus on HOW.
- **Estimate in story points or hours.** Realistic estimation.
- **Identify file impact upfront.** Prevents parallel conflicts.

## Required Sections

### Story Identifier
- Maps to user story (e.g., "DEV-001: User Login")
- Type: feature / refactor / bugfix / chore
- Estimated effort: S / M / L / XL

### Implementation Approach
- High-level design
- Key components affected
- New components created
- Dependencies to add/update

### File Impact
- Files to be created
- Files to be modified
- Files to be deleted
- Test files to add

### Technical Acceptance Criteria
- Code compiles/lints/typechecks
- Unit tests pass
- Integration tests pass
- Code review passed
- Documentation updated

## Common Pitfalls

- **Pitfall: Not mapping to user story.** Every dev story must trace to a user story.
- **Pitfall: Missing file impact.** Without this, parallel conflict analysis fails.
- **Pitfall: Over-engineering.** Stick to what's needed for the user story.
- **Pitfall: No tests.** Every dev story must include test plan.

## Self-Check Questions

- Does this dev story trace to a user story?
- Is the file impact listed (essential for parallel execution)?
- Are the technical acceptance criteria testable?
- Is the effort estimate realistic?
- Are all dependencies identified?
