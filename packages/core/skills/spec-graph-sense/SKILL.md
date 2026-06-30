---
name: spec-graph-sense
description: "Analyze the project repo and generate a profile. Scans 40+ signals across 22 dimensions (frameworks, languages, test tools, build tools, CI, monorepo structure, etc.) and produces a codebase summary. AI agent is responsible for reviewing the profile and freezing facts. Use when setting up a new project, when project structure changes, or before re-compose."
---

# spec-graph sense

分析项目仓库,生成 `.spec-graph/profile.yaml`。

## Architecture Principle

**spec-graph 只做仓库扫描,不做需求判断。**

- ❌ spec-graph 不会替你决定 `boundary` / `consumers` / `criticality`
- ❌ spec-graph 不会修改 README 或猜测业务意图
- ❌ spec-graph 不会将 LLM 分类结果视为"硬证据"
- ✅ spec-graph 只扫描文件,收集 40+ 信号,映射到 22 个维度
- ✅ spec-graph 强制保证:仓库硬证据优先级 > LLM 推断

**Agent 的职责**:扫描完成后,review 每一维的值,修正误判,补充人工 overrides,最后冻结 profile。

## What this does

**Sense 引擎**扫描项目目录,收集 40+ 信号:

- Package managers, frameworks (React/Vue/Next.js/Nuxt/Express), build tools (Vite/Webpack/Turbopack)
- Language detection (TypeScript, JavaScript, Python, Rust, Go)
- Test frameworks (Jest, Vitest, Mocha, Cypress, Playwright)
- Monorepo tools (Lerna, Nx, Turborepo), directory structure (components/, pages/, app/, lib/, api/)
- Linting/formatting (ESLint, Prettier)
- API schemas (OpenAPI, GraphQL, gRPC)
- Embedded configs (PlatformIO, Arduino)
- Deployment configs (Docker, K8s)
- Existing spec-graph configuration detection

将这些信号映射到 **22 个 profile 维度** (9 core + 13 enhanced):

| 维度 | 示例值 |
|------|--------|
| `has_ui` | `none`, `cli`, `gui`, `web`, `native` |
| `boundary` | `internal`, `published-api`, `published-lib` |
| `topology` | `mono`, `federated` |
| `deployment` | `process`, `package`, `binary`, `firmware`, `hosted-service` |
| `consumers` | `self`, `internal-team`, `external-public` |
| `field` | `greenfield`, `brownfield` |
| `criticality` | `prototype`, `standard`, `compliance` |
| `team` | `solo`, `small`, `multi` |
| `persistence` | `none`, `embedded-store`, `database` |
| `frameworkVersions` | Detected framework versions |
| `hasTypeScript` | TypeScript presence |
| `hasVitest` / `hasJest` / `hasCypress` / `hasPlaywright` | Test tool detection |
| `isMonorepo` / `hasNx` / `hasTurborepo` | Monorepo structure |
| `hasComponentsDir` / `hasPagesDir` / `hasAppDir` | Directory structure |
| `buildTool` | Vite, Webpack, Turbopack, etc. |

## Usage

```bash
# 基础扫描
spec-graph sense

# 写到自定义位置
spec-graph sense --output .spec-graph/profile.yaml

# 通过 --build 强制 overrides(用于初始化时未通过 init 设定的情况)
spec-graph sense --build spa,api
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path (default: `.spec-graph/profile.yaml`) |
| `--build <list>` | 通过 build targets 注入 overrides (spa/api/lib/cli/embedded) |
| `--profile-override <yaml>` | 手动 override YAML 路径 |
| `--description <text>` | 项目描述(写入 profile.meta.description,后续 dispatch 会读取) |

### Codebase summary

`profile.meta.description` 字段会被 dispatch manifest 读取并注入到 sub-agent 上下文,作为人类可读的项目摘要。**优先用 `--description` 或 init 时传入**,确保 sub-agent 拿到准确上下文。

## Execution Rules

### ✅ When to use

- **新项目初始化后**: `spec-graph init` 后第一步(或 `init --quick` 已自动跑过)
- **项目结构大改后**: 新增/移除框架、测试工具、monorepo 重组
- **re-compose 之前**: 修改 profile 前先重新 sense,获取最新事实
- **brownfield 接入**: 老项目想接入 spec-graph,sense 是入口

### ❌ When NOT to use

- **正在 in_progress 的 change 期间**: 改 profile 会让 graph 失效,中断当前工作流
- **没有先 init**: sense 会失败(找不到 `.spec-graph/` 目录,只能 `--output` 写外部)
- **仅修改一两个维度**: 直接编辑 `profile.yaml` 的 overrides 更精准,不必重跑完整 sense

## Agent Workflow: Review → Override → Freeze

spec-graph 跑完 sense 后,agent 必须做以下事情:

### Step 1: 读取并 review profile

```bash
Read .spec-graph/profile.yaml
```

逐维度检查:
- `source: repo` 的维度是硬证据,信任但 spot-check `evidence` 是否符合预期
- `source: llm` 的维度是 LLM 分类,**必须人工验证**(可能误判)
- 关注 `confidence: low` 的字段

### Step 2: 修正误判

直接编辑 `profile.yaml`:

```yaml
overrides:
  # LLM 把项目识别为 internal,但实际上是 published-api
  boundary: published-api
  # criticality 应该是 compliance,但 LLM 误判为 standard
  criticality: compliance
```

或者完整重写某个 fact:

```yaml
facts:
  criticality:
    value: compliance
    confidence: high
    source: user
    evidence: "PCI-DSS scope — payment module"
```

### Step 3: 冻结 profile

设置 `meta.reviewed_at` 标记为已 review:

```yaml
meta:
  source:
    reviewed_at: 2026-06-30T10:00:00Z
```

冻结后 compose 才会信任 profile。

### Step 4: 运行 compose

```bash
spec-graph compose --change-type feature
```

## Important rules

- Repo-detected facts (`source: repo`) 是**高置信度** — 文件扫描的硬证据
- LLM-classified facts (`source: llm`) 是**低置信度** — 必须 review
- User overrides (`source: user/override`) 永远优先于 repo/LLM 检测
- **LLM 不能降级硬证据** — 如果仓库有 `package.json` + `exports`,boundary 强制为 `published-lib` 起步

## Usage Scenarios

### Scenario 1: init 后的标准 sense

```bash
spec-graph init --stack typescript --build spa --description "..."
spec-graph sense              # 生成完整 profile
# agent review & freeze
spec-graph compose
spec-graph prime
```

### Scenario 2: brownfield 老项目接入

```bash
# 项目已有 package.json / src/ 等,但从未初始化 spec-graph
spec-graph init --stack typescript --build spa --description "..."
spec-graph sense --show-signals   # 看看检测到了哪些信号
# agent review,可能发现 LLM 把 brownfield 识别成 greenfield
# → 加 overrides: field: brownfield
spec-graph compose
```

### Scenario 3: 项目重构后重新 sense

```bash
# 之前是单体,现在改成 monorepo
spec-graph sense
# 检查 isMonorepo / topology 是否正确
# 如果 graph 已存在,需要重新 compose
spec-graph compose
spec-graph prime
```

### Scenario 4: 失败 — 没有 .spec-graph/

```bash
$ spec-graph sense
# 输出: Profile saved to: <cwd>/profile.yaml (没有写到 .spec-graph/)
# 原因: 项目未 init
# 修复: spec-graph init --stack <x> 先初始化
```

### Scenario 5: 失败 — 置信度低的字段过多

如果输出大量 `confidence: low`,说明 LLM 分类不确定,agent 必须:
1. 逐项 review evidence 字段
2. 对于无法确定的维度,直接问用户
3. 不要保留 low confidence 的值进入 compose

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Profile saved to: <cwd>/profile.yaml` (而非 `.spec-graph/`) | 项目未 init | 先 `spec-graph init` |
| Warnings: "ambiguous stack detection" | 多种 manifest 同时存在 | 用 `--build` 强制 override |
| 大量 `source: llm` 字段 | LLM 分类不确定 | agent review 并加 overrides |

## 衔接关系

- **前置**: `spec-graph init`(必须有 `.spec-graph/`)
- **后续**: `spec-graph compose`(用 profile 生成 graph)
- **快速路径**: `spec-graph init --quick` 自动跑 `init → compose → prime`
- **profile 修改后**: 必须 re-compose + re-prime 才能让 graph 反映新 profile
