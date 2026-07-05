# Migration to session CSV index (v3.1)

spec-graph v3.1 introduces a global session index and structured session IDs.
This replaces the previous behavior where session directory names were derived
directly from the user's intent (which produced excessively long paths).

## What changed

### Session ID format

Session IDs are now structured: `<task-abbrev>-<YYYYMMDD>-<NNN>`.

- **`<task-abbrev>`**: 1-3 English words in kebab-case, auto-derived from the
  intent or user-supplied via `--abbrev`.
- **`<YYYYMMDD>`**: 8-digit creation date (local timezone).
- **`<NNN>`**: 3-digit zero-padded per-day sequence counter.

Examples: `fs-20260705-001`, `auth-20260706-002`, `migration-20260705-001`.

### Global session index

A CSV file at `.spec-graph/sessions/sessions.csv` is the canonical source of
truth for session discovery. It contains one row per session with columns:

```csv
id,state,description,created_at,updated_at,stage,completed_tasks,pending_tasks,running_tasks,runnable_tasks
```

The four task columns contain comma-separated lists of task IDs (RFC 4180
quoted) so external tools can see what's done, in-flight, or ready to dispatch
without parsing `state.yaml`.

## Migration path

### Automatic (lazy)

Existing sessions with long names are migrated on first access. When you run
`spec-graph sessions list` in a project with a legacy directory, the CLI:

1. Reads the legacy directory's `state.yaml`.
2. Derives a task abbreviation from the intent.
3. Allocates a new structured ID.
4. Renames the directory.
5. Updates the CSV row and writes a mapping to `.spec-graph/sessions/.migration.log`.

No manual intervention is required.

### Explicit

To see all migrations applied to a project:

```bash
spec-graph sessions migrate
```

To verify the CSV and directories are consistent:

```bash
spec-graph sessions doctor [--fix]
```

## Rollback

The migration is non-destructive — the legacy-to-new ID mapping is logged in
`.spec-graph/sessions/.migration.log`. To recover the original long name,
reverse the rename using the log.

## Impact on external coordinators

External tools (editor plugins, OpenSpec, BMAD) should switch from directory
listing to reading `sessions.csv`. The format is stable (RFC 4180 CSV) and the
schema is described in `coordinator-protocol.md`.
