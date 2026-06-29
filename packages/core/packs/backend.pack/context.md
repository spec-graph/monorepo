# Backend Pack Context

## When This Pack Activates
- Profile dimension `boundary` = `published-api` or `internal`
- Profile dimension `has_ui` = `none` (backend-only projects)

## What This Pack Provides
- Backend implementation track
- API contract generation
- Integration-level acceptance checks

## Key Artifacts
- `contract/openapi` — OpenAPI spec (producer side)
- `contract/db-schema` — Database schema
- `implementation/backend` — Server source code

## Agent Guidance
- Backend agents should produce contract files BEFORE implementation
- Always validate contract against existing consumers
- Database migrations must be reversible
- Error responses must follow RFC 7807 (Problem Details)
