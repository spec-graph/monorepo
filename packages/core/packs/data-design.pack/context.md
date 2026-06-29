# Data Design Pack Context

## When This Pack Activates
- Profile dimension `persistence` = `database` or `embedded-store`

## What This Pack Provides
- Data model templates
- Schema migration strategy
- Data consistency validation gate

## Key Artifacts
- `contract/db-schema` — Database schema definition
- `design/data-model` — Entity relationship diagram

## Agent Guidance
- Schema must be versioned and migrations must be reversible
- Foreign keys must have explicit ON DELETE behavior
- Index strategy must be documented for frequently queried fields
- PII fields must be marked and have retention policy
