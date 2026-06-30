---
name: spec-graph-dispatch
description: "Generate an agent dispatch manifest for the next workflow action. Creates a manifest with 20+ fields including distilled context, constitution principles, codebase summary, active change, template refs, and document guidance. spec-graph is a neutral engine — does NOT execute, only generates the manifest. AI agent (coordinator) is responsible for executing the manifest."
---

# spec-graph dispatch

为下一步工作流动作生成 agent dispatch manifest。

## Architecture Principle

**spec-graph 是中立引擎 — 只生成 manifest,不执行。**

- ❌ spec-graph 不会自己 dispatch sub-agent
- ❌ spec-graph 不会执行 `npm test` / artifact completion
- ❌ spec-graph 不会替你判断"这个 artifact 该写什么内容"
- ✅ spec-graph 只读取 graph + state,生成结构化 manifest
- ✅ manifest 包含 sub-agent 需要的全部上下文(identity / prompt / input artifacts / template / doc guidance)
- ✅ manifest 还包含 `next_step` — 告诉 coordinator 完成后该跑什么命令推进工作流

**Agent (coordinator) 的职责**:读 manifest → dispatch sub-agent → 等 status-report → 跑 `next_step` → 重新 dispatch(loop)。

详见 `packs/foundation.pack/agents/coordinator-protocol.md`。

## What this does

生成结构化 manifest,供 AI agent (Claude Code / Codex 等) 消费。manifest 从 next plan 计算而来,加上 trace-graph 上下文和治理数据。

### Manifest fields (20+)

| Field | Description |
|-------|-------------|
| `version` / `created_at` | Manifest 元信息 |
| `current_stage` / `next_stage` | 工作流当前/目标阶段 |
| `transition` / `blocking_gate` | 阶段转换 / 阻塞 gate |
| `gate_passed` | 当前 gate 是否通过 |
| `missing_artifacts` / `failed_checks` / `missing_traces` | Gate 失败详情 |
| `missing_contracts` / `forbidden_violations` | 合约漂移 / 禁止项违反 |
| `artifact_statuses` | 所有 artifact 状态快照(用于识别 ready / blocked) |
| `done` | 工作流是否完成 |
| `actions[]` | 工作动作数组(详见下方) |
| `codebase_summary` | 项目可读摘要(来自 profile.meta.description) |
| `active_change` | 当前 change 上下文(title / type / priority / audit log) |
| `constitution_principles` | 活跃的宪法原则(质量阈值 / 条款 / 必需 trace) |
| `project_config` | 项目级配置 context / rules / references |

### Action fields (每个 action)

| Field | Description |
|-------|-------------|
| `index` / `type` / `id` / `description` | 动作基本信息 |
| `requires_sub_agent` | 是否需要 sub-agent(true: LLM 工作;false: 确定性命令) |
| `agent_id` / `agent_prompt_ref` / `model_tier` | 从 Agent Registry 查找的绑定 |
| `recommended_command` | 完成动作后跑的命令 |
| `next_step` | coordinator 完成后跑什么(自动 loop) |
| `template_ref` | produce_artifact 时指向模板文件 |
| `suggested_doc_path` | 建议的文档写入路径 |
| `document_guidance` | 文档应包含的内容指引 |
| `input_artifacts[]` | 该 action 的输入 artifacts(已解析路径) |
| `distilled_context` | 通过 trace graph BFS 蒸馏出的最小上下文 |
| `meeting` | 该 action 触发的 meeting(如果有) |
| `check_command` | run_check 时的实际 shell 命令 |
| `trace_query` | verify_trace 时缺失的 trace 查询 |
| `agent_role` / `file_scope` / `allowed_tools` / `prompt` | 权限和提示词 |

## Usage

```bash
# 显示下一步 dispatch(人类可读)
spec-graph dispatch

# 包含所有当前建议的 actions(可能不止一个)
spec-graph dispatch --all

# 写到文件
spec-graph dispatch -o manifest.yaml

# JSON 输出(hook 注入用,主 agent 用这个)
spec-graph dispatch --json
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | 包含所有当前 suggested actions(默认只取第一个) |
| `-o, --output <file>` | 写入 YAML 文件 |
| `--json` | JSON 输出 |

## Execution Rules

### ✅ When to use

- **prime 之后**: 查看下一步该做什么
- **完成一个 action 后**: 重新 dispatch 看下一步(AUTO-LOOP 纪律)
- **不确定下一步时**: "what do I do now?" 的回答
- **sub-agent 完成工作后**: 验证状态并触发下一个 action
- **CI / 自动化**: 通过 hook 注入 manifest 让 coordinator 自动执行

### ❌ When NOT to use

- **想看整体进度**: 用 `spec-graph status`(更全的 dashboard)
- **想看具体下一步阻塞项**: 用 `spec-graph next`(更聚焦)
- **工作流已完成**: `done: true` 时 dispatch 也会显示完成,无意义
- **想执行确定性命令**: 用 `spec-graph run`(自动跑 check / transition)

### AUTO-LOOP 纪律(重要)

参考 `CLAUDE.md` 中的工作协议:

```
spec-graph dispatch --json
    ↓ hook 注入 manifest
    ↓ 立即读取 actions[0]
    ↓ sub-agent dispatch (via Agent tool)
    ↓ 等 status-report (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
    ↓ 跑 actions[0].next_step
    ↓ 立即重新 spec-graph dispatch --json —— 不等用户确认
```

**停止条件**:
- `manifest.done === true`
- gate blocked 且无法自动修复
- sub-agent BLOCKED

## Agent Workflow: Coordinator Loop

### Step 1: 读 manifest

```bash
spec-graph dispatch --json
```

解析 JSON,关注:
- `done`: 是否完成?
- `gate_passed`: 当前 gate 是否通过?
- `actions[0]`: 第一个动作(默认只 dispatch 一个)

### Step 2: 判断 action 类型

```
if action.requires_sub_agent === true:
    → 需要 sub-agent (LLM 工作)
    → 读 agent_prompt_ref 加载 system prompt
    → 读 input_artifacts[] 加载输入文档
    → 用 Agent tool dispatch sub-agent
else:
    → 确定性命令(coordinator 直接 Bash 运行)
    → 跑 action.recommended_command 或 action.check_command
```

### Action 类型对照

| Type | requires_sub_agent | Coordinator 行为 |
|------|-------------------|------------------|
| `produce_artifact` | true | dispatch sub-agent,生成文档写入 `suggested_doc_path` |
| `perform_stage` | true | dispatch sub-agent,完成整个阶段工作 |
| `resolve_violation` | true | dispatch sub-agent,修复 forbidden 违反 |
| `run_check` | false | 直接 Bash 跑 `action.check_command` |
| `verify_trace` | false | 创建 trace(用 `spec-graph trace add` 或等 artifact 完成自动 wire) |
| `transition` | false | 直接 Bash 跑 `action.command`(状态机转换) |

### Step 3: 执行 action

**Sub-agent dispatch 模板** (manifest 中的 `prompt` 字段已包含):

```
1. 加载 agent system prompt (从 agent_prompt_ref 路径读)
2. 填充 task context (current_stage / blocking_gate / action description)
3. 注入 input artifacts (读 input_artifacts[].path 并粘贴内容)
4. 注入 project config (context / rules / references)
5. 注入 constitution principles (质量阈值)
6. dispatch via Agent tool
7. 等 sub-agent 返回 status-report
```

### Step 4: 推进工作流

sub-agent 完成后,跑 `actions[0].next_step`:

```bash
# next_step 通常是:
# spec-graph artifact complete <id> && spec-graph dispatch --json
# 或
# spec-graph check --id <id> && spec-graph dispatch --json
```

### Step 5: 立即重新 dispatch(LOOP)

```bash
spec-graph dispatch --json
# 重复 Step 1-5,直到 done 或 blocked
```

## Meeting 处理

如果 `action.meeting` 存在,说明该 action 触发了一个 meeting:

- `meeting.runtime === null`: 全新 meeting,需要 coordinator 启动
- `meeting.runtime.is_continuation === true`: 进行中,继续下一轮
- `meeting.runtime.status === "completed"`: 已完成,直接进入 next_step
- `meeting.runtime.status === "abandoned"`: 已废弃,需决策(重启 or escalate)

详见 `packs/foundation.pack/agents/meeting-protocol.md`。

## Usage Scenarios

### Scenario 1: 标准工作流循环

```bash
spec-graph dispatch --json
# 解析 manifest,actions[0] 是 produce_artifact 'requirement/prd'
# dispatch sub-agent 生成 PRD
# sub-agent 返回 DONE
spec-graph artifact complete requirement/prd --producer agent
spec-graph dispatch --json     # 自动 loop
# 下一个 action...
```

### Scenario 2: 确定性 action(coordinator 直接跑)

```bash
spec-graph dispatch --json
# actions[0] 是 run_check 'lint',requires_sub_agent=false
# coordinator 直接跑: npm run lint
# 跑成功后:
spec-graph check --id lint && spec-graph dispatch --json
```

### Scenario 3: 触发 meeting

```bash
spec-graph dispatch --json
# actions[0].meeting 存在,触发 design-review meeting
# coordinator 按 meeting protocol 调度多个 sub-agent 讨论
# 讨论完成后:
spec-graph meeting complete design-review
spec-graph dispatch --json
```

### Scenario 4: 工作流完成

```bash
spec-graph dispatch --json
# manifest.done === true
# 输出: "Workflow is complete. No dispatch needed."
# 停止 loop
```

### Scenario 5: 失败 — graph 不存在

```bash
$ spec-graph dispatch
✗ Graph not found. Run `spec-graph compose` first.
# 修复: spec-graph init --stack X (init 内含 compose + prime)
# 或如果 .spec-graph/ 已存在: spec-graph compose && spec-graph prime
```

### Scenario 6: 失败 — gate blocked 无法自动修复

```bash
spec-graph dispatch --json
# gate_passed: false
# missing_artifacts: ['design/architecture']
# forbidden_violations: ['security/no-hardcoded-secrets']
# action: resolve_violation (需要 sub-agent 修复)
# → dispatch sub-agent 修复
# → 完成后重新 dispatch
```

### Scenario 7: hook 注入失败

```bash
$ spec-graph dispatch --json
✗ Pre-dispatch hook failed: <command>
# 修复: 检查 .spec-graph/hooks.yaml 中 dispatch.pre hook 配置
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found` | 未 compose | `spec-graph compose` |
| Pre-dispatch hook failed | hook 脚本失败 | 检查 `.spec-graph/hooks.yaml` |
| No active change | 没有 in_progress change | `spec-graph change apply <id>` |
| Ambiguous active change | 多个 in_progress change | 先 complete/archive 其中一些 |
| Empty actions | 工作流完成或卡死 | 检查 `done` 字段,或运行 `spec-graph status` |

## 衔接关系

- **前置**: `spec-graph prime`(必须有机器状态)
- **后续**: sub-agent 执行 + `spec-graph artifact complete` / `spec-graph check` + 重新 dispatch
- **配套查看**: `spec-graph status`(整体进度)、`spec-graph next`(聚焦下一步)
- **执行版本**: `spec-graph run`(自动跑确定性 action,sub-agent action 仍需手动 dispatch)
- **审计**: 每次 dispatch 会写入 active change 的 `audit_log`
- **协议**: `packs/foundation.pack/agents/coordinator-protocol.md`
