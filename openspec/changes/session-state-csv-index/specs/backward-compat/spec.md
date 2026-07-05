## ADDED Requirements

### Requirement: legacy long-named sessions are migrated on first access

Sessions created before the short-session-id change MUST continue to function, but their directories SHALL be renamed to short IDs and a CSV row SHALL be added on first access.

#### Scenario: legacy directory is renamed on first list

- **WHEN** `spec-graph sessions list` encounters a directory whose name does NOT match the new session ID format (ending in `-\d{8}-\d{3}$`)
- **THEN** the system reads that directory's `state.yaml`
- **AND** allocates a new structured ID (`<abbrev>-<YYYYMMDD>-<NNN>`) based on the legacy `intent`
- **AND** renames the directory to the new ID
- **AND** adds a CSV row seeded from the `state.yaml` content

#### Scenario: legacy intent is preserved as description

- **WHEN** a legacy session is migrated
- **THEN** the new CSV row's `description` field contains the legacy `state.yaml` `intent` value
- **AND** `created_at` is set to the directory's creation time if available, otherwise to the migration timestamp

#### Scenario: legacy session continues without data loss

- **WHEN** a user resumes a legacy session after migration
- **THEN** all artifacts in the session directory remain accessible
- **AND** the session's FSM state, stage, and progress are unchanged

#### Scenario: existing test-project sessions unaffected at the API level

- **WHEN** the existing test-project session is loaded after the change
- **THEN** `loadSession()` returns the same FSM data as before
- **AND** the directory has been renamed to a short ID
- **AND** `automator.status()` returns data keyed by the short ID

---

### Requirement: Migration log records legacy-to-short ID mapping

The system SHALL record a migration log so legacy IDs can be recovered or audited.

#### Scenario: migration log file is created on first migration

- **WHEN** any legacy directory is migrated
- **THEN** a log entry is appended to `.spec-graph/sessions/.migration.log`
- **AND** each entry records `legacy_id`, `short_id`, `migrated_at`

#### Scenario: explicit migrate command reports changes

- **WHEN** a user runs `spec-graph sessions migrate`
- **THEN** the CLI prints each `legacy_id → short_id` transformation
- **AND** reports the total count of migrated sessions

---

### Requirement: sessions doctor verifies CSV-directory consistency

A new diagnostic command SHALL verify that the CSV and directory tree are consistent.

#### Scenario: doctor detects orphan directories

- **WHEN** `spec-graph sessions doctor` runs
- **THEN** it reports any session directory without a matching CSV row

#### Scenario: doctor detects orphan CSV rows

- **WHEN** `spec-graph sessions doctor` runs
- **THEN** it reports any CSV row whose ID has no matching directory
- **AND** offers to remove the orphan row

#### Scenario: doctor auto-repairs simple mismatches

- **WHEN** `spec-graph sessions doctor --fix` runs
- **THEN** orphan directories get CSV rows seeded from their `state.yaml`
- **AND** orphan CSV rows are removed
