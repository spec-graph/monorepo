---
name: spec-graph-diagnose
description: Diagnose the most recent gate failure in a spec-graph workflow. Shows which criteria failed, the root cause, suggested fixes, and retry status. Use when the workflow is stuck or you want to understand why a gate failed.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed.
metadata:
  author: spec-graph
  version: "2.0"
---

Diagnose the most recent gate failure.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph diagnose --session <id>` | Diagnose gate failure with root cause |
| `spec-graph submit --result '<json>'` | Re-submit after applying fix |
| `spec-graph intervene --session <id>` | Escalate if unrecoverable |

Backed by core modules: `gate-enforcement`, `recovery`

---

When spec-graph's automator hits a gate that won't pass, it produces a structured diagnosis. This skill helps you read and act on that diagnosis.

---

## Steps

### 1. Check if there's a diagnosis to inspect

```bash
spec-graph status --json
```

Look at the `recentDiagnosis` field:
- If `null`: no recent failure. Gating is passing. Check `blockers` for other issues.
- If non-null: proceed to step 2.

### 2. Get detailed diagnosis

```bash
spec-graph diagnose --json
```

Parse the JSON output. It contains:

```json
{
  "gateId": "proposal-structure",
  "failedCriteria": [
    {
      "id": "capabilities-enumerated",
      "reason": "No capabilities found. Expected at least 1.",
      "suggestedFix": "List your capabilities in the format: - `kebab-name`: description or - **bold-name**: description"
    }
  ],
  "retryLevel": 2,
  "similarToPrevious": true
}
```

### 3. Analyze the diagnosis

For each failed criterion:

1. **Read the `reason`** — this tells you what went wrong
2. **Check the `suggestedFix`** — this tells you how to fix it
3. **Note the `retryLevel`**:
   - 1: First retry. Simple fix likely to work.
   - 2: Second retry. Try a different approach.
   - 3: Third retry. The task may need decomposition.
   - 4: Fourth retry. Consider human intervention.

4. **Note `similarToPrevious`**:
   - `true`: Same failure as last time. The fix you tried didn't work. Try something different.
   - `false`: New or different failure. The fix you tried addressed one issue but another remains.

### 4. Take action

Based on the diagnosis:

- **Fix the artifact** according to the suggested fixes
- **Re-submit**: `spec-graph submit --result '<corrected artifact JSON>'`
- **Force-advance** (if you accept the risk): `spec-graph intervene force-advance`
- **Escalate** (if you cannot fix): tell the user what's failing and why

---

## Common failure patterns

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| `proposal-structure` failing | Missing sections | Add the required sections to proposal.md |
| `capabilities-enumerated` failing | Wrong format | Use `- \`name\`: desc` or `- **name**: desc` |
| `proposal-length` failing | Too short/long | Add/remove content to fit 200-1500 words |
| `user-stories-present` failing | No user stories | Add US-xxx section with "As a user, I want to..." |
| `scope-defined` failing | No Out of Scope | Add `## Out of Scope` section |
| `tasks-cover-design` failing | Missing coverage | Add tasks for uncovered design components |
| `all-tasks-implemented` failing | Incomplete tasks | Complete remaining tasks, mark with `- [x]` |

## Edge cases

- **No session found**: spec-graph may not have a session. Start with `spec-graph plan`.
- **diagnose returns empty**: The session exists but no gate failure has occurred. This is normal.
- **Multiple failures**: Focus on the first one. Fixing it often fixes cascading failures.
