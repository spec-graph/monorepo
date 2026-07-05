## ADDED Requirements

### Requirement: sessions.csv exists at the canonical path

A CSV file SHALL be located at `.spec-graph/sessions/sessions.csv` within each spec-graph-enabled project. This file is the global session index.

#### Scenario: index file exists after init

- **WHEN** `spec-graph init` completes in a project
- **THEN** `.spec-graph/sessions/sessions.csv` exists
- **AND** contains the header `id,state,description,created_at,updated_at,stage,completed_tasks,pending_tasks,running_tasks,runnable_tasks`

#### Scenario: index file is parseable by standard CSV tools

- **WHEN** a user or tool opens `.spec-graph/sessions/sessions.csv` with any RFC 4180-compliant CSV parser
- **THEN** the file parses without error
- **AND** each data row has exactly 10 fields matching the header

#### Scenario: description field is properly quoted when needed

- **WHEN** a session's intent contains commas, quotes, or newlines
- **THEN** the `description` column value is CSV-quoted
- **AND** embedded quotes are escaped by doubling

---

### Requirement: Index rows reflect the current state of each session

Each row in the CSV SHALL reflect the current `id`, `state`, `stage`, `description`, `created_at`, and `updated_at` of the corresponding session.

#### Scenario: row fields are consistent with state.yaml

- **WHEN** a session's `state.yaml` is read
- **THEN** the corresponding CSV row has the same `id`, `state`, and `stage`
- **AND** the `description` matches the `intent` field in `state.yaml`

#### Scenario: row updates are durable

- **WHEN** a state transition occurs and the CSV write returns success
- **THEN** a subsequent read of the CSV reflects the new state
- **AND** no other session's row is modified

---

### Requirement: External coordinators discover sessions via the CSV

The coordinator protocol SHALL expose the CSV as the canonical session discovery surface.

#### Scenario: dispatch manifest uses CSV for session enumeration

- **WHEN** an external coordinator (e.g., OpenSpec, BMAD) queries available sessions
- **THEN** it reads `.spec-graph/sessions/sessions.csv`
- **AND** it does not rely on directory listing to discover sessions

#### Scenario: coordinator can read CSV without parsing YAML

- **WHEN** an external tool wants to display active sessions
- **THEN** reading the CSV alone provides id, state, description, stage, and timestamps
- **AND** no `state.yaml` parsing is required

---

### Requirement: Session deletion removes both directory and CSV row

Deleting a session SHALL remove its directory from disk AND its row from the CSV atomically.

#### Scenario: delete is atomic across directory and index

- **WHEN** `spec-graph sessions delete --session <id>` completes
- **THEN** the session's directory no longer exists
- **AND** the CSV no longer contains a row with that ID

#### Scenario: partial delete does not leave orphan row

- **WHEN** the directory removal succeeds but CSV update fails
- **THEN** on the next `listSessions()` call, the orphan row is detected and removed
- **AND** a warning is logged

---

### Requirement: CSV includes created_at and updated_at timestamps

Each row SHALL include ISO-8601 UTC timestamps for creation and last update.

#### Scenario: timestamps are UTC and ISO-8601

- **WHEN** a session is created
- **THEN** both `created_at` and `updated_at` are set to the current UTC time in `YYYY-MM-DDTHH:MM:SSZ` format

#### Scenario: updated_at changes on every state/stage transition

- **WHEN** a session advances a stage or changes state
- **THEN** `updated_at` is set to the current UTC time
- **AND** `created_at` remains unchanged

---

### Requirement: Task progress columns reflect current implementation state

Each CSV row SHALL maintain `completed_tasks`, `pending_tasks`, `running_tasks`, and `runnable_tasks` so the index reflects which tasks are done, in-flight, waiting, or ready to dispatch.

#### Scenario: new session before tasks stage has empty task columns

- **WHEN** a session is in `specify`, `specs`, `design`, or `tasks` stage
- **THEN** `completed_tasks`, `pending_tasks`, `running_tasks`, and `runnable_tasks` are all empty

#### Scenario: task list is populated when tasks stage completes

- **WHEN** a session advances past the `tasks` stage
- **THEN** `pending_tasks` contains all task IDs from `plan.order`
- **AND** `runnable_tasks` contains tasks whose dependencies are all satisfied (typically the first wave)
- **AND** `completed_tasks` and `running_tasks` are empty

#### Scenario: task completion moves id from running to completed

- **WHEN** a task `user-model` in the implement stage is marked done
- **THEN** `user-model` is removed from `running_tasks` and added to `completed_tasks`
- **AND** `runnable_tasks` is recomputed (newly unblocked dependents appear)

#### Scenario: running_tasks reflects dispatched tasks

- **WHEN** sub-agents start executing tasks `user-model` and `api-endpoints`
- **THEN** `running_tasks="user-model,api-endpoints"` in the CSV row
- **AND** neither id appears in `pending_tasks` or `runnable_tasks`

#### Scenario: completed session has all tasks in completed_tasks

- **WHEN** a session reaches `state=completed`
- **THEN** `completed_tasks` contains every task ID from `plan.order`
- **AND** `pending_tasks`, `running_tasks`, and `runnable_tasks` are empty

#### Scenario: embedded commas in task lists are properly quoted

- **WHEN** a CSV row has multiple ids in any of the four task columns
- **THEN** the column value is RFC 4180 quoted (wrapped in `"..."`)
- **AND** a standard CSV parser reads back the original comma-separated list
