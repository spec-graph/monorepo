---
name: spec-graph-meeting
description: "Multi-agent meeting protocol with structured rounds (diverge → challenge → converge), dynamic convergence, and expert invite. Supports ad-hoc meetings (agent-initiated) and pack-declared meetings. spec-graph is a neutral facilitator — it does NOT contribute opinions or decide who is right. The agent (coordinator) records contributions, advances rounds, and synthesizes the convergence summary."
---

# spec-graph meeting

多 agent 协作讨论协议 — 结构化会议与收敛。

## Architecture Principle

**spec-graph 只 facilitator,不参与讨论。**

- ❌ spec-graph 不会替你发表观点
- ❌ spec-graph 不会替你判断"谁对谁错"
- ❌ spec-graph 不会替你做收敛总结
- ✅ spec-graph 管理会议状态(not_started / in_progress / completed / abandoned)
- ✅ spec-graph 按轮次推进(diverge → challenge → converge)
- ✅ spec-graph 记录每次 contribution(statement / question / challenge / refinement / synthesis)
- ✅ spec-graph 保存完整 transcript 供审计

**Agent 的职责**:作为 coordinator 发起会议、邀请专家、记录发言、推进轮次、综合收敛总结。

## Ad-hoc Meeting 原则(来自 CLAUDE.md)

> 遇到不确定的问题,主 agent 可自行发起 meeting。
> **宁可多开会,不要瞎猜。讨论后仍不确定则 escalate to user。**

## 会议生命周期

```
not_started → in_progress → completed
                  │
                  └──→ abandoned (中途放弃)
```

## 轮次与 Phase(4 种)

默认轮次模板:`diverge → challenge → converge`(动态可扩展)。

| Phase | 目标 | 典型贡献类型 |
|-------|------|-------------|
| `diverge` | 分享初始观点,广开思路 | statement, question |
| `challenge` | 质疑假设,相互挑战 | challenge, question |
| `converge` | 综合对齐,形成共识 | synthesis, refinement |
| `deep_dive` | (扩展)深入某个具体子问题 | statement, refinement |

**动态收敛**: agent 可以根据讨论质量判断是否提前 complete,或扩展更多轮次(超过 declared templates 时重复最后 phase)。

## Contribution 类型

| Type | 含义 | 典型 phase |
|------|------|-----------|
| `statement` | 陈述观点/事实 | diverge, deep_dive |
| `question` | 提问 | 任何 phase |
| `challenge` | 挑战他人观点 | challenge |
| `refinement` | 优化他人观点 | converge, deep_dive |
| `synthesis` | 综合多方观点 | converge |

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | 列出所有 declared meetings(graph 中的) |
| `show <id>` | 显示会议详情 + runtime |
| `init <id>` | 发起 ad-hoc 会议 |
| `record <id>` | 记录一次 contribution |
| `advance <id>` | 推进到下一轮 |
| `complete <id>` | 完成会议(写收敛总结) |
| `abandon <id>` | 放弃会议(保留部分 transcript) |

## Usage

```bash
# 发起 ad-hoc 会议
spec-graph meeting init architecture-review \
  --purpose "Decide between REST and GraphQL for new API" \
  --participants "architect:scalability,backend-engineer:implementation-perspective,pm:developer-experience"

# 记录发言
spec-graph meeting record architecture-review \
  --participant architect \
  --type statement \
  --content "GraphQL reduces over-fetching but adds server complexity" \
  --targets "backend-engineer"

spec-graph meeting record architecture-review \
  --participant backend-engineer \
  --type challenge \
  --content "REST with OpenAPI gives equivalent DX without runtime query parsing overhead"

# 推进到下一轮(challenge phase)
spec-graph meeting advance architecture-review

# 完成(写收敛总结)
spec-graph meeting complete architecture-review \
  --summary "Decision: REST + OpenAPI. Reasoning: lower runtime cost, team familiarity." \
  --open-questions "How to handle nested resource expansion efficiently?" \
  --output-artifacts "design/api-decision.md"
```

### Options

| Option | For | Description |
|--------|------|-------------|
| `--purpose <text>` | init | 会议目的(必填) |
| `--participants <list>` | init | 参与者(逗号分隔,`agent_id:perspective` 格式,必填) |
| `--description <text>` | init | 会议描述 |
| `--min-rounds <n>` | init | 最少轮次(默认 1) |
| `--max-rounds <n>` | init | 最多轮次(默认 5) |
| `--output-artifacts <list>` | init | 预期产出 artifact(逗号分隔) |
| `--participant <agent>` | record | 发言者(必填) |
| `--type <type>` | record | statement / question / challenge / refinement / synthesis(必填) |
| `--content <text>` | record | 发言内容(必填) |
| `--targets <list>` | record | 针对的参与者(逗号分隔,可选) |
| `--summary <text>` | complete | 收敛总结(必填) |
| `--open-questions <list>` | complete | 未解决问题(`|` 分隔) |
| `--output-artifacts <list>` | complete | 实际产出 artifact(逗号分隔) |
| `--reason <text>` | abandon | 放弃原因(必填) |
| `--json` | (any) | JSON 输出 |

## Execution Rules

### ✅ 何时发起 meeting

| 情况 | 触发 |
|------|------|
| 多方意见冲突,无法自行决定 | `meeting init` |
| 架构决策有多个候选方案 | `meeting init` |
| 用户提出深层需求,需要专家视角 | `meeting init` |
| 任何"瞎猜不如讨论"的场景 | `meeting init` |
| pack 声明的 meeting 被 dispatch 触发 | 自动 record |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 单一明确的需求 | `spec-graph change create` |
| 想问用户简单问题 | 直接问 |
| 想看当前进度 | `spec-graph status` |
| 想做代码 review | `spec-graph worktree submit` + reviewer |

## Agent Workflow(协调者视角)

### Step 1: 判断是否需要 meeting

```
遇到问题
    ↓
能自行决定?
    ├── 是(明确需求/有先例) → 直接做
    └── 否(多方视角/架构决策)
            ↓
        meeting init
```

### Step 2: 发起会议(选好参与者与视角)

```bash
spec-graph meeting init <id> \
  --purpose "<具体问题>" \
  --participants "expert1:perspective1,expert2:perspective2,..."
```

**参与者格式**: `agent_id:perspective`,例如:
- `architect:scalability-concerns`
- `security-engineer:threat-modeling`
- `pm:user-experience`
- `backend-engineer:implementation-feasibility`

### Step 3: 第一轮 — diverge

```bash
# 每个参与者陈述初始观点
spec-graph meeting record <id> --participant architect \
  --type statement --content "..."
spec-graph meeting record <id> --participant security-engineer \
  --type statement --content "..."
```

### Step 4: 推进到 challenge

```bash
spec-graph meeting advance <id>
# phase: diverge → challenge

# 参与者相互挑战
spec-graph meeting record <id> --participant backend-engineer \
  --type challenge \
  --content "..." \
  --targets "architect"
```

### Step 5: 推进到 converge

```bash
spec-graph meeting advance <id>
# phase: challenge → converge

# 综合与精炼
spec-graph meeting record <id> --participant architect \
  --type synthesis \
  --content "..."
```

### Step 6: 完成(写收敛总结)

```bash
spec-graph meeting complete <id> \
  --summary "<决策与理由>" \
  --open-questions "<未解决项,用 | 分隔>" \
  --output-artifacts "<产出文档>"
```

### Step 7: 根据结论行动

- 形成明确决策 → 创建 change 推进
- 仍有未解决问题 → `escalate to user`

## Usage Scenarios

### Scenario 1: 标准架构决策会议

```bash
spec-graph meeting init api-style-decision \
  --purpose "Decide REST vs GraphQL for v2 API" \
  --participants "architect:scalability,backend:implementation,pm:dx,frontend:consumption"

# Round 1 (diverge)
spec-graph meeting record api-style-decision --participant architect \
  --type statement --content "GraphQL minimizes over-fetching"
spec-graph meeting record api-style-decision --participant backend \
  --type statement --content "REST is simpler to cache and debug"
spec-graph meeting record api-style-decision --participant pm \
  --type statement --content "Mobile clients prefer GraphQL"

# Round 2 (challenge)
spec-graph meeting advance api-style-decision
spec-graph meeting record api-style-decision --participant backend \
  --type challenge --content "GraphQL N+1 problem" --targets "architect,pm"

# Round 3 (converge)
spec-graph meeting advance api-style-decision
spec-graph meeting record api-style-decision --participant architect \
  --type synthesis --content "REST + OpenAPI, with BFF for mobile"

# 完成
spec-graph meeting complete api-style-decision \
  --summary "REST + OpenAPI for core API; BFF layer for mobile aggregation" \
  --open-questions "BFF technology choice|caching strategy"
```

### Scenario 2: 简短决策(2 轮收敛)

```bash
spec-graph meeting init naming-convention \
  --purpose "camelCase vs snake_case for new module" \
  --max-rounds 2 \
  --participants "architect:consistency,backend:ergonomics"

spec-graph meeting record naming-convention --participant architect \
  --type statement --content "camelCase matches existing codebase"
spec-graph meeting advance naming-convention
spec-graph meeting record naming-convention --participant backend \
  --type synthesis --content "camelCase, document exception for DB columns"
spec-graph meeting complete naming-convention --summary "camelCase adopted"
```

### Scenario 3: 深度子问题需要 deep_dive

```bash
# 主会议进行到 converge,但某个子问题需要深入
spec-graph meeting advance <id>  # 超过 declared templates,重复最后 phase 或扩展
# (agent 可以手动多 record 几轮 deep_dive 性质的贡献)
```

### Scenario 4: 中途放弃

```bash
$ spec-graph meeting abandon architecture-review \
    --reason "Requirements changed mid-discussion, no longer relevant"
⚠ Abandoned meeting architecture-review: Requirements changed...
   Partial transcript retained at: .spec-graph/meetings/architecture-review.yaml
```

### Scenario 5: escalate to user(讨论后仍不确定)

```bash
# 会议完成但 open_questions 非空
spec-graph meeting complete <id> \
  --summary "Two viable options, no consensus" \
  --open-questions "Final pick between Option A and Option B"

# agent 看到非空 open_questions → escalate to user
# "Meeting completed but these questions remain unanswered. Could you decide?"
```

### Scenario 6: pack-declared meeting(自动触发)

```bash
# 某些 pack 在特定 stage 会声明 meeting
# dispatch 工作流触发时,自动进入 in_progress
# agent 只需 record + advance + complete
spec-graph meeting list  # 看哪些 declared
spec-graph meeting show <id>  # 看 runtime 状态
spec-graph meeting record <id> --participant <agent> --type statement --content "..."
```

### Scenario 7: 失败 — 重复 init

```bash
$ spec-graph meeting init existing-meeting --purpose "..." --participants "..."
✗ Meeting 'existing-meeting' already exists (ad-hoc).
To re-init, delete the runtime file first or use a different id.

# 修复:换 id,或删除 runtime 文件
spec-graph meeting init new-meeting --purpose "..." --participants "..."
```

### Scenario 8: 失败 — 未 in_progress 就 record

```bash
$ spec-graph meeting record nonexistent --participant x --type statement --content "..."
✗ Meeting 'nonexistent' not found.
# 修复: 先 init
spec-graph meeting init nonexistent --purpose "..." --participants "..."
```

### Scenario 9: 失败 — 已 complete 还想 record

```bash
$ spec-graph meeting record <id> --participant x --type statement --content "..."
✗ Meeting <id> is not in_progress (status: completed). Cannot record.
# 修复: 会议已结束,如需追加讨论,开新 meeting
```

### Scenario 10: 失败 — 缺参数

```bash
$ spec-graph meeting init my-meeting
✗ --purpose required.

$ spec-graph meeting init my-meeting --purpose "..."
✗ --participants required (comma-separated agent_ids or expert roles).
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Meeting '<id>' already exists` | id 冲突 | 换 id,或删除 runtime 文件 |
| `Meeting '<id>' not found` | record/advance/complete 时 id 错误 | `meeting list` 查正确 id;ad-hoc 用 `init` 创建 |
| `Meeting is not in_progress` | complete 后再操作 | 开新 meeting |
| `--purpose required` | init 缺参数 | 补 `--purpose` |
| `--participants required` | init 缺参数 | 补 `--participants` |
| `--summary required` | complete 缺收敛总结 | 补 `--summary` |
| `Invalid --type` | record 用了非法 type | 用:statement, question, challenge, refinement, synthesis |
| `Graph not found` | 未 compose | `spec-graph compose` |
| `Reached max_rounds` | 超过最大轮次 | 必须 complete 或 abandon |

## 衔接关系

- **前置**: `spec-graph init` + `spec-graph compose`(meeting 读 graph.yaml)
- **触发方式 1**: agent 主动 `meeting init`(ad-hoc)
- **触发方式 2**: pack 声明的 meeting 由 dispatch 自动触发
- **后继**: 会议产出决策 → `spec-graph change create` 推进
- **未解决问题**: open_questions 非空 → escalate to user
- **产出文档**: `--output-artifacts` 声明的文档通过 dispatch 工作流生产
- **与 dispatch 的关系**: meeting 是工作流中的协作节点,不替代 dispatch
- **审计**: meeting transcript 保存在 `.spec-graph/meetings/<id>.yaml`,complete 后不删除
