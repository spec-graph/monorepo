# file-conflict-analyzer Specification

## Purpose
TBD - created by archiving change parallel-agent-workflow. Update Purpose after archive.
## Requirements
### Requirement: Analyze file impact of tasks

The file-conflict-analyzer SHALL estimate which files each task will modify based on task description, design documents, and spec references. If a pre-check with the agent is available, the agent SHALL be asked which files it plans to modify.

#### Scenario: Tasks modify non-overlapping files
- **WHEN** task A modifies `src/auth/` and task B modifies `src/books/`
- **THEN** the file-conflict-analyzer SHALL report "no conflict" and allow parallel execution

#### Scenario: Tasks modify overlapping files
- **WHEN** task A and task B both modify `src/middleware/auth.ts`
- **THEN** the file-conflict-analyzer SHALL report "conflict detected" and recommend serialization

#### Scenario: Task reads but does not write a shared file
- **WHEN** task A writes to `src/auth/`, task B reads (but does not write) `src/auth/user.ts`
- **THEN** the file-conflict-analyzer SHALL report "no conflict" and allow parallel execution

#### Scenario: Unknown file impact
- **WHEN** the file conflict analyzer cannot determine which files a task will modify
- **THEN** the analyzer SHALL mark the task as "unknown impact" and recommend conservative serialization with other tasks

### Requirement: Pre-dispatch agent query

Before dispatching parallel agents, the file-conflict-analyzer SHALL optionally send a lightweight prompt to each agent asking: "Which files will you modify? Output as a list of relative paths." The response SHALL be parsed to build a file conflict matrix.

#### Scenario: Agent responds with file list
- **WHEN** the agent responds with `["src/auth/login.ts", "src/auth/middleware.ts"]`
- **THEN** the conflict analyzer SHALL register these files for that task

#### Scenario: Agent query times out
- **WHEN** the agent query times out without a response
- **THEN** the task SHALL be marked as "unknown impact"

### Requirement: Conflict matrix

The file-conflict-analyzer SHALL produce a conflict matrix: an N×N boolean matrix where `matrix[i][j] = true` means task i and task j have file conflicts and should NOT run in parallel.

#### Scenario: Two tasks with no conflicts
- **WHEN** task A's files are `[auth/]` and task B's files are `[books/]`
- **THEN** `matrix[A][B]` SHALL be false

#### Scenario: Two tasks with conflicts
- **WHEN** task A's files are `[auth/, middleware/]` and task B's files are `[books/, middleware/]`
- **THEN** `matrix[A][B]` SHALL be true

