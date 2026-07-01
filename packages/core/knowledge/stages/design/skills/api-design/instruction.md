# API Design — design stage methodology

## Purpose

Design RESTful APIs that are consistent, intuitive, and maintainable. API design is the contract between frontend and backend — get it right early, because changing it later breaks consumers.

## Stance

- **Design for consumers, not for yourself.** Your API is consumed by frontend devs, mobile teams, and external partners. Make it easy for them.
- **Consistency over cleverness.** A boring, predictable API is better than a clever, surprising one.
- **Explicit over implicit.** Don't rely on convention that isn't documented.
- **Version from day one.** APIs evolve. Plan for v2 from the start.

## Required Guidelines

### URL Design
- Use nouns, not verbs: `GET /books`, not `GET /get-books`
- Use plural nouns: `GET /books`, not `GET /book`
- Use nested resources for relationships: `GET /authors/123/books`
- Use kebab-case for multi-word resources: `GET /order-items`

### HTTP Methods
- `GET` — retrieve (idempotent, safe)
- `POST` — create
- `PUT` — replace (idempotent)
- `PATCH` — partial update
- `DELETE` — remove (idempotent)

### Status Codes
- `200` — success (GET, PUT, PATCH)
- `201` — created (POST)
- `204` — no content (DELETE)
- `400` — bad request (validation error)
- `401` — unauthorized (missing auth)
- `403` — forbidden (insufficient permissions)
- `404` — not found
- `409` — conflict (duplicate, version mismatch)
- `422` — unprocessable entity (semantic error)
- `429` — too many requests (rate limited)
- `500` — internal server error

### Request/Response Format
- Use JSON for request and response bodies
- Wrap list responses: `{ "books": [...], "total": 42, "page": 1 }`
- Use consistent error format: `{ "error": "message", "code": "VALIDATION_ERROR", "details": [...] }`
- Include pagination for list endpoints: `?page=1&limit=20`
- Use ISO 8601 for dates: `"2026-07-01T10:00:00Z"`

### Naming Conventions
- Use camelCase for JSON keys: `{ "createdAt": "...", "updatedAt": "..." }`
- Use consistent field names across resources: `createdAt` everywhere, not `created_at` in one resource and `dateCreated` in another

### Documentation
- Every endpoint has a description
- Every parameter has a type, description, and whether it's required
- Every response has an example
- Document error codes and their meanings

## Common Pitfalls

- **Pitfall: Returning different error formats.** Use one error format across all endpoints.
- **Pitfall: Returning HTML error pages for API errors.** API consumers expect JSON.
- **Pitfall: Not versioning from day one.** Add `/v1/` prefix to all endpoints (or use header-based versioning).
- **Pitfall: Breaking changes without deprecation.** Deprecate first, then remove later.
- **Pitfall: Leaking implementation details.** Don't expose internal IDs, database column names, or stack traces.

## Self-Check Questions

- Are all URLs noun-based, not verb-based?
- Are status codes used consistently?
- Is the error format consistent?
- Are dates ISO 8601?
- Is pagination included for list endpoints?
