# Dev Stories — methodology

## Purpose

Transform user stories into technical development stories with implementation approach and file impact.

## Stance

- **User story first, dev story second.**
- **Technical depth, not user perspective.**
- **Estimate in story points or hours.**
- **Identify file impact upfront.** (enables file-conflict-analyzer)

## Required Sections

### Story Identifier
- Maps to user story (e.g., "DEV-001: User Login")
- Type: feature / refactor / bugfix / chore
- Estimated effort: S / M / L / XL

### Implementation Approach
- High-level design
- Key components affected
- New components created

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
