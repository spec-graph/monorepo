---
name: spec-graph-doctor
description: "Diagnose spec-graph project health across 8 categories: init, compose, state, permissions, traces, consistency, features, env. Detects missing files, invalid YAML, orphaned state entries, misconfigured features. Auto-fixes recoverable issues (--fix). spec-graph is a neutral diagnostic — does NOT fix code or suggest architecture changes, only checks config integrity. Use as first command when joining a project, when run fails, or as CI health gate."
---

# spec-graph doctor

诊断 spec-graph 项目的健康状况和配置问题。

## Architecture Principle

**spec-graph 不修代码 — 只检查配置完整性。**

- ❌ spec-graph 不会修代码 bug
- ❌ spec-graph 不会替你写 artifact
- ❌ spec-graph 不会替你重 compose graph
- ❌ spec-graph 不会自动删 orphaned state(只报告)
- ✅ spec-graph 跨 8 个 category 机械检查文件/YAML/状态一致性
- ✅ spec-graph 区分 severity: `error`(阻塞)/ `warn`(注意)/ `ok`(健康)
- ✅ spec-graph 用 `--fix` 自动修两类可恢复问题(创建 machine-state.yaml / permissions.yaml)
- ✅ spec-graph exit code: 有 error = 1,无 error = 0

**Agent 的职责**:跑 doctor → 读 error/warn → 调用对应命令修复(compose / prime / sense / permissions)→ 重新 doctor 直到全 ok。

## What this does

跨 **8 个 category** 全面健康检查:

### 1. 📁 Project Initialization

| Check | Severity | 含义 |
|-------|----------|------|
| `init-dir` | error | `.spec-graph/` 目录存在 |
| `init-profile` | warn | `profile.yaml` 存在且 valid(含 facts) |
| `init-permissions` | warn | `permissions.yaml` 存在 |

### 2. 📐 Graph Composition

| Check | Severity | 含义 |
|-------|----------|------|
| `compose-graph` | error | `graph.yaml` 存在 |
| `compose-parse` | error | graph.yaml 是 valid YAML |
| `compose-structure` | error | 有 version / meta / pipeline_skeleton / stages |
| `compose-graph`(ok) | ok | 汇总 artifacts / checks / gates / stages 数量 |
| `compose-empty` | warn | graph 为空(没匹配到 pack) |

### 3. ⚙️ Machine State

| Check | Severity | 含义 |
|-------|----------|------|
| `state-file` | error | `machine-state.yaml` 存在 |
| `state-parse` | error | 是 valid YAML |
| `state-structure` | error | 有 `current_stage` 字段 |
| `state-structure`(ok) | ok | 汇总 stage / artifacts / checks 数量 |

### 4. 🔐 Permissions

| Check | Severity | 含义 |
|-------|----------|------|
| `perms-parse` | error | 是 valid YAML |
| `perms-level` | warn/error | 有合法的 level(`full-auto` / `semi-auto` / `manual` / `custom`) |

### 5. 🔗 Trace Files

| Check | Severity | 含义 |
|-------|----------|------|
| `traces-dir` | warn | traces/ 目录存在(若 gate 需要 trace) |
| `traces-empty` | warn | 至少有一个 trace 文件(若 gate 需要) |
| `traces-summary` | ok/warn | 汇总:valid 数 / invalid 数 / placeholder 数 |
| `trace-<file>` | warn/error | 单个 trace 文件的结构/YAML 错误 |

### 6. 🔍 Graph/State Consistency

| Check | Severity | 含义 |
|-------|----------|------|
| `consistency-orphan-artifacts` | warn | state 中有 artifact 不在 graph 中 |
| `consistency-orphan-checks` | warn | state 中有 check 不在 graph 中 |
| `consistency-missing-artifacts` | warn | graph 中有 artifact 未 seed 到 state |
| `consistency-missing-checks` | warn | graph 中有 check 未 seed 到 state |
| `consistency-stage` | error | current_stage 不在 pipeline stages 中 |
| `consistency-ok` | ok | graph 和 state 完全一致 |

### 7. 🚀 Enhanced Features

| Check | Severity | 含义 |
|-------|----------|------|
| `feat-hooks` | ok/warn | `.spec-graph/hooks.yaml` 已配置 |
| `feat-diff-select` | ok/warn | 有 check 声明 touchfiles(diff-select 启用) |
| `feat-safety-net` | ok/warn | `safety-net-snapshot.yaml` 存在 |
| `feat-constitution` | ok/warn | `constitution.yaml` 已配置 |
| `feat-config` | ok/warn | `config.yaml` 已配置 |
| `feat-scope` | ok | 有 active scope lock |

### 8. 🌍 Environment

| Check | Severity | 含义 |
|-------|----------|------|
| `env-root` | ok | `SPEC_GRAPH_ROOT` 环境变量已设置(可选) |

### 9. 🔧 Auto-Fix(仅 --fix)

`--fix` 自动修复的问题:

| Fix | 修复方式 |
|-----|---------|
| 缺 `machine-state.yaml` | 用 graph 的第一个 stage 创建空 state |
| 缺 `permissions.yaml` | 用 `semi-auto` preset 创建 |

## Usage

```bash
# 全面诊断
spec-graph doctor

# JSON 输出(供脚本/CI 消费)
spec-graph doctor --json

# 自动修复可恢复问题
spec-graph doctor --fix
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | 输出 JSON:`{ok, errors, warnings, checks}` |
| `--fix` | 自动修复缺 machine-state.yaml / permissions.yaml 的问题 |

## Output 解读

```
🏥 spec-graph Doctor

  Status: ✗ 2 error(s), 3 warning(s)

  📁 Project Initialization
    ✓ .spec-graph/ directory exists
    ✓ profile.yaml is valid
    ⚠ permissions.yaml is missing
      Run `spec-graph permissions set --level=semi-auto` to create

  📐 Graph Composition
    ✓ graph.yaml is valid (5 artifacts, 3 checks, 2 gates, 8 stages)

  ⚙️ Machine State
    ✗ machine-state.yaml is missing
      Run `spec-graph prime` to seed state

  🔍 Graph/State Consistency
    ⚠ 2 artifact(s) in graph but not seeded in state
      plan/story/x, plan/story/y. Run `spec-graph prime` to seed.

  Run `spec-graph doctor --fix` to auto-fix recoverable issues.
```

**Severity 含义**:
- ✓ ok = 健康,无需操作
- ⚠ warn = 不阻塞但有隐患,建议修复
- ✗ error = 阻塞,必须修复才能继续工作流

## 何时使用 — 判断标准

### ✅ 应该使用 doctor

| 场景 | 时机 |
|------|------|
| **第一次接触项目** | 加入现有 spec-graph 项目的第一个命令 |
| `spec-graph run` 失败 | 先 doctor 找根因 |
| `spec-graph dispatch` 失败 | 同上 |
| 修改了 profile / pack 后 | 验证没破坏配置 |
| merge 复杂 change 后 | 确认 graph/state 一致 |
| CI 健康门禁 | 定时跑或 PR check |
| 升级 spec-graph 版本后 | 验证兼容性 |
| 看到诡异错误 | 排查的第一步 |

### ❌ 不应该使用 doctor

| 场景 | 替代做法 |
|------|---------|
| 查进度 | `spec-graph status` |
| 查 gate | `spec-graph gate` |
| 跑测试 | `spec-graph check` |
| 修代码 bug | 直接读代码 + 改 |
| 查 change 状态 | `spec-graph change show <id>` |
| 重 compose graph | `spec-graph compose` |

## Agent Workflow

```
1. spec-graph doctor
   ↓
2. 读输出,识别 severity = error 的 check
   ↓
3. 对每个 error:
   ├── init-dir error → spec-graph init
   ├── init-profile warn → spec-graph sense(重新生成 profile)
   ├── init-permissions warn → spec-graph permissions set --level=semi-auto
   ├── compose-graph error → spec-graph compose
   ├── compose-parse error → 手动修 graph.yaml 的 YAML 语法
   ├── compose-structure error → 检查 profile 是否匹配 pack
   ├── state-file error → spec-graph prime (或 doctor --fix)
   ├── state-structure error → spec-graph prime (重新 seed)
   ├── perms-level error → spec-graph permissions set --level=semi-auto
   ├── consistency-stage error → 检查 graph pipeline_skeleton
   └── trace-<file> error → 修 trace YAML 或重 prime
   ↓
4. 对 warn(可选修复):
   ├── feat-hooks warn → 创建 .spec-graph/hooks.yaml(若需要)
   ├── feat-constitution warn → spec-graph constitution init
   ├── feat-safety-net warn → spec-graph safety-net(若即将重构)
   └── consistency-* warn → 重 prime 同步 state
   ↓
5. 重新 spec-graph doctor
   ↓
6. 重复 3-5 直到 Status: ✓ 0 error(s), N warning(s)
   ↓
7. 继续工作流
```

## 与 Agent 的协作关系

- **主 agent**:跑 doctor,识别错误,分派修复
- **sub-agent**:可能被分派"修 graph.yaml 语法错误"等具体任务
- **coordinator**:dispatch 前可先跑 doctor 确认环境健康
- **CI**:可作为 PR check / 定时 health monitor
- **新人 onboarding**:第一个命令,快速了解项目状态

## Auto-Fix 的能力(--fix)

```bash
$ spec-graph doctor --fix
🏥 spec-graph Doctor

  Status: ✗ 1 error(s), 1 warning(s)

  ⚙️ Machine State
    ✗ machine-state.yaml is missing
      Run `spec-graph prime` to seed state

  🔧 Auto-Fix
    ✓ 1 issue(s) auto-fixed
```

**能修**:
- 缺 `machine-state.yaml` → 用 graph 第一个 stage 创建空 state
- 缺 `permissions.yaml` → 创建 `semi-auto` preset

**不能修**(需要手动):
- graph.yaml YAML 语法错误
- graph 结构问题(缺 stages 等)
- orphaned state entries
- trace 文件错误
- profile 不完整

## Usage Scenarios

### Scenario 1: 标准健康检查(全 ok)

```bash
$ spec-graph doctor
🏥 spec-graph Doctor

  Status: ✓ 0 error(s), 0 warning(s)

  📁 Project Initialization
    ✓ .spec-graph/ directory exists
    ✓ profile.yaml is valid
    ✓ permissions.yaml exists

  📐 Graph Composition
    ✓ graph.yaml is valid (5 artifacts, 3 checks, 2 gates, 8 stages)

  ⚙️ Machine State
    ✓ machine state valid (stage: specify, 5 artifacts, 3 checks)

  🔐 Permissions
    ✓ permissions valid (level: semi-auto)

  🔗 Trace Files
    ✓ trace files: 3 valid

  🔍 Graph/State Consistency
    ✓ graph and state are consistent

  🚀 Enhanced Features
    ✓ Hooks system configured
    ✓ Diff-select active (2 checks with touchfiles, 1 periodic)
    ✓ Quality constitution configured

  All checks passed.
```

### Scenario 2: 失败 — 未 init

```bash
$ spec-graph doctor
🏥 spec-graph Doctor

  Status: ✗ 1 error(s), 0 warning(s)

  📁 Project Initialization
    ✗ .spec-graph/ directory is missing
      Run `spec-graph init` first

# 后续 category 因为没有目录都跳过
```

**修复**:
```bash
$ spec-graph init --stack typescript --build spa
$ spec-graph doctor   # 现在应该全 ok 或只有 feature warn
```

### Scenario 3: 失败 — graph 缺失

```bash
$ spec-graph doctor
  📐 Graph Composition
    ✗ graph.yaml is missing
      Run `spec-graph compose` first

  ⚙️ Machine State
    ✗ machine-state.yaml is missing
      Run `spec-graph prime` to seed state
```

**修复**:
```bash
$ spec-graph compose
$ spec-graph prime
$ spec-graph doctor
```

### Scenario 4: 失败 — graph YAML 损坏

```bash
$ spec-graph doctor
  📐 Graph Composition
    ✗ graph.yaml is invalid YAML: bad indentation of a mapping entry at line 42
```

**修复**:手动打开 `.spec-graph/graph.yaml`,修第 42 行的缩进。

### Scenario 5: 失败 — state 漂移(orphaned)

```bash
$ spec-graph doctor
  🔍 Graph/State Consistency
    ⚠ 2 orphaned artifact(s) in state (not in graph)
      plan/story/old-feature, plan/story/deprecated
    ⚠ 1 orphaned check(s) in state (not in graph)
      old-lint-check
```

**含义**:state 中引用了 graph 中已不存在的 artifact / check(通常因为重 compose 后 graph 变了)。

**修复**:
```bash
# 选项 A: 重 prime(清空 state 重建)
$ spec-graph prime

# 选项 B: 手动编辑 machine-state.yaml 删除 orphaned 条目
```

### Scenario 6: 失败 — current_stage 不在 pipeline 中

```bash
$ spec-graph doctor
  🔍 Graph/State Consistency
    ✗ current stage "implement" is not in graph pipeline stages
      Pipeline stages: propose, specify, design, plan
```

**含义**:profile 改了,graph 重 compose 后 stage 列表变了,但 state 还指向旧 stage。

**修复**:
```bash
$ spec-graph prime   # 重 seed state, current_stage 回到第一个
```

### Scenario 7: Auto-fix 修复 state

```bash
$ spec-graph doctor
  Status: ✗ 1 error(s)
  ⚙️ Machine State
    ✗ machine-state.yaml is missing

$ spec-graph doctor --fix
  🔧 Auto-Fix
    ✓ 1 issue(s) auto-fixed
  Status: ✓ 0 error(s)

# machine-state.yaml 已自动创建
```

### Scenario 8: JSON 输出(供 CI 消费)

```bash
$ spec-graph doctor --json
{
  "ok": false,
  "errors": 1,
  "warnings": 2,
  "checks": [
    {
      "id": "init-dir",
      "category": "init",
      "severity": "ok",
      "message": ".spec-graph/ directory exists"
    },
    {
      "id": "state-file",
      "category": "state",
      "severity": "error",
      "message": "machine-state.yaml is missing",
      "detail": "Run `spec-graph prime` to seed state"
    },
    ...
  ]
}
```

CI 可解析 `ok` 字段决定是否阻止部署。

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `.spec-graph/ directory is missing` | 未 init | `spec-graph init` |
| `profile.yaml is missing` | 未 sense | `spec-graph sense` |
| `permissions.yaml is missing` | 未配置 | `spec-graph permissions set --level=semi-auto` 或 `doctor --fix` |
| `graph.yaml is missing` | 未 compose | `spec-graph compose` |
| `graph.yaml is invalid YAML` | YAML 语法错 | 手动修语法 |
| `graph.yaml has structural issues` | 缺 version/meta/stages | 检查 profile 是否匹配 pack |
| `machine-state.yaml is missing` | 未 prime | `spec-graph prime` 或 `doctor --fix` |
| `current stage not in pipeline` | graph 变了 state 没更新 | `spec-graph prime` |
| `orphaned artifacts/checks` | state 漂移 | `spec-graph prime` 或手动删 |
| `trace files: N invalid` | trace YAML 错 | 修 trace 文件 |
| `trace files: N placeholder(s)` | trace 还有 `<...>` 占位 | `spec-graph artifact complete <id>` 自动 wire |
| `Invalid permission level` | level 拼错 | `spec-graph permissions set --level=semi-auto` |

## 衔接关系

- **前置**:无(doctor 是诊断工具,可在任何阶段跑)
- **数据来源**:`.spec-graph/` 下所有文件
- **修复路径**:
  - init 问题 → `spec-graph init`
  - profile 问题 → `spec-graph sense`
  - graph 问题 → `spec-graph compose`
  - state 问题 → `spec-graph prime` 或 `doctor --fix`
  - permissions 问题 → `spec-graph permissions set` 或 `doctor --fix`
  - constitution 缺失 → `spec-graph constitution init`
  - safety-net 缺失 → `spec-graph safety-net`
  - trace 问题 → 修文件或重 prime
- **被引用**:
  - CI/CD 健康门禁
  - onboarding 第一个命令
  - 调试 `run` / `dispatch` 失败的第一步
- **配合诊断**:
  - `spec-graph status`(查工作流进度)
  - `spec-graph gate`(查 gate 阻塞)
  - `spec-graph analyze`(查 artifact 一致性)
