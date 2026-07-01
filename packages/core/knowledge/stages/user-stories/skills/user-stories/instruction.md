# User Stories — methodology

## Purpose

Generate user stories from requirements using the "As a [user], I want [goal], So that [benefit]" format. Each story has testable acceptance criteria.

## Stance

- **User perspective, not system perspective.** "As a developer, I want to refactor..." is NOT a user story.
- **One story = one user benefit.** Don't combine multiple benefits.
- **Acceptance criteria are testable.** Given/When/Then format.
- **Priority is user value, not engineering difficulty.**

## User Story Format

```
As a [user type],
I want to [goal],
So that [benefit].
```

### Example

```
As a bookstore customer,
I want to log in with email and password,
So that I can save my order history.
```

## Acceptance Criteria Format

```
Given [precondition],
When [action],
Then [expected outcome].
```

### Example

```
Given a customer with valid credentials
When they POST to /login with email and password
Then they receive a 200 response with a JWT token valid for 15 minutes
```

## Required Sections

### User Stories (with priority)
- P0: Must have (core functionality)
- P1: Should have (important)
- P2: Nice to have (optional)

### Acceptance Criteria per story
- Given/When/Then format
- 2-5 criteria per story
- Each criterion testable

### Out of Scope
- Things explicitly not in this change
- Helps prevent scope creep

## Common Pitfalls

- **Pitfall: Technical stories.** "As a developer, I want to refactor the auth module" is not a user story.
- **Pitfall: Compound stories.** "As a user, I want to register, login, and reset password" is multiple stories.
- **Pitfall: Untestable criteria.** "Should work well" is not testable.
- **Pitfall: No benefit.** "So that I can use the system" is not a real benefit.

## Self-Check Questions

- Does every story have user type, goal, and benefit?
- Are all stories from user perspective (not technical)?
- Are acceptance criteria in Given/When/Then format?
- Are priorities based on user value?
- Is out-of-scope explicitly defined?
