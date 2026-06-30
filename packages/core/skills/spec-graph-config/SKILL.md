---
name: spec-graph-config
description: "Manage project-level runtime config (.spec-graph/config.yaml). Inject context (tech stack, conventions), per-artifact validation rules, and external references into compose and dispatch. spec-graph does NOT invent config — agent fills context/rules/references and re-composes."
---

# spec-graph config

管理项目级运行时配置,把项目上下文 / 校验规则 / 外部引用注入到 spec-graph 工作流中。

## Architecture Principle

**spec-graph 是中立配置容器 — 不发明上下文,不解释规则。**

- ❌ spec-graph 不会自动探测技术栈(那是 sense / agent 的职责)
- ❌ spec-graph 不会校验 rules 内容的语义(只存只传)
- ❌ spec-graph 不会自动 re-compose(改完 config 必须手动跑 `compose`)
- ✅ spec-graph 只把 `context` / `rules` / `references` 三个 section 注入 pack context
- ✅ spec-graph 强制三段式 schema,未知 section 直接拒绝

**Agent 职责**:读取项目实际信息 → 决定哪些值写入 config → 改完触发 re-compose。

## What this does

`.spec-graph/config.yaml` 是项目级覆盖配置,被 compose / dispatch 读取,用于:

- **context** — 注入到 pack context.md(例如 tech_stack、conventions、domain_terms)
- **rules** — 按 artifact id 给出的校验指引(soft guidance,非强制 schema)
- **references** — 外部链接(设计文档、API 规范、ticket 等)

config 不直接驱动状态机,它只是「写一次,pack/dispatch 多处读」的共享上下文。

### Config 结构

```yaml
version: "1"
context:
  tech_stack: "React 18 + TypeScript + Vite"
  conventions: "kebab-case 文件名,优先函数组件"
  domain_terms: "SKU / GMV / settlement"
rules:
  requirement/prd: "必须包含非功能性指标"
  design/arch: "必须画时序图,不可只写文字"
references:
  design_doc: "https://wiki.example.com/design"
  ticket: "JIRA-1234"
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `show` | 显示当前 config(默认) |
| `init` | 创建模板 config(含 TODO 占位符) |
| `set <section>.<key>=<value>` | 写入单个键值(支持逗号分隔多对) |
| `clear` | 删除整个 config 文件 |

## Usage

```bash
# 查看当前配置
spec-graph config show
spec-graph config show --json

# 创建模板(若已存在会提示,不覆盖)
spec-graph config init

# 单条写入
spec-graph config set context.tech_stack="React 18 + TS"
spec-graph config set rules.requirement/prd="必须含 AC + NFR"

# 多条同时写入(逗号分隔)
spec-graph config set context.tech_stack="TS",context.conventions="kebab-case"

# 删除配置(慎用 — 触发 re-compose)
spec-graph config clear
```

### Options

| Option | Description |
|--------|-------------|
| `<k>=<v>` pairs (位置参数) | `set` 的键值对,逗号分隔多对,值可加引号 |
| `--json` | `show` 输出 JSON(便于 agent 解析) |

### set 语法细节(从源码)

- section 必须是 `context` / `rules` / `references`,否则跳过并 warn
- key 不能含 `.`(只支持一层 section.key)
- 值前后引号会被自动剥除:`"value"` → `value`
- 不存在的 config 会自动创建空壳再写入

## Execution Rules

### ✅ 应该用 config 的场景

| 场景 | 写到哪个 section |
|------|-----------------|
| 项目技术栈信息 | `context.tech_stack` |
| 命名 / 文件 / 代码风格约定 | `context.conventions` |
| 业务领域术语 | `context.domain_terms` |
| 某 artifact 必须满足的额外校验 | `rules.<artifact-id>` |
| 外部设计文档 / wiki / ticket 链接 | `references.<key>` |

### ❌ 不应该用 config 的场景

| 场景 | 替代做法 |
|------|---------|
| 探测项目实际栈 | `spec-graph sense` |
| 修改 pack 模板 | 编辑 `packs/<pack>/` 或 `pack-overrides.yaml` |
| 改权限模型 | `spec-graph permissions set` |
| 改 hooks | 编辑 `.spec-graph/hooks.yaml` |
| 改命令(stack-specific 命令) | 编辑 `.spec-graph/commands.yaml` |

## Agent Workflow

```
1. 读项目(package.json / README / 已有文档)
   ↓
2. 判断:有哪些信息是 pack / dispatch 反复需要的?
   - 例:tech stack / 命名约定 / 领域术语 / 关键 wiki 链接
   ↓
3. spec-graph config init (首次) 或 config show (确认现状)
   ↓
4. spec-graph config set context.xxx="..." rules.yyy="..."
   (批量 set 用逗号分隔)
   ↓
5. spec-graph config show --json  (agent 自检写入正确)
   ↓
6. spec-graph compose  (重新构建 graph,注入新 context)
   ↓
7. (可选) spec-graph dispatch --json (让新 context 流到下一轮 manifest)
```

### Agent 关键纪律

- **改完必须 re-compose** — config 改了不 compose,pack 拿到的还是旧 context
- **不要写空话** — `context.tech_stack="TODO"` 比不写更糟,模板里的 TODO 必须替换
- **rules 是软指引** — 真正的强制校验在 gate / check,不要把硬规则塞进 rules

## Usage Scenarios

### Scenario 1: 初始化技术栈上下文

```bash
# 首次配置
spec-graph config init
# 生成模板,带 TODO 占位符

# 替换 TODO
spec-graph config set context.tech_stack="Node 20 + Express + PostgreSQL"
spec-graph config set context.conventions="snake_case DB 列,camelCase TS 变量"

# 重新构建图
spec-graph compose
```

### Scenario 2: 加入命名 / 风格约定(团队规范)

```bash
spec-graph config set \
  context.conventions="文件 kebab-case,组件 PascalCase,禁止 default export"

spec-graph compose
# pack context 现在带这条约定,produce_artifact 时 agent 会读到
```

### Scenario 3: 为某 artifact 加软校验指引

```bash
# 要求 PRD 必须含 NFR
spec-graph config set rules.requirement/prd="必须含性能 + 安全 NFR 段落"

spec-graph compose
# dispatch manifest 的 document_guidance 会带这条 hint
```

### Scenario 4: 引用外部设计文档

```bash
spec-graph config set \
  references.design_doc="https://wiki/foo/design", \
  references.ticket="JIRA-1234"

spec-graph compose
```

### Scenario 5: CI 中机器读取(JSON)

```bash
spec-graph config show --json | jq '.context.tech_stack'
# 便于 agent / CI 校验配置正确性
```

### Scenario 6: 失败 — 错误的 section

```bash
$ spec-graph config set permissions.level="full-auto"
⚠ Unknown section 'permissions' (must be context|rules|references)
# 修复:权限用 spec-graph permissions set --level full-auto
```

### Scenario 7: 失败 — 改完忘 compose

```bash
$ spec-graph config set context.tech_stack="Python 3.11"
✓ Set context.tech_stack = Python 3.11
# 但 dispatch 出来的 manifest 还是旧 context
# 修复:
spec-graph compose
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `No project config found` | 未 init | `spec-graph config init` |
| `Project config already exists` | init 时已存在 | 直接编辑文件或 `config set` |
| `Unknown section '<x>'` | section 不是三选一 | 改成 context/rules/references |
| `Skipping pair without section` | 写成 `key=value` 而非 `section.key=value` | 加 section 前缀 |
| `Skipping malformed pair` | 缺 `=` | 用 `key=value` 格式 |

## 衔接关系

- **前置**: `spec-graph init`(必须有 .spec-graph/)
- **写入后**: 必须 `spec-graph compose` 才能让 pack/dispatch 读到新 context
- **被读取方**: compose (注入 pack context) / dispatch (写入 manifest.document_guidance)
- **互补**: `sense` 探测事实,`config` 固化结论;`profile.yaml` 是维度声明,`config.yaml` 是文本上下文
- **不变性**: config 不驱动状态机,只影响文档生成质量
