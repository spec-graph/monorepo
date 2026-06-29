# API Design Pack Context

## When This Pack Activates
- Profile dimension `boundary` = `published-api`
- Profile dimension `consumers` = `external-public` or `internal-team`

## What This Pack Provides
- Contract-first design templates (OpenAPI, gRPC, GraphQL)
- Contract validation gates
- Versioning strategy enforcement

## Key Artifacts
- `contract/openapi` — REST API specification
- `contract/grpc` — gRPC service definition
- `contract/graphql` — GraphQL schema

## Agent Guidance
- API design happens BEFORE implementation (contract-first)
- Every endpoint must have: request schema, response schema, error schema
- Versioning: use header-based or URL-based versioning consistently
- Breaking changes require semver MAJOR bump
