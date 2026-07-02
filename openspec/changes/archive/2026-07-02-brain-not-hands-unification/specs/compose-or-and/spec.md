## MODIFIED Requirements

### Requirement: Compose supports $or and $and

The pack composer SHALL parse `applies_when` conditions with `$or` and `$and` operators.

#### Scenario: $or operator
- **WHEN** pack has `applies_when: { $or: [{a: true}, {b: true}] }`
- **THEN** composer SHALL load if EITHER matches

#### Scenario: $and operator
- **WHEN** pack has `applies_when: { $and: [{a: true}, {b: true}] }`
- **THEN** composer SHALL load only if BOTH match

#### Scenario: Nesting limit
- **WHEN** pack has >2 levels of nesting
- **THEN** composer SHALL skip the pack with warning
