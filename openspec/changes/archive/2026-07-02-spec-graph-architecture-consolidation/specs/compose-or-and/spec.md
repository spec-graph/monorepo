## MODIFIED Requirements

### Requirement: Compose supports $or and $and operators

The pack composer SHALL correctly parse `applies_when` conditions that use `$or` and `$and` operators, not just simple `dim: true/false` matching.

#### Scenario: $or operator
- **WHEN** a pack declares `applies_when: { $or: [{ boundary: "published-api" }, { deployment: "hosted-service" }] }`
- **THEN** the composer SHALL include the pack if EITHER `boundary=published-api` OR `deployment=hosted-service` matches

#### Scenario: $and operator
- **WHEN** a pack declares `applies_when: { $and: [{ has_ui: true }, { has_db: true }] }`
- **THEN** the composer SHALL include the pack only if BOTH conditions match

#### Scenario: Nested operators
- **WHEN** a pack declares nested `$or` and `$and`
- **THEN** the composer SHALL evaluate recursively, up to 2 levels deep

#### Scenario: Backward compatibility with simple AND
- **WHEN** a pack declares `applies_when: { has_ui: true, has_db: true }`
- **THEN** the composer SHALL treat it as AND semantics (existing behavior)

#### Scenario: Invalid nesting depth
- **WHEN** a pack declares `$or` or `$and` nested more than 2 levels
- **THEN** the composer SHALL skip the pack with a warning

#### Scenario: Unknown operators
- **WHEN** a pack declares `$xor` or other unknown operators
- **THEN** the composer SHALL skip the pack with a warning
