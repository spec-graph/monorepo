---
name: spec-graph-dashboard
description: "Rich workflow dashboard: pipeline progress, artifact/check/gate status, trace coverage, active change, constitution version. Three formats (terminal / HTML / JSON). Read-only overview — spec-graph aggregates state, does NOT modify it."
---

# spec-graph dashboard

项目状态总览仪表盘 — terminal / HTML / JSON 三种格式。

## Architecture Principle

**spec-graph dashboard 是只读视图 — 不修改任何状态。**

- ❌ dashboard 不会自动 transition
- ❌ dashboard 不会跑 check / gate
- ❌ dashboard 不会改 artifact 状态
- ✅ dashboard 聚合 graph.yaml + machine-state.yaml + traces + changes 给你「一张图」
- ✅ dashboard 是 CI / 团队同步 / session 起手的快照工具

**Agent 职责**:在 session 起手 / 关键节点 / CI 跑 dashboard,基于实际状态决策下一步。

## What this does

聚合以下数据源:

- `graph.yaml` — artifacts / checks / gates / tracks / pipeline
- `machine-state.yaml` — 当前 stage / artifact 状态 / check 状态
- `traces/` — trace 覆盖率(总边数 vs 已满足)
- `changes/` — 当前 active change
- `constitution.yaml` — 版本和 principles 数量

渲染内容:

- **Pipeline 进度条** — 当前在哪个 stage(stages 用方块/菱形表示)
- **Stats summary** — artifact / check / gate / trace 完成率(带百分比条)
- **Artifact grid** — 按 kind 分组的状态
- **Gate evaluation** — passed / blocked gate,blocked 时列出缺什么
- **Active change** — 当前 change 的 title / type / priority
- **Constitution** — 版本 + principles 数

### 三种输出格式

| Format | 用途 |
|--------|------|
| **terminal**(默认) | 本地开发,box-drawing + 颜色 |
| **HTML**(`--html`) | 团队共享 / 浏览器查看 / 嵌入文档 |
| **JSON**(`--json`) | CI / 程序化处理 / 自定义渲染 |

## Usage

```bash
# 默认 terminal 仪表盘
spec-graph dashboard

# 生成 HTML 文件(默认写到 .spec-graph/dashboard.html)
spec-graph dashboard --html

# 自定义 HTML 输出路径
spec-graph dashboard --html -o reports/dashboard.html
spec-graph dashboard --html --output /abs/path/dashboard.html

# JSON 输出
spec-graph dashboard --json
spec-graph dashboard --json | jq '.stats'
```

### Options

| Option | Description |
|--------|-------------|
| `--html` | 生成 HTML 文件(不输出到 terminal) |
| `-o, --output <file>` | HTML 输出路径(默认 `.spec-graph/dashboard.html`) |
| `--json` | JSON 输出(忽略 --html) |

## Execution Rules

### ✅ 应该用 dashboard 的场景

| 场景 | 格式 |
|------|------|
| Session 起手,看项目当前在哪 | terminal |
| dispatch 前确认有没有阻塞 | terminal |
| CI 跑完出报告 | HTML(`-o reports/`) |
| 团队站会 / 同步进度 | HTML 分享链接 |
| 程序化解析状态(脚本 / agent) | JSON |
| PR 描述里贴个进度图 | HTML |

### ❌ 不应该用 dashboard 的场景

| 场景 | 替代做法 |
|------|---------|
| 想改 artifact 状态 | `spec-graph artifact complete` |
| 想推 transition | `spec-graph machine transition` |
| 想看具体 change 细节 | `spec-graph change show <id>` |
| 想看完整图结构 | `spec-graph show` 或 `visualize` |
| 想看 trace 链路 | `spec-graph trace <id>` |

## Agent Workflow

```
1. session 起手:
   spec-graph dashboard
   ↓
2. 读输出:
   - 当前 stage?
   - 哪些 gate 阻塞?缺什么 artifact / check?
   - trace 覆盖率?
   - 有没有 active change?
   ↓
3. 基于状态决策:
   - 阻塞 → spec-graph dispatch --json 看下一步 action
   - 多个 in_progress → spec-graph change list 整理
   - gate 失败 → spec-graph gate / check 修复
   ↓
4. (CI / 团队共享):
   spec-graph dashboard --html -o reports/dashboard.html
   spec-graph dashboard --json > reports/state.json
```

## Usage Scenarios

### Scenario 1: 本地 session 起手

```bash
spec-graph dashboard
# 看到:
#   ╔ spec-graph Dashboard — my-project ╗
#   ▸ Pipeline: implement
#   ■ → ■ → ■ → ◆ → □ → □
#   ▸ Progress:
#     Artifacts  8/15 (53%)
#     Checks     5/8 (63%)
#     Gates      4/7 (57%)  ← 有阻塞
#     Traces     12/20 (60%)
#   ▸ Active change: add-user-auth (feature, high)
```

### Scenario 2: CI 出 HTML 报告

```bash
# .github/workflows/ci.yml
- run: npx spec-graph dashboard --html -o reports/dashboard.html
- uses: actions/upload-artifact@v3
  with:
    name: spec-graph-dashboard
    path: reports/dashboard.html
```

### Scenario 3: 程序化检查(脚本 / agent)

```bash
state=$(spec-graph dashboard --json)
passed_gates=$(echo "$state" | jq '.stats.passed_gates')
total_gates=$(echo "$state" | jq '.stats.total_gates')

if [ "$passed_gates" -lt "$total_gates" ]; then
  echo "Blocked gates, cannot release"
  exit 1
fi
```

### Scenario 4: 团队站会同步

```bash
spec-graph dashboard --html
# 写到 .spec-graph/dashboard.html
# commit + push,团队访问 repo 查看可视化进度
```

### Scenario 5: PR 描述贴状态

```bash
spec-graph dashboard --json | jq '{
  stage: .current_stage,
  artifacts: .stats.completed_artifacts,
  gates_passed: .stats.passed_gates
}'
# 复制到 PR 描述
```

### Scenario 6: 失败 — 未 compose

```bash
$ spec-graph dashboard
✗ Not composed. Run `spec-graph compose` first.
# 修复:
spec-graph compose
spec-graph dashboard
```

### Scenario 7: 失败 — 未 init

```bash
$ spec-graph dashboard
Error: ... (profile/graph not found)
# 修复:
spec-graph init --stack X --build Y
spec-graph compose
spec-graph dashboard
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Not composed` | graph.yaml 不存在 | `spec-graph compose` |
| `Error: profile not found` | 未 init | `spec-graph init` |
| HTML 写入失败 | 路径父目录不存在 | 自动 mkdir,或换绝对路径 |
| JSON 解析错(管道) | dashboard 报错混入 | 单独跑 `dashboard --json` 验证 |

## 衔接关系

- **前置**: `init` → `compose`(必须有 graph.yaml)
- **数据源**: graph.yaml / machine-state.yaml / traces/ / changes/ / constitution.yaml
- **互补关系**:
  - `dashboard` = 一张图总览(状态 + 进度)
  - `show` = graph 结构(artifacts/checks/gates 声明,不含运行时状态)
  - `visualize` = 图可视化(DOT/Mermaid,侧重拓扑)
  - `status` = 当前工作流位置和 next action
- **下游用途**: CI / 团队同步 / PR 描述 / agent 决策依据
- **只读保证**: dashboard 不写任何文件(除了 HTML 输出本身)
