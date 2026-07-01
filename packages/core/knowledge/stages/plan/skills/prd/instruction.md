# PRD — planning stage methodology (BMAD style)

## Purpose

Create a Product Requirements Document that frames the plan from the **user's perspective**. Every requirement traces back to a user story, ensuring the implementation serves real user needs — not just technical elegance.

## Stance

- **User-first, system-second.** Start with who is using the feature and what they need. Technical details emerge from user needs, not the other way around.
- **Every requirement has a "who" and a "why".** If you can't answer "As a [user type], I want [goal] so that [benefit]", the requirement is too technical.
- **Prioritize by user impact, not engineering difficulty.** A small change that unblocks many users > a large change that helps few.
- **Acceptance criteria are user-facing.** Define "done" in terms of what the user sees, not what the system does.

## User Story Format

### Standard Format

```
As a [user type],
I want to [goal],
So that [benefit].
```

### Example

```
As a bookstore customer,
I want to log in with my email and password,
So that I can save my order history and see recommendations.
```

### Acceptance Criteria

Each user story needs testable acceptance criteria:

```
Given [precondition]
When [action]
Then [expected outcome]
```

### Example

```
Given a user with email "user@example.com" and password "secret"
When they POST to /login with those credentials
Then they receive a 200 response with a JWT token valid for 15 minutes
```

## Required PRD Sections

### 1. User Personas

List the users who will interact with this feature:

```markdown
## User Personas

### Primary: Customer
- Has an email address
- Wants to save order history
- Values security

### Secondary: Admin
- Needs to manage users
- Wants audit logs
- Values compliance
```

### 2. User Stories

List the user stories with priority (P0 = must have, P1 = should have, P2 = nice to have):

```markdown
## User Stories

### P0: Authentication

**US-001: User can log in**
As a customer, I want to log in with email and password, so that I can access my account.

Acceptance Criteria:
- Given valid credentials, login returns 200 with JWT
- Given invalid credentials, login returns 401
- JWT expires after 15 minutes

**US-002: User can register**
As a new customer, I want to create an account, so that I can save my data.

Acceptance Criteria:
- Given unique email, registration returns 201
- Given duplicate email, registration returns 409
- Password must be at least 8 characters
```

### 3. User Journey Map

Visualize how users interact with the feature:

```markdown
## User Journey

1. Customer visits the site
2. Clicks "Login" button
3. Enters email and password
4. Receives JWT token (stored in cookie)
5. Can now access protected endpoints
6. Clicks "Logout" to end session
```

### 4. Non-Functional Requirements

```markdown
## Non-Functional Requirements

- **Performance**: Login must complete in <500ms
- **Security**: Passwords hashed with bcrypt (cost 10+)
- **Compliance**: JWT tokens follow OWASP recommendations
```

### 5. Out of Scope

```markdown
## Out of Scope

- OAuth integration (future)
- Multi-factor authentication (future)
- Password reset via email (separate change)
```

## Common Pitfalls

- **Pitfall: Technical user stories.** "As a developer, I want to refactor..." — this is not a user story. It's a technical task. Rephrase in terms of user benefit.
- **Pitfall: Missing acceptance criteria.** User stories without acceptance criteria are not testable. Every story needs GIVEN/WHEN/THEN.
- **Pitfall: Skipping personas.** Without personas, you're building for "everyone" which means no one. Identify 1-3 specific user types.
- **Pitfall: Scope creep in user stories.** Keep each story small and focused. A story that does 5 things is actually 5 stories.

## Why This Matters

The PRD bridges the gap between **what users need** and **what engineers build**. Without it:
- Engineers build technically correct but user-hostile features
- Product managers have no way to validate success
- Testers have no acceptance criteria to verify against
- Future maintainers don't understand the "why"

A PRD is the single source of truth for "what are we building and for whom".

## Self-Check Questions

Before finalizing the PRD, ask:
1. Can every user story be traced back to a persona?
2. Does every user story have at least one acceptance criterion?
3. Are acceptance criteria written in GIVEN/WHEN/THEN format?
4. Are non-functional requirements measurable?
5. Can a tester verify "done" using only the PRD?

## Mapping to Technical Specs

Every user story should map to at least one technical requirement in the specs:

```markdown
### Traceability

| User Story | Technical Requirement | Spec |
|------------|----------------------|------|
| US-001 Login | REQ-auth-endpoint | specs/auth/spec.md |
| US-001 Login | REQ-password-hash | specs/auth/spec.md |
| US-002 Register | REQ-user-model | specs/user/spec.md |
```

This mapping ensures:
- No user story is left unimplemented
- No technical requirement is implemented without serving a user need
- Test cases can be derived from both perspectives
