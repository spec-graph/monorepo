## ADDED Requirements

### Requirement: Intent-to-plan transformation

The planning capability SHALL accept a user intent (a natural-language description like "Add JWT authentication") plus the project profile (from the sense system) and produce a structured plan. The plan SHALL decompose the intent into capabilities, order them by dependency, and estimate complexity and risks.

#### Scenario: Single intent decomposed into multiple capabilities
- **WHEN** the user provides intent "Add JWT authentication"
- **THEN** the planning capability SHALL produce a plan containing at least three capabilities: user system (signup/login/logout), JWT mechanism (access/refresh tokens), and protection middleware; each with a dependency order

#### Scenario: Plan includes complexity and risk
- **WHEN** the planning capability produces a plan
- **THEN** the plan SHALL include a complexity estimate (low/medium/high) and a list of identified risks (e.g., "password hashing strategy", "token expiration policy")

### Requirement: Human confirmation gate

The planning capability SHALL present the generated plan to the user for confirmation before the automator proceeds to the specify stage. The user SHALL be able to approve, modify, or reject the plan. **This is the only mandatory human-in-the-loop point in the entire workflow.**

#### Scenario: User approves plan
- **WHEN** the planning capability presents a plan and the user responds with approval
- **THEN** the automator SHALL proceed to the specify stage using the approved plan

#### Scenario: User modifies plan
- **WHEN** the user requests modifications to the plan
- **THEN** the planning capability SHALL regenerate the plan incorporating the modifications and re-present for confirmation

#### Scenario: User rejects plan
- **WHEN** the user rejects the plan entirely
- **THEN** the automator SHALL abort the workflow and NOT proceed to specify

### Requirement: Capability breakdown with dependencies

The plan produced by the planning capability SHALL list each capability with: a unique identifier, a brief description, dependencies (other capabilities that must complete first), and suggested stage ordering.

#### Scenario: Plan with ordered capabilities
- **WHEN** the plan contains capabilities A, B, C where B depends on A and C depends on B
- **THEN** the plan SHALL clearly state the order A → B → C, and the automator SHALL process them in this order

#### Scenario: Independent capabilities identified
- **WHEN** two capabilities have no dependency relationship
- **THEN** the plan MAY indicate they can be processed in parallel (future optimization) or in any order

### Requirement: Scope negotiation with user

If the planning capability detects ambiguity in the user's intent (e.g., multiple reasonable interpretations, unclear boundaries), it SHALL ask clarifying questions before producing the plan.

#### Scenario: Ambiguous intent triggers questions
- **WHEN** the user says "Add auth" without specifying the type
- **THEN** the planning capability SHALL ask whether the user means JWT, OAuth, session-based, or another auth mechanism before producing the plan

#### Scenario: Clear intent skips questions
- **WHEN** the user's intent is unambiguous (e.g., "Add JWT authentication with refresh tokens")
- **THEN** the planning capability SHALL proceed directly to plan generation without asking clarifying questions

### Requirement: Plan persistence

The generated plan SHALL be persisted as a structured artifact (e.g., `plan.md` or `plan.yaml`) in the change directory. Subsequent stages SHALL reference the plan as the authoritative source for scope.

#### Scenario: Later stages reference the plan
- **WHEN** the specify stage generates a proposal
- **THEN** the proposal SHALL align with the capabilities and scope defined in the persisted plan

#### Scenario: Plan serves as scope contract
- **WHEN** a later stage attempts to introduce work outside the plan's scope
- **THEN** the gate-enforcement capability SHALL flag this as a scope deviation
