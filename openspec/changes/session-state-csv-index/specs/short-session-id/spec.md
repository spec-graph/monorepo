## ADDED Requirements

### Requirement: Session IDs follow the task-date-sequence format

When a new session is created, the system SHALL allocate a session ID in the format `<task-abbrev>-<YYYYMMDD>-<NNN>` (e.g., `fs-20260705-001`, `auth-20260706-002`) and use it as both the directory name under `.spec-graph/sessions/` and the session's primary identifier.

- `<task-abbrev>`: 1-3 English words in kebab-case, max 24 chars, auto-derived from the intent's leading words or user-supplied via `abbrev` option.
- `<YYYYMMDD>`: 8-digit creation date (local timezone).
- `<NNN>`: 3-digit zero-padded sequence counter, per (abbrev, date) pair, starting at 001.

#### Scenario: newly created session gets a task-date-sequence ID

- **WHEN** a user invokes `spec-graph plan "<intent>"`
- **THEN** the system generates an ID matching the regex `-\d{8}-\d{3}$`
- **AND** the ID's date segment equals today's date in `YYYYMMDD` form
- **AND** the session directory is created at `.spec-graph/sessions/<id>/`
- **AND** the session's `state.yaml` has `sessionId` set to the new ID

#### Scenario: sequence counter increments per task per day

- **WHEN** a session `fs-20260705-001` already exists in the CSV
- **AND** a new session is created on the same day with abbrev `fs`
- **THEN** the new session gets ID `fs-20260705-002`

#### Scenario: sequence counter resets per day

- **WHEN** a session `fs-20260705-003` exists from July 5th
- **AND** a new session is created on July 6th with abbrev `fs`
- **THEN** the new session gets ID `fs-20260706-001`

#### Scenario: task abbreviation can be user-supplied

- **WHEN** the caller passes `{ abbrev: 'fs' }` to `startSession()`
- **THEN** the ID begins with `fs-` regardless of intent text

#### Scenario: task abbreviation auto-derived when not supplied

- **WHEN** no `abbrev` is supplied and intent is "构建秒杀系统 flash sale"
- **THEN** the ID begins with an abbreviation derived from the intent's leading words
- **AND** the abbreviation is kebab-cased lowercase ASCII, max 24 chars

#### Scenario: legacy long IDs are not generated for new sessions

- **WHEN** a new session is created after the change is deployed
- **THEN** the session ID contains the date segment (8 digits) and sequence segment (3 digits)
- **AND** the ID is not a raw intent slug

---

### Requirement: Sessions CSV is created alongside sessions directory

The system SHALL maintain a CSV file at `.spec-graph/sessions/sessions.csv` with one row per session and a header row.

#### Scenario: fresh project has empty CSV after init

- **WHEN** `spec-graph init` runs in a new project
- **THEN** `.spec-graph/sessions/sessions.csv` is created
- **AND** the file contains only the header: `id,state,description,created_at,updated_at,stage`

#### Scenario: session creation appends a CSV row

- **WHEN** a new session is created with ID `fs-20260705-001`
- **THEN** the CSV gains a row with `id=fs-20260705-001`, `state=running`, `description=<user intent>`, `created_at` and `updated_at` set to the current UTC timestamp, `stage=specify`

#### Scenario: session state transitions update the CSV

- **WHEN** an existing session advances from stage `specify` to `specs` with `state=running`
- **THEN** the CSV row for that session's ID is updated with `stage=specs` and a new `updated_at`
- **AND** `state` remains `running`

#### Scenario: session completion updates state and timestamp

- **WHEN** a session reaches the `done` terminal state
- **THEN** the CSV row is updated with `state=completed` and a new `updated_at`

---

### Requirement: CSV writes use atomic rewrite with file lock

The system SHALL serialize all writes to the CSV using a directory-based lockfile and atomic file replacement, so concurrent writers cannot corrupt the index.

#### Scenario: two simultaneous writes do not lose rows

- **WHEN** two processes call the CSV write API concurrently with different updates
- **THEN** both updates are reflected in the final CSV
- **AND** no partial or corrupted rows are observed

#### Scenario: lock acquisition times out gracefully

- **WHEN** a writer cannot acquire the lock within 5 seconds
- **THEN** the operation fails with a clear error (not a crash)
- **AND** the existing CSV remains untouched

#### Scenario: failed write does not leave lock behind

- **WHEN** a writer crashes mid-write
- **THEN** the lockfile is either not created, or is released/cleaned up on the next access attempt
- **AND** subsequent writers can proceed

---

### Requirement: CSV read path is the default session discovery

`listSessions()` and any session lookup by ID SHALL read the CSV as the primary source of truth.

#### Scenario: CLI sessions list reads from CSV

- **WHEN** a user runs `spec-graph sessions list`
- **THEN** the output is derived from `.spec-graph/sessions/sessions.csv`
- **AND** the CLI does not need to parse any `state.yaml` to produce the list

#### Scenario: session info by ID reads from CSV

- **WHEN** a user runs `spec-graph sessions info --session fs-20260705-001`
- **THEN** the CSV row for `fs-20260705-001` is used to locate the session directory

---

### Requirement: Graceful fallback when CSV is missing

If the CSV does not exist, the system SHALL fall back to scanning the sessions directory and rebuild the CSV transparently.

#### Scenario: missing CSV triggers rebuild

- **WHEN** `listSessions()` is called and `.spec-graph/sessions/sessions.csv` does not exist
- **THEN** the system walks `.spec-graph/sessions/` and parses each session's `state.yaml`
- **AND** the CSV is generated from the discovered sessions
- **AND** the returned list matches what a CSV-based read would return

#### Scenario: empty sessions directory produces header-only CSV

- **WHEN** `listSessions()` is called on a project with no sessions and no CSV
- **THEN** an empty CSV with only the header row is created
- **AND** the returned list is empty

---

### Requirement: Short session IDs work with all CLI commands

The CLI's `sessions` subcommand SHALL accept short session IDs for all actions that previously accepted long IDs.

#### Scenario: delete uses short ID

- **WHEN** a user runs `spec-graph sessions delete --session fs-20260705-001`
- **THEN** the corresponding session directory is removed
- **AND** the CSV row for that ID is removed

#### Scenario: list output shows short ID

- **WHEN** a user runs `spec-graph sessions list`
- **THEN** each session is displayed with its short ID
- **AND** the description (intent) is shown alongside
