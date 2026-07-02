# dependency-analyzer Specification

## Purpose
TBD - created by archiving change parallel-agent-workflow. Update Purpose after archive.
## Requirements
### Requirement: Task dependency analysis

The dependency-analyzer SHALL analyze a set of tasks with their declared dependencies and produce an execution plan dividing tasks into "waves" — groups of tasks that can execute in parallel because they have no mutual dependencies.

#### Scenario: Tasks with no dependencies all run in wave 1
- **WHEN** three tasks A, B, C have no dependency relationships
- **THEN** the dependency-analyzer SHALL place all three in Wave 1 (parallel execution)

#### Scenario: Task C depends on A, B is independent
- **WHEN** task C depends on task A, and task B is independent
- **THEN** waves SHALL be: Wave 1 = A + B (parallel), Wave 2 = C (serial, after A completes)

#### Scenario: Linear chain
- **WHEN** tasks A (independent), B depends on A, C depends on B
- **THEN** waves SHALL be: Wave 1 = A, Wave 2 = B, Wave 3 = C (all serial)

#### Scenario: Cycle detection
- **WHEN** tasks have a circular dependency (A depends on B, B depends on A)
- **THEN** the dependency-analyzer SHALL detect the cycle, mark both tasks as blocked, and report the cycle to the user

#### Scenario: Empty task list
- **WHEN** the task list is empty
- **THEN** the dependency-analyzer SHALL return an empty execution plan

### Requirement: Wave ordering

Each wave SHALL have a monotonically increasing wave number starting from 1. Tasks in wave N+1 can only execute after all tasks in wave N are complete.

#### Scenario: Task completion triggers next wave
- **WHEN** all tasks in Wave 1 complete
- **THEN** the automator SHALL begin dispatching tasks in Wave 2

#### Scenario: Partial wave failure
- **WHEN** one task in Wave 1 fails after retries
- **THEN** Wave 2 SHALL NOT begin until the failed task is resolved or force-advanced

### Requirement: Dependency graph visualization

The dependency-analyzer SHALL produce a machine-readable representation of the task dependency graph suitable for visualization (DOT format, JSON edges).

#### Scenario: Graph output
- **WHEN** tasks with dependencies are analyzed
- **THEN** the output SHALL include a JSON array of edges: [{from: "A", to: "C"}, {from: "B", to: "C"}]

