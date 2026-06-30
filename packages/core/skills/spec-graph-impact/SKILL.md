---
name: spec-graph-impact
description: "Analyze the blast radius of changes to an artifact — identify all downstream artifacts, checks, and gates affected. Uses reverse BFS over trace edges. spec-graph only computes impact — does NOT modify artifacts (unless --mark-stale). AI agent is responsible for interpreting results and deciding whether to proceed. Use during planning, before edits, or to detect stale downstream artifacts."
---

# spec-graph impact

分析 artifact 变更的下游影响范围(blast radius)。

## Architecture Principle

**spec-graph 只算影响 — 不替你决策。**

- ❌ spec-graph 不会替你判断"这个影响大不大,要不要做"
- ❌ spec-graph 不会自动修改下游 artifact(除非 `--mark-stale`)
- ❌ spec-graph 不会替你回滚变更
- ✅ spec-graph 通过反向 BFS 算出直接 + 传递依赖
- ✅ spec-graph 列出受影响的 checks 和 gates
- ✅ spec-graph 可选地把受影响 artifact 标记为 `stale`(`--mark-stale`)

**Agent 的职责**:读 impact 结果,判断严重性,决定是否继续变更,是否需要更新下游 artifact。

## What this does

`impact` 命令计算修改某个 artifact 会影响什么:

1. 读取 `.spec-graph/graph.yaml`(若不存在,提示先 `compose`)
2. 验证 artifact 存在于 graph 中
3. 调用 `analyzeImpact()`:
   - **直接依赖**(1 hop):trace edges 中 `from === source` 的所有 `to`
   - **传递依赖**(all hops):BFS 遍历整条下游链
   - **受影响 checks**:当前实现保守地把 graph 中**所有 checks** 都列入(注释里写未来会改成显式 check→artifact 依赖)
   - **受影响 gates**:扫描 `gate.require_checks`,凡包含受影响 check 的 gate 都列入
4. 格式化输出(direct / transitive / checks / gates 四段)
5. (可选)`--mark-stale` 把所有受影响 artifact 在 `machine-state.yaml` 标记为 `stale`

### 反向 BFS 算法

```
source artifact
    ↓
findDirectDependencies(source):
    遍历 trace edges,找 from === source 的所有 to
    ↓
computeTransitiveClosure(source):
    queue = [source]
    while queue 非空:
        current = queue.shift()
        for dep in findDirectDependencies(current):
            if not visited: result.push(dep), queue.push(dep)
    return result (去重)
```

### "受影响 checks" 的当前行为

⚠ **重要**:当前实现把 graph 中**所有 checks** 都标记为受影响(保守策略)。源码注释明确写:

> For now, we assume all checks might be affected by any artifact change.
> In the future, we could add explicit check -> artifact dependencies.

因此 `affectedChecks` 段在大多数情况下会列出全部 checks。`affectedGates` 段会基于这些 checks 推导出大部分 gates。

## Usage

```bash
# 基本用法:分析某 artifact 的下游影响
spec-graph impact --artifact plan/tasks

# 标记下游为 stale(写入 machine-state.yaml)
spec-graph impact --artifact design/arch --mark-stale

# JSON 输出(便于程序化处理)
spec-graph impact --artifact plan/tasks --json
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--artifact <id>` | ✅ Required | 要分析影响的 artifact ID(必须存在于 graph) |
| `--mark-stale` | ⚠️ Optional | 把受影响 artifact 在 `machine-state.yaml` 标记为 `stale` |
| `--json` | ⚠️ Optional | JSON 输出 |

## 输出结构

### Terminal 输出

```
Analyzing impact of changes to: plan/tasks

## Impact Analysis: plan/tasks

### Direct Dependencies (2)
- design/auth
- contract/auth-api

### Transitive Dependencies (3)
- implementation/auth-service
- verification/auth-test
- change-record/auth-history

### Affected Checks (5)
- check-requirements-traceability
- check-design-consistency
- check-plan-ac-clear
- check-contract-stability
- check-test-coverage

### Affected Gates (3)
- specify→design
- design→plan
- plan→implement

⚠ Marked 3 artifact(s) as stale.    (仅 --mark-stale 时)

⚠ Total impact: 13 downstream item(s)
```

### JSON 输出结构

```json
{
  "source": "plan/tasks",
  "directDependencies": ["design/auth", "contract/auth-api"],
  "transitiveDependencies": ["implementation/auth-service", "..."],
  "affectedChecks": ["check-...", "..."],
  "affectedGates": ["specify→design", "..."]
}
```

## Execution Rules

### ✅ 何时使用

| 情况 | 是否运行 impact |
|------|----------------|
| 计划修改某 artifact | ✅ 强烈推荐(评估 blast radius) |
| 评估 profile_patch 的影响 | ✅ 必须用(配合 `change sync`) |
| 大型 refactor 前 | ✅ 必须用 |
| migration 规划阶段 | ✅ 必须用(找出所有受影响下游) |
| artifact 频繁 stale,想知道根因 | ✅ 用 impact 找上游源头 |
| gate 反复失败,追溯根因 | ✅ 用 impact 找上游 |
| 想批量标记下游 stale | ✅ 用 `--mark-stale` |

### ❌ 何时不使用

| 情况 | 替代做法 |
|------|---------|
| 想看 artifact 在 graph 中的位置 | `spec-graph visualize` |
| 想看上游(谁依赖我) | 当前 impact 算的是下游;上游需手动查 graph |
| 想 trace artifact 的来源 | `spec-graph trace` |
| 想看当前进度 | `spec-graph status` |
| 想批量重置状态 | `spec-graph machine update` |

### 判断流程

```
准备修改某 artifact
    ↓
运行 impact 评估
spec-graph impact --artifact <id>
    ↓
解读结果:
    - Direct deps 多吗?(直接影响范围)
    - Transitive deps 多吗?(连锁反应)
    - Affected gates 多吗?(会卡多少过渡)
    ↓
影响可接受吗?
    ├── 是 → 继续修改
    │       ↓
    │       修改完成后,标记下游 stale:
    │       spec-graph impact --artifact <id> --mark-stale
    │       ↓
    │       下游会通过 dispatch 重新生成
    │
    └── 否(影响太大)
            ↓
            召开 meeting 讨论:
            spec-graph meeting init <topic> \
              --purpose "Impact of <id> change too large" \
              --participants "..."
            ↓
            或拆分为多个小 change
```

## Agent Workflow

### Step 1: 确认 graph 存在

```bash
ls .spec-graph/graph.yaml
# 若不存在:
spec-graph compose
```

### Step 2: 找到 artifact ID

```bash
# 列出所有 artifacts
spec-graph compose --json | jq '.artifacts[].id'

# 或在 graph.yaml 中找
cat .spec-graph/graph.yaml | grep "id:"
```

### Step 3: 运行 impact 分析

```bash
spec-graph impact --artifact <id>

# 解读输出:
# - Direct Dependencies: 直接下游(必查这些是否需要更新)
# - Transitive Dependencies: 传递下游(连锁影响)
# - Affected Checks: 当前保守策略下基本是全部
# - Affected Gates: 哪些过渡会被卡
```

### Step 4: Agent 判断严重性

基于结果判断:

| 严重性 | 信号 | 建议 |
|--------|------|------|
| 🟢 低 | direct ≤ 2, transitive = 0 | 直接修改,无需 meeting |
| 🟡 中 | direct 3-5 或 transitive ≤ 5 | 修改前 review,可能拆分 |
| 🔴 高 | direct > 5 或 transitive > 5 或卡多个 gate | 必须 meeting,考虑拆分为多 change |

### Step 5: (修改后)标记下游 stale

```bash
# 修改完 source artifact 后,把所有下游标记为 stale
spec-graph impact --artifact <id> --mark-stale

# 输出:
# ⚠ Marked 3 artifact(s) as stale.
# (machine-state.yaml 中这些 artifact 的 status 变为 'stale')
```

### Step 6: 通过 dispatch 重新生成下游

stale 的 artifact 会在下次 dispatch 时被识别为需要更新:

```bash
spec-graph dispatch --json
# manifest 会包含重新生成下游 artifact 的 actions
```

### Step 7: 验证影响已消解

```bash
# 重跑 impact,看下游是否都更新了
spec-graph impact --artifact <id>

# 跑 doctor 确认 graph 一致
spec-graph doctor
```

## Usage Scenarios

### Scenario 1: 成功 — 修改 design 前评估影响

```bash
# 准备改 design/auth,先看影响
spec-graph impact --artifact design/auth

# 输出:
# Direct Dependencies (3): plan/auth, contract/auth-api, ...
# Transitive Dependencies (5): implementation/*, verification/*
# Affected Gates (2): design→plan, plan→implement

# 解读:影响中等(3 direct + 5 transitive)
# 决定:可以改,但要同步更新 3 个直接下游
```

### Scenario 2: 成功 — 用 --mark-stale 标记下游重做

```bash
# 刚修改了 requirements/prd(范围扩大)
spec-graph impact --artifact requirements/prd --mark-stale

# 输出:
# ⚠ Marked 7 artifact(s) as stale.
# ⚠ Total impact: 15 downstream item(s)

# 7 个下游 artifact 在 machine-state 中变为 stale
# 下次 dispatch 会触发它们重新生成
spec-graph dispatch --json
```

### Scenario 3: 成功 — JSON 输出用于脚本

```bash
# 想程序化处理 impact(如生成报告)
spec-graph impact --artifact plan/tasks --json > impact.json

# 提取直接下游
jq '.directDependencies' impact.json
# ["design/auth", "contract/auth-api"]

# 统计总数
jq '{direct: (.directDependencies|length), transitive: (.transitiveDependencies|length)}' impact.json
```

### Scenario 4: 成功 — 高影响触发 meeting

```bash
spec-graph impact --artifact contract/payment-api
# Direct: 8, Transitive: 15, Gates: 5

# 影响太大,召开 meeting
spec-graph meeting init refactor-payment \
  --purpose "payment-api change has 23 downstream impacts" \
  --participants "agent:facilitator,user:decision-maker"

# 讨论后决定:拆为 3 个小 change
```

### Scenario 5: 成功 — profile_patch 影响预览

```bash
# change 声明了 profile_patch,先看影响
spec-graph change sync <change-id>
# sync 内部调用 impact 逻辑,显示 profile 变化导致的 artifact/check/gate 增减

# 若影响可接受:
spec-graph change apply <change-id>
```

### Scenario 6: 失败 — artifact 不存在

```bash
$ spec-graph impact --artifact nonexistent
✗ Artifact 'nonexistent' not found in graph.
Available artifacts:
  - requirements/prd
  - design/auth
  - plan/tasks
  - ...

# 修复:用列出的正确 ID
spec-graph impact --artifact requirements/prd
```

### Scenario 7: 失败 — graph 不存在

```bash
$ spec-graph impact --artifact plan/tasks
✗ Graph not found. Run `spec-graph compose` first.

# 修复:
spec-graph compose
spec-graph impact --artifact plan/tasks
```

### Scenario 8: 失败 — 未传 --artifact

```bash
$ spec-graph impact
✗ --artifact is required. Usage: spec-graph impact --artifact <id>

# 修复:加 --artifact 参数
```

### Scenario 9: 失败 --mark-stale 时 machine-state 缺失

```bash
$ spec-graph impact --artifact plan/tasks --mark-stale
# (输出 impact 正常,但 mark-stale 段没出现)

# 原因:machine-state.yaml 不存在或结构异常
# 修复:
spec-graph prime --bootstrap   # 重建 machine-state
spec-graph impact --artifact plan/tasks --mark-stale
```

### Scenario 10: 半成功 — 看到 affectedChecks 列出全部 checks

```bash
spec-graph impact --artifact plan/tasks
# Affected Checks (12) — 列出全部 checks

# 原因:当前实现保守策略,所有 checks 都列入
# 解读:这部分信号弱,主要看 Direct/Transitive Dependencies
# 未来版本会改成精确的 check→artifact 依赖
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `✗ --artifact is required` | 未传参数 | 加 `--artifact <id>` |
| `✗ Graph not found` | 未 compose | `spec-graph compose` |
| `✗ Artifact '<id>' not found in graph` | ID 错误 / artifact 未通过 dispatch 生成 | 用列出的正确 ID / 走 change 流程 |
| `--mark-stale` 无效果 | machine-state.yaml 缺失或结构异常 | `spec-graph prime --bootstrap` 重建 |
| affectedChecks 列出全部 | 当前保守策略(已知限制) | 主要参考 Direct/Transitive Dependencies |
| 影响范围异常大 | 可能 graph 中 trace edges 配置过密 | `spec-graph trace` 检查 edge 来源 |

## 衔接关系

- **前置**: `spec-graph compose`(必须有 graph.yaml)
- **依赖文件**:
  - `.spec-graph/graph.yaml`(artifacts + checks + gates)
  - `.spec-graph/traces/`(trace edges,用于反向 BFS)
  - `.spec-graph/machine-state.yaml`(仅 `--mark-stale` 时写入)
- **下游使用**:
  - `spec-graph dispatch --json` — stale artifact 触发重新生成
  - `spec-graph gate` / `spec-graph check` — 验证受影响 artifact
  - `spec-graph doctor` — 整体一致性检查
- **配合命令**:
  - `spec-graph change sync <id>` — 内部用 impact 逻辑算 profile_patch 影响
  - `spec-graph trace` — 查单个 artifact 的 trace 链
  - `spec-graph visualize --format mermaid` — 可视化 graph 看依赖
  - `spec-graph meeting init` — 影响太大时开会
- **协作**: spec-graph 算影响,agent 解读并决策,user 在高影响时拍板,dispatch 自动重生成 stale artifact。

## 注意事项

- **反向方向**: impact 算的是"我变了会影响谁"(下游),不是"我依赖谁"(上游)。查上游需手动看 graph。
- **保守 checks 策略**: 当前 affectedChecks 列出全部 checks(已知限制),主要参考 Direct/Transitive Dependencies 段。
- **mark-stale 不可逆**: 标记 stale 后,需要 dispatch 重新生成才能清除。若误标,手动编辑 machine-state.yaml。
- **不修改 artifact**: 默认情况下 impact 只读,不修改任何 artifact(仅 `--mark-stale` 写 machine-state)。
- **依赖 trace edges**: 准确性取决于 graph 中 trace edges 是否完整。若 trace 缺失,impact 会低估。
- **BFS 性能**: 大型 graph(几百 artifact)BFS 仍然快速,无需担心性能。
