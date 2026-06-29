---
name: spec-graph-change
description: "Manage change units (feature, bugfix, refactor, etc.). Create, list, archive, and inspect changes. Each change auto-generates a plan MD for audit and recovery. Use when starting new work or checking change history."
---

# spec-graph change

Manage change units — the atomic work items that drive the workflow.

## What this does

Changes are the unit of iteration in spec-graph (inspired by OpenSpec). Each change:

- Has a type (feature, bugfix, refactor, spike, performance, migration, deprecation)
- Auto-generates a **plan MD** (`<title>-<timestamp>-plan.md`) for audit trail and recovery
- Tracks state via JSON descriptor (`<title>-<timestamp>.json`) with plan MD path reference
- Defines scope (tracks, files, contracts affected)
- Tracks risk level and priority
- Records execution state and audit trail
- Archives plan MD alongside JSON on completion

## Usage

```bash
# List all changes
npx spec-graph change list

# Create a new change (generates plan MD + JSON)
npx spec-graph change create --title "Add user authentication" --type feature --priority high

# Show change details
npx spec-graph change show <change-id>

# Apply a change (begin execution)
npx spec-graph change apply <change-id>

# Complete a change
npx spec-graph change complete <change-id>

# Archive a change (snapshots plan MD + JSON to archive/)
npx spec-graph change archive <change-id>
```

### Options

- `--title <title>` — Change title (for create; slugified for filenames)
- `--type <type>` — Change type: feature, bugfix, refactor, migration, perf (for create)
- `--priority <priority>` — Priority: low, medium, high, critical (for create)
- `--description <desc>` — Change description (for create)

## Plan MD

Each `change create` produces a plan MD file at `.spec-graph/changes/<title-slug>-<timestamp>-plan.md`. The AI agent fills this with:

- Background and problem statement
- Scope (in and out)
- Acceptance criteria
- Affected artifacts, files, dependencies
- Decisions made, risks, open questions
- Progress tracking (completed/remaining/blockers)

After interruption, reload the plan MD to recover full context. On archive, the plan MD is snapshotted alongside the JSON descriptor.

## After archive: run retro

After archiving a change, run `spec-graph retro <change-id>` to capture lessons learned.

## Change types and their intent packs

| Type          | Pack             | Pipeline                                                                          |
| ------------- | ---------------- | --------------------------------------------------------------------------------- |
| `feature`     | feature.pack     | propose → specify → design → contract → plan → implement → review → test → accept |
| `bugfix`      | bugfix.pack      | diagnose → implement → review → test → accept                                     |
| `refactor`    | refactor.pack    | characterization → refactor → verify → test → accept                              |
| `spike`       | spike.pack       | timebox → explore → conclude/discard                                              |
| `performance` | performance.pack | baseline → hotspot → optimize → verify → accept                                   |
| `migration`   | migration.pack   | inventory → batch → dual-run → cutover → accept                                   |
| `deprecation` | deprecation.pack | mark → wait → zero-consumers → remove → accept                                    |
