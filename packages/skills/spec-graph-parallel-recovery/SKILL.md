---
name: spec-graph-parallel-recovery
description: Guide failure attribution and targeted recovery when parallel execution fails. Covers precise attribution, targeted retry, and auto-degradation.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

# spec-graph-parallel-recovery

## Steps

1. Identify failure: `spec-graph diagnose --json`
2. Attribute to specific sub-agent
3. Plan recovery based on attribution:
   - **Cannot attribute** → degrade to serial
   - **failureCount >= 3** → degrade to serial
   - **Single task failed** → retry that specific task
   - **Multiple tasks (<=3)** → retry all blamed tasks
   - **Too many tasks (>3)** → retry entire wave

## Conservative

- When in doubt, add the dependency (prefer serial over wrong parallel)
- Preserve completed work in main during degradation
