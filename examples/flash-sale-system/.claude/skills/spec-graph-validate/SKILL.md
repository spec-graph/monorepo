---
name: spec-graph-validate
description: Validate the current state of a spec-graph workflow. Runs through the gate criteria and reports which pass and which fail. Use before submitting a result to catch issues early, or when you want to check if the current artifact is ready.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed.
metadata:
  author: spec-graph
  version: "2.0"
---

Validate the current state of a spec-graph workflow.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph validate --session <id>` | Evaluate current state against gates |
| `spec-graph gate --stage <stage> --type entry` | Raw gate evaluation |

Backed by core modules: `gate-enforcement`, `automator`

---

Validation runs the current stage's gate criteria against the existing artifacts and reports pass/fail status. This is useful for:

- **Pre-submit check**: Validate before running `submit` to avoid gate failures
- **Debugging**: Understand which criteria need work before submission
- **Status insight**: Get a detailed view of what's expected at this stage

---

## Steps

### 1. Run validation

```bash
spec-graph validate --json
```

The output is the complete session status:

```json
{
  "sessionId": "...",
  "stage": "specify",
  "state": "running",
  "progress": { "currentStageIndex": 0, "totalStages": 8, "completedArtifacts": 0 },
  "blockers": [],
  "recentDiagnosis": null
}
```

### 2. Check status + diagnose together

For a complete picture, run both:

```bash
spec-graph status --json
spec-graph diagnose --json
```

### 3. Pre-submit workflow

Before submitting a result with `submit`:

1. **Write the artifact** (proposal.md, design.md, etc.)
2. **Self-check**: verify the artifact against the criteria listed in the prompt's `<acceptance_criteria>` section
3. **Validate**: run this skill to confirm gate readiness
4. **Submit**: `spec-graph submit --result '...'`

If validate shows blockers or a recent diagnosis, fix them BEFORE submitting. This avoids unnecessary retries.

---

## How validate differs from status and diagnose

| Command | Purpose | When to use |
|---------|---------|-------------|
| `status` | High-level view: stage, progress, blockers | Any time you want to know where you are |
| `diagnose` | Detailed failure info for the last gate failure | After a gate failure (submit returned `advanced: false`) |
| `validate` | Gate readiness check for the current stage | Before submitting a result to avoid failure |

Run all three before each `submit` for maximum reliability.

---

## Edge cases

- **No session found**: spec-graph may not have a session. Start with `spec-graph plan`.
- **No blocker but diagnose shows failure**: The previous stage's gate failed but the session hasn't been cleaned up. Force-advance past the failed stage or fix the artifact.
- **All criteria pass but agent output is poor**: Gate criteria check structure, not quality. A structurally valid artifact may still be poorly written. Use your judgment.
