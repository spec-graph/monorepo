## Why

Session directories under `.spec-graph/sessions/` are currently named with the full session id, which is itself derived from the user intent. This produces paths like `flash-sale-10-infra-foundation-user-auth-jwt-product-crud-crud-f` — excessively long, truncated at filesystem limits, and painful to navigate in a terminal or file browser. There is also no single place to view all sessions at a glance: the `spec-graph sessions` command has to walk every directory and parse each `state.yaml` to assemble the list, and external tools (editor plugins, dashboards, the OpenSpec layer) have to duplicate that scan. A single global index file solves both problems — short directory names become possible, and any tool can read one CSV to know what sessions exist, what they are doing, and what they mean.

## What Changes

- Introduce **structured session IDs** in the format `<task-abbrev>-<YYYYMMDD>-<NNN>` (e.g., `fs-20260705-001`, `auth-20260706-002`) used as the on-disk directory name instead of the long intent-derived slug.
- Add a new global index file **`.spec-graph/sessions/sessions.csv`** at the project root sessions directory, with one row per session: `id`, `state`, `description`, `created_at`, `updated_at`.
- The CSV becomes the **single source of truth** for listing sessions; directory walking is only used as a fallback / migration path.
- Update session creation (in `@spec-graph/core` automator) to allocate a short ID, register the row in the CSV, and create the short-named directory.
- Update the CLI `sessions` command (list / info / delete) to read the CSV instead of scanning directories.
- Provide a **one-shot migration** for existing sessions: rename long directories to short IDs and seed the CSV from each `state.yaml`.
- Define **concurrent-safe write semantics** for the CSV (file-level lock + atomic rewrite) since the orchestrator and external coordinators both touch it.

## Capabilities

### New Capabilities

- `short-session-id`: generation of structured filesystem-friendly session IDs (`<task-abbrev>-<YYYYMMDD>-<NNN>`), including auto-abbreviation from intent, per-task per-day sequencing, and user override.
- `session-csv-index`: the `sessions.csv` schema, read/write API, concurrent-write safety, and the migration path from directory-scanned sessions.

### Modified Capabilities

- `coordinator-protocol`: the coordinator contract must reference `sessions.csv` as the discovery surface (instead of "scan the sessions directory"), and the dispatch manifest must emit the short session ID.
- `backward-compat`: add a migration rule for pre-CSV sessions — short-ID rename + CSV row seeded from `state.yaml`; old clients reading directory names must still work during the transition.

## Impact

- **Core (`@spec-graph/core`)**: `automator.createSession`, `automator.listSessions`, `automator.status` all switch to CSV-first lookup. New `SessionIndex` module owns the CSV.
- **CLI (`packages/cli`)**: `commands/sessions.ts` reads the CSV; `commands/init.ts` creates an empty CSV alongside the `sessions/` directory.
- **On-disk layout**: existing long-named directories are renamed on first use; users running external tools pointing at the old path names need to migrate (documented).
- **External coordinators** (OpenSpec, BMAD, editor plugins): must switch to reading `sessions.csv` for session discovery; this is the protocol-level change captured in `coordinator-protocol`.
- **No breaking API change** to the `spec-graph` CLI surface — `sessions list/info/delete` keep their flags and output shape.
