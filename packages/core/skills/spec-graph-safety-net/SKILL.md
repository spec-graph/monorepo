---
name: spec-graph-safety-net
description: "Capture/compare baseline snapshot for refactoring safety. Records file hashes, exports, function signatures, test results. After refactoring, --compare detects removed exports (breaking change), added exports, changed files, test regressions. spec-graph is a neutral snapshot tool — it does NOT decide whether a regression is acceptable. The agent interprets results and decides to proceed, rollback, or fix."
---

# spec-graph safety-net

重构安全网 — 基线快照捕获与对比。

## Architecture Principle

**spec-graph 只捕获与对比,不判断"是否安全"。**

- ❌ spec-graph 不会替你判断"这个 export 删除能不能接受"
- ❌ spec-graph 不会替你修复回归
- ❌ spec-graph 不会替你回滚代码
- ✅ spec-graph 只拍快照(exports + signatures + tests + file hashes)
- ✅ spec-graph 只算 diff(removed/added exports, changed files, test delta)
- ✅ spec-graph 只在 removed_exports > 0 时返回 exit code 1(提示破坏性变更)

**Agent 的职责**:在重构前拍快照,重构后对比,根据 diff 决定如何处理。

## What this does

文件基线快照工具,用于重构前后的回归检测。每次 `spec-graph safety-net` 会:

- 扫描源码文件,提取 **exports**(每个文件的导出符号列表)
- 提取 **function signatures**(从 exports 派生)
- 运行测试套件,捕获 **test results**(passed/total)
- 计算 **file hashes**(用于检测任意文件改动)
- 写入 `.spec-graph/safety-net-snapshot.yaml`

`--compare` 模式对比当前状态与上次快照,输出:

- `removed_exports` — 删除的导出(潜在 breaking change,触发 exit 1)
- `added_exports` — 新增的导出
- `changed_files` — hash 变化的文件

## Snapshot 文件结构

```yaml
# .spec-graph/safety-net-snapshot.yaml
captured_at: 2026-06-30T...
exports:
  src/auth/login.ts: [login, logout, getSession]
  src/auth/oauth.ts: [googleLogin, githubLogin]
function_signatures:
  - "login(email, password): Promise<Session>"
  - "logout(sessionId): Promise<void>"
test_results:
  passed: 142
  total: 145
  failed: 3
file_hashes:
  src/auth/login.ts: "sha256-abc123..."
```

## Usage

```bash
# 捕获基线快照(重构前)
spec-graph safety-net

# 对比当前状态与基线(重构后)
spec-graph safety-net --compare

# JSON 输出(供脚本消费)
spec-graph safety-net --compare --json
```

### Options

| Option | Description |
|--------|-------------|
| (无) | 捕获基线快照 |
| `--compare` | 对比当前状态与已存的快照 |
| `--json` | JSON 输出(供脚本/agent 程序化消费) |

## Execution Rules

### ✅ 何时使用

| 情况 | 命令 |
|------|------|
| 大型重构开始前 | `spec-graph safety-net`(拍快照) |
| 性能优化前 | `spec-graph safety-net`(拍快照) |
| API 迁移 / signature 改动前 | `spec-graph safety-net`(拍快照) |
| 重构完成后 | `spec-graph safety-net --compare` |
| CI 中验证 PR 不引入回归 | `spec-graph safety-net --compare --json` |

### ❌ 何时不用

| 情况 | 替代做法 |
|------|---------|
| 新增功能(非重构) | `spec-graph change create --type feature` |
| 只是改 typo / 加注释 | 不需要安全网 |
| 想要自动化工作流编排 | `spec-graph dispatch --json` |
| 想要审计追踪 | `spec-graph change archive` |

## Agent Workflow

### Step 1: 重构前拍快照

```bash
# 在 change apply 后、开始改动代码前
spec-graph safety-net
# 输出:
# ✓ Baseline snapshot captured
#   Snapshot: .spec-graph/safety-net-snapshot.yaml
#   Exports: 23 files
#   Functions: 87
#   Tests: 142/145 passed
```

### Step 2: 执行重构

agent 通过 dispatch 工作流执行 refactor change,修改源码。

### Step 3: 重构后对比

```bash
spec-graph safety-net --compare
# 输出 diff:
#   Removed exports: 0
#   Added exports: 3
#   Changed files: 7
#   Tests: 145/145 passed (+3)
```

### Step 4: 根据 diff 决策

| diff 结果 | agent 行动 |
|-----------|-----------|
| removed_exports = 0, tests 全绿 | 继续 `change complete` |
| removed_exports > 0(且无意的) | 修复或 `spec-graph rollback` |
| tests 退化 | 调查原因,修复 |
| added_exports 合理 | 正常演进,继续 |

## Usage Scenarios

### Scenario 1: 标准重构流程

```bash
# 用户:"我要重构 auth 模块,把 callback 改成 async/await"
spec-graph change create --title "Refactor auth to async/await" --type refactor
spec-graph change apply <id>

# 重构前拍快照
spec-graph safety-net
# ✓ Baseline captured (87 functions, 142 tests passed)

# 通过 dispatch 工作流执行重构...
spec-graph dispatch --json

# 重构后对比
spec-graph safety-net --compare
# Removed exports: 0
# Changed files: 5
# Tests: 142/142 passed
# ✓ No regressions

spec-graph change complete <id>
```

### Scenario 2: 检测到破坏性变更

```bash
$ spec-graph safety-net --compare
❌ 2 export(s) removed — potential breaking change!
  • auth.login (was in src/auth/login.ts)
  • auth.logout (was in src/auth/login.ts)

$ echo $?
1  # exit code 1

# agent 决策:
# - 如果是有意删除 → 文档化,然后继续
# - 如果是意外删除 → 修复或 rollback
spec-graph rollback <change-id>
```

### Scenario 3: 性能优化场景

```bash
# 用户:"数据库太慢,优化查询"
spec-graph change create --title "Optimize DB queries" --type performance
spec-graph change apply <id>

# 拍基线
spec-graph safety-net
# Tests: 200/200 passed

# 优化后
spec-graph safety-net --compare
# Removed exports: 0
# Changed files: 3 (no API change, only internals)
# Tests: 200/200 passed
# ✓ Safe — proceed
```

### Scenario 4: CI 中验证 PR

```bash
# .github/workflows/ci.yml
- name: Capture baseline (on main)
  run: spec-graph safety-net

- name: Compare (on PR branch)
  run: |
    spec-graph safety-net --compare --json > diff.json
    # 如果 removed_exports > 0,exit 1,CI 失败
```

### Scenario 5: 失败 — 未拍基线就 compare

```bash
$ spec-graph safety-net --compare
⚠ No baseline snapshot found. Run `spec-graph safety-net` first to capture a baseline.

# 修复:先拍基线
spec-graph safety-net
spec-graph safety-net --compare
```

### Scenario 6: 失败 — 项目未 init

```bash
$ spec-graph safety-net
✗ Error: ...
# 修复:先 init
spec-graph init --stack typescript --build api
spec-graph safety-net
```

### Scenario 7: 失败 — 测试套件本身坏了

```bash
$ spec-graph safety-net
✗ Error: test command failed
# 修复:检查 .spec-graph/commands.yaml 的 test 命令是否正确
spec-graph config show
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `No baseline snapshot found` | 未拍基线就 `--compare` | 先跑 `spec-graph safety-net` |
| `Project not initialized` | 未 init | `spec-graph init` |
| `test command failed` | commands.yaml 配置错误 | `spec-graph config show` 检查 test 命令 |
| Exit code 1 + removed exports | 重构删除了导出 | 评估是否有意;无意则修复或 `rollback` |

## 衔接关系

- **前置**: `spec-graph init`(需要 `.spec-graph/` 和 commands.yaml)
- **典型时机**: `change apply` 之后、开始改代码之前拍快照
- **配套命令**: `spec-graph rollback`(检测到回归后回滚)
- **与 dispatch 的关系**: safety-net 不参与 dispatch 循环,是独立的回归检查工具
- **与 check 的区别**: `check` 检查 artifact 质量(机械 + 软检查),safety-net 检查代码本身有没有破坏性变更
- **归档时**: change archive 会归档 plan MD,但 safety-net 快照不会被归档(每次新 change 覆盖)
