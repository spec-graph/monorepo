## Context

spec-graph stores each running session as a subdirectory under `.spec-graph/sessions/`. The directory name is the session ID, which the current generator derives from the user's intent (e.g., `flash-sale-10-infra-foundation-user-auth-jwt-product-crud-crud-f`). Three pain points have surfaced:

1. **Long directory names** are hard to read in `ls`, get truncated in `tree`, and are fragile when passed to shell commands. Some filesystems cap path segments at 255 chars; intents can produce IDs near that limit when the user is verbose.
2. **Session discovery is slow.** `spec-graph sessions list` walks every subdirectory and parses `state.yaml` to learn id/state/intent. External coordinators (OpenSpec, BMAD, editor plugins) duplicate this walk.
3. **No single dashboard of record.** A CSV with one row per session lets a user or tool see everything at a glance without reading YAML.

The current state is also stable enough that a CSV file is the simplest correct answer — no need for SQLite, no need for a real database.

## Goals / Non-Goals

**Goals:**

- Directory names under `.spec-graph/sessions/` are short, filesystem-friendly, and do not leak the user's intent.
- A single CSV file at `.spec-graph/sessions/sessions.csv` is the authoritative list of sessions, their state, and their descriptions.
- The CLI `sessions list/info/delete` and any external coordinator reads the CSV, not directory listings.
- Existing long-named sessions continue to work — they are migrated on first access.
- The CSV is safe to read/write concurrently from the orchestrator, the CLI, and external tools.

**Non-Goals:**

- Changing the 9-stage FSM or stage artifacts — session internals are untouched.
- Removing `state.yaml` inside each session directory — it still holds the per-session FSM state; the CSV is an index, not a replacement.
- Supporting network-attached or distributed sessions — single-host file CSV only.
- Changing the user-visible session ID format used by `spec-graph sessions --session <id>` beyond the shortness guarantee.

## Decisions

### 1. Session ID format: `<task-abbrev>-<YYYYMMDD>-<NNN>`

**Decision:** Session IDs combine a human-readable task abbreviation, the creation date, and a per-day sequence number. Format: `<english-abbreviation>-<YYYYMMDD>-<NNN>`, e.g., `fs-20260705-001`, `auth-20260706-002`.

- **Task abbreviation**: 1-3 English words in kebab-case, max 24 chars. Auto-derived from the intent's leading words (stripped of non-ASCII, collapsed, first 2 words). The user can override via `startSession(intent, { abbrev: 'fs' })` or CLI flag `--abbrev fs`.
- **Date**: 8-digit `YYYYMMDD` of creation time in local timezone.
- **Sequence**: 3-digit zero-padded counter starting at `001`, incremented per (abbrev, date) pair within the project's CSV.

**Rationale:** This format is simultaneously human-meaningful (you can read `fs-20260705-001` and know it's the first flash-sale session on July 5th), naturally bounded in length (max ~35 chars), chronologically sortable within a task, and still short enough for comfortable shell use.

**Alternatives considered:**

- **`s_<12 random chars>`**: Opaque — users can't tell sessions apart at a glance.
- **UUID-v4**: Way too long, no semantic content.
- **Pure sequential (`0001`, `0002`)**: Short but meaningless; tells you nothing about the session's purpose or age.
- **Intent-derived slug only (the status quo)**: Unbounded length, gets truncated unpredictably.

**Final ID generation:**
1. `abbrev` from user option OR auto: `intent.split(/\s+/).slice(0,2).join('-').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24)` (with Chinese → pinyin first-word fallback via a small lookup, or just use the first ASCII word).
2. `date` = `yyyymmdd` of `new Date()`.
3. `seq` = scan CSV rows for `^<abbrev>-<date>-(\d+)$`, take max+1, start at 1.
4. Result: `${abbrev}-${date}-${String(seq).padStart(3,'0')}`.

### 2. CSV location: `.spec-graph/sessions/sessions.csv`

**Decision:** The index lives at `.spec-graph/sessions/sessions.csv` — inside the sessions directory it indexes.

**Rationale:** Co-locating the index with the directories it references keeps the file system layout self-contained. `.spec-graph/` is already gitignored per-project (verified: `.gitignore` contains `.spec-graph`), so the CSV is not committed. Tools that look at `.spec-graph/` for config will also find the CSV.

### 3. CSV schema

```csv
id,state,description,created_at,updated_at,stage,completed_tasks,pending_tasks,running_tasks,runnable_tasks
fs-20260705-001,running,"构建完整的秒杀系统。高并发分布式架构...",2026-07-05T09:00:00Z,2026-07-05T10:23:11Z,implement,"user-model,auth-endpoints","api-docs,error-handling",user-model,"api-endpoints,request-validation"
auth-20260703-001,completed,Add user authentication,2026-07-03T14:00:00Z,2026-07-04T09:15:22Z,accept,"user-model,auth-endpoints,auth-middleware,api-endpoints,request-validation,error-handling,api-docs,input-sanitization",,,
```

- **`id`**: the short session ID (primary key, also the directory name).
- **`state`**: one of `running | paused | completed | failed` — mirrors the FSM's terminal states.
- **`description`**: the user's original intent string, quoted (may contain commas, newlines stripped).
- **`created_at`**, **`updated_at`**: ISO-8601 UTC timestamps. `updated_at` is refreshed on every state/stage transition.
- **`stage`**: current stage (`specify`, `specs`, `design`, `tasks`, `implement`, `review`, `test`, `accept`, `integrate`) for quick display without opening `state.yaml`.
- **`completed_tasks`**: comma-separated list of task IDs whose execution is finished. Empty before the implement stage.
- **`pending_tasks`**: comma-separated list of task IDs not yet started and not currently running.
- **`running_tasks`**: comma-separated list of task IDs currently being executed by sub-agents.
- **`runnable_tasks`**: comma-separated list of task IDs whose dependencies are satisfied and that are ready to be dispatched next.

Because these four columns contain embedded commas, their values are RFC 4180 quoted (e.g. `"user-model,auth-endpoints"`). Empty lists are represented as empty fields (not `""`).

**Alternatives considered:**

- **YAML (`sessions.yaml`):** Inconsistent — sessions themselves use YAML but an index should be trivially parseable by any tool (spreadsheets, editor plugins).
- **JSON:** Awkward for humans to scan or edit; no better than CSV for a flat list.
- **SQLite:** Overkill for hundreds of rows; adds a native dependency.

### 4. CSV write safety: lockfile + atomic rewrite

**Decision:** All writes go through a single `SessionIndex` module that:
1. Acquires a per-file lock at `.spec-graph/sessions/.sessions.csv.lock` using `proper-lockfile` semantics (we will use a simple fs-based lock: try to `mkdir` the lock dir; retry with backoff up to 5s).
2. Reads the current CSV into memory, mutates, writes to a temp file in the same directory.
3. `rename()`s the temp file over the CSV (atomic on POSIX).
4. Releases the lock.

**Rationale:** The orchestrator and CLI may both touch the CSV. Without coordination, one writer's output can overwrite another's. Atomic rewrite prevents partial writes from being observed.

**Alternatives considered:**

- **Append-only log:** Complicates reads; needs periodic compaction.
- **No locking:** Works today only because there's one process; will break the moment an external coordinator joins.

### 5. Read path: CSV-first, directory fallback

**Decision:** `listSessions()` returns CSV rows. If the CSV is missing, the implementation falls back to walking the sessions directory and parsing `state.yaml` — same as today — and regenerates the CSV on the fly.

**Rationale:** Graceful degradation for users on older versions. First read after upgrade transparently migrates without a separate command.

### 6. Migration: lazy + explicit

**Decision:**
- **Lazy migration:** When `listSessions()` encounters a directory whose name does NOT match the short-ID regex AND no CSV row exists for it, it allocates a new short ID, renames the directory, and adds a CSV row seeded from the directory's `state.yaml`.
- **Explicit migration:** New CLI command `spec-graph sessions migrate` enumerates legacy directories, applies the same transformation, and reports what changed.
- **Rollback:** The original long IDs are logged (CSV can get a `legacy_id` column or a separate log file) so a user can manually recover.

## Risks / Trade-offs

- **[Risk] CSV gets out of sync with directories** → Mitigation: `spec-graph sessions doctor` verifies every CSV row has a matching directory and every directory has a matching CSV row; auto-repair on mismatch.
- **[Risk] External tools reading old directory names break** → Mitigation: Migration logs the mapping; `backward-compat` spec covers this explicitly. External tools should switch to CSV.
- **[Risk] Lock contention under heavy orchestrator use** → Mitigation: Lock scope is per-write (milliseconds), not per-session. Reads are lock-free.
- **[Risk] CSV grows unbounded over years of sessions** → Mitigation: Completed/failed sessions older than a configurable threshold are archived (row removed, directory moved to `.spec-graph/sessions/archive/`). Out of scope for this change but the schema leaves room.
- **[Trade-off] Short IDs are not human-meaningful** → The description column preserves the user's intent; `sessions list` shows both.
- **[Trade-off] Extra indirection (ID → directory)** → Negligible; one CSV read per session lookup, already dominated by YAML parsing.

## Migration Plan

1. Deploy core change with new `SessionIndex` module. CSV is created on first write.
2. First `sessions list` invocation after upgrade triggers lazy migration of all legacy directories in that project.
3. Run explicit `spec-graph sessions migrate` in the example projects to validate (including the long-named `flash-sale-10-...` session).
4. Rollback: revert core package; directories still have their (now short) IDs, but `state.yaml` inside still carries the original intent. CSV is additive — its absence does not break operation.

## Open Questions

- **Should the CSV be committed to git?** Currently `.spec-graph/` is gitignored, so sessions are already ephemeral per-clone. Leaning "no" — but worth confirming with users who share projects across machines.
- **Should we expose a `legacy_id` column in the CSV?** Only if users demand traceability; adds clutter otherwise. Default: no column, but the migration log file captures the mapping.
