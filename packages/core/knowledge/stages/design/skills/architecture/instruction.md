# Architecture — design stage methodology (BMAD ADR style)

## Purpose

Document architectural decisions using the industry-standard **Architecture Decision Record (ADR)** format. ADRs provide a searchable history of why certain decisions were made, enabling future maintainers to understand context and avoid re-litigating settled choices.

## Stance

- **Decisions are records, not debates.** Once decided, document it. Future maintainers can revisit if context changes.
- **One decision per ADR.** Don't conflate unrelated decisions.
- **Status matters.** Mark ADRs as Proposed, Accepted, Superseded, or Deprecated.
- **Context is king.** Without context, the decision is meaningless.

## ADR Format

```markdown
# ADR-<number>: <title>

## Status

<Proposed | Accepted | Superseded by ADR-<X> | Deprecated>

## Context

<What is the issue that we're seeing that is motivating this decision?>

## Decision

<What is the change that we're proposing and/or doing?>

## Consequences

### Positive
- <benefit 1>
- <benefit 2>

### Negative
- <drawback 1>
- <drawback 2>

### Risks
- <risk 1 with mitigation>

## Alternatives Considered

### Alternative A: <name>
- **Pros**: ...
- **Cons**: ...
- **Why rejected**: ...

### Alternative B: <name>
- **Pros**: ...
- **Cons**: ...
- **Why rejected**: ...
```

## Example ADR

```markdown
# ADR-001: Use JWT for authentication

## Status

Accepted

## Context

The bookstore API currently has no authentication. We need to add user authentication to protect write operations. The system is deployed as a stateless API with no session storage. Mobile clients need to authenticate.

## Decision

We will use JWT (JSON Web Tokens) with the following parameters:
- Access tokens: 15-minute expiration, stored in memory on client
- Refresh tokens: 7-day expiration, stored in httpOnly cookie
- Signing algorithm: HS256 with 256-bit secret from environment variable
- Payload: user ID, email, roles

## Consequences

### Positive
- Stateless authentication fits our deployment model
- Mobile clients can store tokens in memory
- Standard library support in all languages

### Negative
- Token invalidation is complex (requires token blacklist)
- Refresh token rotation adds complexity

### Risks
- Secret leakage would compromise all tokens → Mitigation: rotate secret quarterly, monitor for leaks
- 15-minute expiration may frustrate users → Mitigation: silent refresh with refresh tokens

## Alternatives Considered

### Alternative A: Session-based auth
- **Pros**: Simpler implementation, easy invalidation
- **Cons**: Requires session storage (Redis), not stateless, harder to scale
- **Why rejected**: Conflicts with stateless deployment model

### Alternative B: OAuth 2.0 only
- **Pros**: Industry standard, third-party support
- **Cons**: Requires third-party provider, overkill for single-app use case
- **Why rejected**: Added dependency for a simple use case
```

## When to Create ADRs

Create ADRs for:
- **Major technology choices** (database, framework, language)
- **Architectural patterns** (microservices vs monolith, event-driven vs request-response)
- **Cross-cutting concerns** (authentication, authorization, logging, monitoring)
- **Security decisions** (encryption, secrets management)
- **Performance decisions** (caching strategy, indexing)

Do NOT create ADRs for:
- Routine implementation details
- Configuration values (unless critical)
- Changes that revert or fix prior decisions (just update status)

## ADR Numbering

Use sequential numbering starting from ADR-001. Each ADR gets a unique number.

## How to Use ADRs with spec-graph

In the design stage:

1. **Write design.md** in our standard Decision format (richer information)
2. **Generate architecture.md** as a collection of ADRs (one per major decision)

The relationship:
- design.md Decisions are the **source of truth** (richer)
- architecture.md ADRs are the **standardized records** (for external consumption, audits)

Example relationship:

```markdown
// In design.md
### Decision 1: Authentication mechanism

**Choice**: JWT with refresh tokens
**Rationale**: ...
**Alternatives considered**: ...
**Trade-offs**: ...

// In architecture.md
# ADR-001: Use JWT for authentication
[Standard ADR format, referencing design.md for full details]
```

## Integration with Our Decision Format

Our Decision format contains:
- Choice
- Rationale
- Alternatives considered (with pros/cons)
- Trade-offs

ADR format contains:
- Status
- Context
- Decision
- Consequences (positive, negative, risks)
- Alternatives considered

**Mapping:**
- Our "Choice" → ADR "Decision"
- Our "Rationale" → ADR "Context" + "Decision"
- Our "Alternatives" → ADR "Alternatives Considered"
- Our "Trade-offs" → ADR "Consequences"

The ADR format adds:
- Status tracking (Proposed/Accepted/Superseded/Deprecated)
- Consequences explicitly categorized
- Sequential numbering for traceability

## Common Pitfalls

- **Pitfall: ADRs without status.** Status is critical. An ADR without status is ambiguous.
- **Pitfall: Mixing concerns in one ADR.** One decision per ADR. If you have two decisions, write two ADRs.
- **Pitfall: Skipping Context.** Context is what makes the decision understandable later.
- **Pitfall: Writing ADRs for everything.** Reserve ADRs for significant decisions.

## Self-Check Questions

- Is each ADR focused on a single decision?
- Does each ADR have a clear status?
- Is the context sufficient to understand the decision years later?
- Are consequences categorized (positive, negative, risks)?
- Are alternatives considered with reasons for rejection?
