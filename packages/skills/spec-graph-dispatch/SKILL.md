---
name: spec-graph-dispatch
description: Run the spec-graph workflow via dispatch + hook. Each dispatch --json produces a manifest; the spec-graph hook dispatch CLI injects a system-reminder; the main agent dispatches sub-agents via Agent tool; submit records results. Loop 9 stages until state = completed. Use when the user wants to run the full spec-graph workflow after confirming a plan.
license: MIT
compatibility: Requires spec-graph CLI (v3+) installed and dispatch hook registered (spec-graph init).
metadata:
  author: spec-graph
  version: "3.1"
---

Run the spec-graph workflow through 9 stages: specify → specs → design → tasks → implement → review → test → accept → integrate.

spec-graph is a declaration engine — it generates dispatch manifests but never invokes agents. The PostToolUse hook (`spec-graph hook dispatch`) bridges spec-graph and the main agent: each `dispatch --json` triggers a system-reminder that instructs the main agent to dispatch sub-agents via the Agent tool.

---

## Orchestrates

| CLI Command | Purpose |
|-------------|---------|
| `spec-graph dispatch --session <id> --json` | Produce DispatchManifest for current stage |
| `spec-graph submit --session <id> --result '<json>'` | Submit sub-agent results, evaluate gate, advance state |
| `spec-graph status --session <id>` | Check current state and stage |
| `spec-graph diagnose --session <id>` | Inspect gate failure diagnosis |
| `spec-graph intervene <action>` | Manual intervention (force-advance, rollback, resume) |

Backed by core modules: `dispatch`, `automator`, `gate-enforcement`, `machine-state`

---

## Prerequisites

- spec-graph CLI v3+ installed (`spec-graph --version`)
- `.spec-graph/` directory exists (`spec-graph init` has run)
- Current session state = "running" (plan confirmed)
- PostToolUse hook registered in `.claude/settings.json` (`spec-graph init`)

---

## The Loop

Repeat the following 4-step cycle for each of the 9 stages:

```
┌─────────────────────────────────────────────────────────┐
│  Step A: spec-graph dispatch --session <id> --json      │
│  → Outputs DispatchManifest JSON                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step B: PostToolUse hook auto-triggers                   │
│  → Injects system-reminder with manifest summary        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step C: Dispatch sub-agent(s) via Agent tool           │
│  → Single action: 1 sub-agent                           │
│  → Multiple actions with same parallel_group: parallel  │
│  → Sub-agent produces artifact(s)                       │
│  → Sub-agent returns status-report JSON                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step D: spec-graph submit --session <id> --result     │
│  → Gate evaluation (pass/fail)                          │
│  → State progression (next stage)                       │
│  → machine-state update                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
                    Next stage
```

Repeat 8 times total, until `state = "completed"`.

---

## Important: FSM Stages ≠ Graph Actions

**FSM stages 和 graph actions 是两套不同的概念，通过 `dispatch` 模块映射。**

```
 FSM stages (管道)：               graph actions (能力)：
 ─────────────────────────         ─────────────────────────
 定义"什么时候做什么"               定义"agent 能做什么"
 线性顺序，强制依赖                 声明式，不强制顺序
 gate 绑定在 stage 上              agent 绑定在 action 上

 specify ──── stage ────────▶      propose  ──── action ────▶ pm agent 执行
                                   specify  ──── action ────▶ pm agent 执行

 design ───── stage ────────▶      design   ──── action ────▶ architect agent 执行
                                   contract ──── action ────▶ architect agent 执行
                                   ↑ 没有对应的 stage，但需要这个能力

 tasks ────── stage ────────▶      plan     ──── action ────▶ developer agent 执行
                                   ↑ stage 叫 tasks，action 叫 plan
                                   （v3.0 改了 stage 名，action 名保留）

 implement ── stage ────────▶      implement── action ────▶ developer agent 执行

 review ───── stage ────────▶      review   ──── action ────▶ reviewer agent 执行

 test ─────── stage ────────▶      test     ──── action ────▶ qa agent 执行

 accept ───── stage ────────▶      accept   ──── action ────▶ qa agent 执行

 integrate ── stage ────────▶      integrate── action ────▶ developer agent 执行
                                   release  ──── action ────▶ developer agent 执行
                                   archive  ──── action ────▶ pm agent 执行
                                   ↑ 有对应 action，但不在 FSM pipeline 中
                                   （事后操作，非管道阶段）
```

**dispatch 映射逻辑：**
```typescript
// packages/core/src/dispatch/index.ts
const stage = status.stage;           // 当前 FSM stage
const agentId = bindings[stage];      // agent_bindings 查找
const agent = resolveAgent(agentId);  // AgentDecl 查找
```

**⚠️ graph 有 12 个 actions，FSM 只有 8 个 stages。这是正确的设计。** 多余 bindings (propose, contract, archive, release, diagnose) 用于非管道场景 — 不要加 stage 让它们对齐，也不要删除它们。

---

## Steps

### 1. Check current state

```bash
spec-graph status --session <id> --json
```

Confirm state = "running" and stage is set. If state = "paused", run `spec-graph plan "<intent>" --confirm` first.

### 2. Dispatch the current stage

```bash
spec-graph dispatch --session <id> --json
```

The hook auto-injects a system-reminder with:
- Number of actions in this wave
- Agent ID and model tier for each action
- Meeting availability (if declared in graph): whether a meeting is available and recommended
- The next_step command to run after sub-agents return

### 3. [Optional] Initiate a meeting

If the manifest includes `meeting.available: true` and you judge the task needs multi-perspective discussion, you can initiate a meeting instead of single-agent dispatch:

```bash
spec-graph meeting init <meeting-id> --session <id>
```

**When to use:** high complexity, many capabilities, open questions, security/brownfield risks, or you detect ambiguity.

**When to skip:** simple tasks with clear requirements — default to single-agent dispatch.

See `coordinator-protocol.md` for the full decision framework and meeting protocol.

### 4. Dispatch sub-agent(s)

Based on the system-reminder:

**Single action (specify, design, tasks, review, test, accept, integrate):**
Dispatch 1 sub-agent:
```
Agent({
  description: "<agent_id> agent for <stage>",
  prompt: <manifest action prompt content>,
  model: "opus" | "sonnet" | "haiku"  // based on model_tier
})
```

**Multiple actions (implement with N capabilities):**
Dispatch N sub-agents simultaneously in a single message (parallel Agent tool calls). Each sub-agent handles one capability.

### 4. Collect results and submit

After all sub-agents return:

```bash
spec-graph submit --session <id> --result '{
  "artifacts": [
    {"path": "<stage>/<file>", "content": "..."},
    ...
  ],
  "selfCheck": {
    "acceptanceCriteriaMet": true,
    "notes": "..."
  }
}'
```

### 5. Interpret the result

```json
// Gate passed, advance to next stage:
{"advanced": true, "nextStage": "design", "done": false}

// Gate failed, diagnosis provided:
{"advanced": false, "diagnosis": {...}, "done": false}

// All stages complete:
{"advanced": true, "nextStage": null, "done": true}
```

- `advanced = true` → Continue loop (go to step 2)
- `advanced = false` → Read diagnosis, fix, retry (see Error Handling)
- `done = true` → Workflow complete! Run `spec-graph status` to confirm.

---

## Parallel Dispatch (implement stage)

When the implement stage has N capabilities:

```
Manifest:
{
  "currentStage": "implement",
  "actions": [
    {"id": "impl-cap-1", "parallelGroup": 0, ...},
    {"id": "impl-cap-2", "parallelGroup": 0, ...},
    {"id": "impl-cap-3", "parallelGroup": 0, ...}
  ]
}
```

All actions with the same `parallelGroup` are dispatched **simultaneously** via parallel Agent tool calls in a single message. Wait for all to complete before advancing.

---

## Error Handling

### Gate failure

```bash
# Read the diagnosis
spec-graph diagnose --session <id> --json
```

The diagnosis contains:
- `failedCriteria`: which criteria failed
- `suggestedFix`: what to fix
- `retryLevel`: 1-4 progressive retry level

Fix the failing artifact(s) and re-run dispatch + submit. The automator weaves the diagnosis into the next prompt automatically.

### Sub-agent returns BLOCKED

```json
{"status": "BLOCKED", "blocker": "Missing context for X"}
```

Report to the user and wait for guidance. May need `spec-graph intervene`.

### Hook didn't trigger

1. Verify `.claude/settings.json` has the hook configured:
   ```bash
   cat .claude/settings.json
   ```
2. Verify the hook script exists:
   ```bash
   cat .claude/settings.json | grep -q 'spec-graph hook dispatch' && echo OK
   ```
3. Re-register: `spec-graph init` (or `spec-graph install`)

### Max retries exhausted

After 4 failed retries per stage, the automator escalates to the user. Use `spec-graph intervene` to:
- `force-advance` — skip the gate
- `rollback` — go back to previous stage
- `modify-plan` — adjust capabilities
- `resume` — continue from current state

---

## Edge Cases

- **No active sessions**: Run `spec-graph plan "<intent>" --confirm` first
- **Multiple sessions**: Specify `--session <id>` on every command
- **Stage already completed**: submit is idempotent for completed stages
- **Empty manifest**: If current stage has no agent bindings, manifest.actions = []

---

## Success Criteria

Workflow is complete when:
- state = "completed"
- All 8 artifacts produced (proposal.md, design.md, tasks.md, code, review.md, test.md, verification.md, pr.md)
- readyForArchive = true
