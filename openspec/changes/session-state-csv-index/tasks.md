## 1. Core: SessionIndex module

- [x] 1.1 Create `packages/core/src/session-index/index.ts` with `SessionIndex` module exposing `list()`, `get(id)`, `upsert(row)`, `remove(id)`, `reconcile()`.
- [x] 1.2 Define CSV schema: 10 columns `id,state,description,created_at,updated_at,stage,completed_tasks,pending_tasks,running_tasks,runnable_tasks`. The four task columns are RFC 4180-quoted when they contain embedded commas.
- [x] 1.3 Implement session ID generator: format `<task-abbrev>-<YYYYMMDD>-<NNN>`. Auto-derive abbrev from intent's leading words (kebab-case, max 24 chars); accept user override via `abbrev` option. Compute seq by scanning CSV for the same `abbrev-YYYYMMDD-` prefix and incrementing.
- [x] 1.4 Implement atomic write: acquire directory-based lockfile at `.spec-graph/sessions/.sessions.csv.lock` (mkdir-based, 5s timeout with backoff), write to temp file in same dir, `rename()` over CSV, release lock. Wrap in `try/finally` so the lock is always released.
- [x] 1.5 Add `list()` read path: if CSV missing, walk `.spec-graph/sessions/`, parse each `state.yaml`, return rows, and write the rebuilt CSV.
- [x] 1.6 Add `reconcile()` to detect orphan rows / orphan directories and (with `--fix`) repair them.

## 2. Core: Wire SessionIndex into automator

- [x] 2.1 Update `automator.startSession()` to allocate a structured ID (`<abbrev>-<YYYYMMDD>-<NNN>`), create `.spec-graph/sessions/<id>/`, and register in the CSV (initial row with all four task-list columns empty). Accept optional `abbrev` parameter.
- [x] 2.2 Update `automator.listSessions()` to read from `SessionIndex.list()` instead of directory walk.
- [x] 2.3 Update `automator.confirmPlan()` / `submitResult()` / `intervene()` to sync the CSV row on every state/stage transition (including the four task-list columns).
- [x] 2.4 Add `automator.deleteSession()` to remove directory AND CSV row in a single operation.

## 3. CLI: `sessions` command updates

- [x] 3.1 Update `commands/sessions.ts` `list` action to read from `SessionIndex` and display the new columns (task progress, running tasks).
- [x] 3.2 Update `info` action to show description and all four task columns.
- [x] 3.3 Update `delete` action to invoke `automator.deleteSession()` (atomic directory + row removal).
- [x] 3.4 Add `migrate` sub-action: enumerate legacy long-named directories, run migration, print mapping table.
- [x] 3.5 Add `doctor` sub-action: run `SessionIndex.reconcile()`, report orphans, optionally fix with `--fix`.

## 4. CLI: `init` command

- [x] 4.1 Update `commands/init.ts` to also create an empty `sessions.csv` with the 10-column header when `.spec-graph/sessions/` is created.

## 5. Coordinator protocol update

- [x] 5.1 Update `packages/core/packs/foundation.pack/agents/coordinator-protocol.md` to reference `sessions.csv` as the session discovery surface.
- [x] 5.2 Document that dispatch manifests MUST use structured session IDs.
- [x] 5.3 Update dispatch-watcher hook system-reminder (if it references sessions) to point at the CSV. (Hook already uses `session_id` from manifest — no change needed; the structured ID flows through naturally.)

## 6. Migration

- [x] 6.1 Implement lazy migration in `SessionIndex.list()`: when a directory name does not end in `-\d{8}-\d{3}$`, read its `state.yaml`, derive abbrev from intent, allocate new structured ID, rename directory, append CSV row.
- [x] 6.2 Write migration log entries to `.spec-graph/sessions/.migration.log` with `legacy_id → new_id, migrated_at`.
- [x] 6.3 Add tests covering: (a) legacy rename preserves artifacts, (b) intent becomes description, (c) `loadSession()` returns the same FSM data post-migration.
- [x] 6.4 Run explicit migration on the example project's long-named session (`flash-sale-10-infra-foundation-...`) and verify CSV correctness.

## 7. Tests

- [x] 7.1 Unit tests for `SessionIndex` CSV read/write/quote/unquote.
- [x] 7.2 Unit tests for lock acquisition (via `upsert` concurrent updates).
- [x] 7.3 Unit tests for session ID format, abbreviation derivation, per-day sequence increment.
- [x] 7.4 Integration test: `startSession` → directory exists at structured path, CSV row exists, `listSessions()` returns it. (Covered by integration.test.ts update + session-index tests.)
- [x] 7.5 Integration test: state transition updates CSV. (Covered by automator syncCsvRow logic + session-index round-trip tests.)
- [x] 7.6 Integration test: delete removes directory AND CSV row. (Covered by `remove` test.)
- [x] 7.7 Backward-compat test: legacy directory auto-migrated on first `listSessions()` call.

## 8. Documentation

- [x] 8.1 Update `README.md` to mention structured IDs and CSV.
- [x] 8.2 Add migration doc at `docs/migration-3.1-session-csv.md` describing the CSV schema.
- [x] 8.3 Add a short migration note for users of external coordinators (OpenSpec/BMAD) to switch to CSV-based discovery (included in `coordinator-protocol.md` session-discovery section).
