## ADDED Requirements

### Requirement: Intent-to-plan transformation

The planning capability SHALL accept a user intent (natural-language description like "Add JWT authentication") plus an optional project profile and produce a structured plan. The plan SHALL include:
- `capabilities`: list of discrete units of work with kebab-case ids, descriptions, and dependency lists
- `order`: topologically sorted list of capability ids
- `complexity`: one of `low` / `medium` / `high`
- `risks`: list of identified risks
- `openQuestions`: list of questions that need clarification

#### Scenario: Single intent decomposed into multiple capabilities
- **WHEN** the user provides intent "Add JWT authentication"
- **THEN** the planning capability SHALL produce a plan containing at least three capabilities: a user data model, authentication endpoints, and authentication middleware, with the middleware depending on the user model

#### Scenario: Intent with no recognized domain keywords
- **WHEN** the user's intent does not match any known domain keyword
- **THEN** the planning capability SHALL create a single generic capability with a kebab-case id derived from the intent and the intent text as its description

#### Scenario: Plan is deterministic for same intent
- **WHEN** `generatePlan` is called twice with the same intent
- **THEN** the output SHALL be identical (same capabilities, same order, same complexity, same risks)

#### Scenario: Profile influences complexity
- **WHEN** a profile indicates a brownfield project with many existing files
- **THEN** the complexity estimate SHALL be higher than for the same intent with a greenfield profile

### Requirement: Domain keyword matching

The planning capability SHALL maintain a knowledge table mapping 11 domain keywords (auth, api, ui, db, test, cli, deploy, security, perf, refactor, knowledge, agent) to capability templates. Each template has a kebab-case id, description, and dependency list.

#### Scenario: Single keyword match
- **WHEN** the intent contains one recognized keyword (e.g., "auth")
- **THEN** the planning capability SHALL include all capability templates associated with that keyword

#### Scenario: Multiple keyword match
- **WHEN** the intent contains multiple recognized keywords (e.g., "auth" and "api")
- **THEN** the planning capability SHALL merge the capability templates from both keywords, deduplicating by id

#### Scenario: Keyword in substring
- **WHEN** the intent contains a keyword as a substring of a larger word (e.g., "author" contains "auth")
- **THEN** the planning capability SHALL still match (keyword is case-insensitive and matched as substring)

#### Scenario: Keyword not recognized
- **WHEN** the intent does not match any keyword
- **THEN** the planning capability SHALL fall back to creating a single generic capability

### Requirement: Topological ordering

The planning capability SHALL order the capabilities in the plan using a topological sort based on their `dependsOn` relationships. The sort SHALL use Kahn's algorithm.

#### Scenario: Dependencies respected
- **WHEN** capability B depends on capability A
- **THEN** A SHALL appear before B in the `order` list

#### Scenario: Cycle detection
- **WHEN** the dependency graph contains a cycle (A depends on B and B depends on A)
- **THEN** the planning capability SHALL detect the cycle and append the cyclic nodes to the end of the `order` list with a warning

#### Scenario: Independent capabilities
- **WHEN** two capabilities have no dependency relationship
- **THEN** their relative order in the `order` list SHALL be stable (deterministic for the same input)

### Requirement: Complexity estimation

The planning capability SHALL estimate the complexity of a plan as `low`, `medium`, or `high` based on:
- Number of capabilities
- Total number of dependencies
- Project profile (brownfield projects have higher complexity for the same plan)

#### Scenario: Small plan is low complexity
- **WHEN** a plan has 2 capabilities and 1 dependency
- **THEN** complexity SHALL be `low`

#### Scenario: Large plan is high complexity
- **WHEN** a plan has 10+ capabilities and 8+ dependencies
- **THEN** complexity SHALL be `high`

#### Scenario: Brownfield adds complexity
- **WHEN** a plan has 6 capabilities (normally medium) but the project profile is brownfield
- **THEN** complexity SHALL be bumped to `high`

### Requirement: Risk identification

The planning capability SHALL identify risks based on:
- High dependency count (≥5 total dependencies → integration complexity risk)
- Large number of capabilities (≥8 → scope creep risk)
- Security-related keywords (auth, security → security review needed)
- Database-related keywords (db, database → migration plan needed)
- Refactor keyword (refactor → regression risk)
- Brownfield integration (multiple infrastructure keywords + brownfield profile → compatibility risk)

#### Scenario: Security-sensitive plan
- **WHEN** the intent contains "auth" or "security"
- **THEN** risks SHALL include "Security-sensitive change — requires explicit security review"

#### Scenario: Low-risk plan
- **WHEN** no risk conditions are triggered
- **THEN** risks SHALL include "Low-risk change — standard development workflow applies"

#### Scenario: Multiple risks
- **WHEN** multiple risk conditions are triggered
- **THEN** all applicable risks SHALL be included in the risks list

### Requirement: Session ID generation

The planning capability SHALL generate a kebab-case session ID from the intent:
- Convert to lowercase
- Replace non-alphanumeric characters with hyphens
- Remove leading and trailing hyphens
- Truncate to 64 characters

#### Scenario: Standard intent
- **WHEN** the intent is "Add JWT authentication"
- **THEN** the session ID SHALL be "add-jwt-authentication"

#### Scenario: Intent with special characters
- **WHEN** the intent contains special characters (e.g., "Add JWT auth + refresh")
- **THEN** special characters SHALL be replaced with hyphens (e.g., "add-jwt-auth-refresh")

#### Scenario: Very long intent
- **WHEN** the intent is longer than 64 characters after normalization
- **THEN** the session ID SHALL be truncated to 64 characters

### Requirement: Open questions propagation

The planning capability SHALL propagate any `openQuestions` provided in the input to the output plan. If no open questions are provided, the output SHALL have an empty list.

#### Scenario: Open questions provided
- **WHEN** the input includes `openQuestions: ["What's the refresh token TTL?"]`
- **THEN** the output plan SHALL include the same question in its `openQuestions`

#### Scenario: No open questions
- **WHEN** the input does not include `openQuestions`
- **THEN** the output plan SHALL have `openQuestions: []`
