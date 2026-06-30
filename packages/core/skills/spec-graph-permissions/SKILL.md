---
name: spec-graph-permissions
description: "Manage automation permissions for AI agents. Three levels (full-auto / semi-auto / manual), per-role tool/file scopes, and IDE agent config sync (.claude/settings.json + .opencode.json). Use when configuring what spec-graph run / dispatch can auto-execute."
---

# spec-graph permissions

管理 AI agent 的自动化权限 — 项目级 + sub-agent 级,可同步到 IDE 配置。

## Architecture Principle

**spec-graph 是权限策略载体 — 不替你判断该信任谁。**

- ❌ spec-graph 不会评估「这个 agent 该不该有 write 权限」
- ❌ spec-graph 不会自动选择 level(由用户/agent 决定)
- ❌ spec-graph 不会绕过 preset(只支持三个预设,custom 需手编 YAML)
- ✅ spec-graph 只把 preset 写到 `permissions.yaml` 并可选 sync 到 IDE
- ✅ spec-graph 强制分层:项目级(run 能跑什么) + agent 级(sub-agent 能用什么工具)

**Agent 职责**:判断当前环境适合哪个 level → 配置 → sync 到 IDE 让规则真正生效。

## What this does

两级权限模型:

### 1. Project-level(项目级)

控制 `spec-graph run` 自动执行的动作:

- `auto_execute` — 哪些动作可以不经询问自动跑(transition / run_check / produce_artifact 等)

### 2. Sub-agent-level(agent 级)

每个 agent role 的:

- `auto_approve_tools` — 自动批准的工具(Read/Write/Edit/Bash)
- `file_scope.read` / `file_scope.write` — 文件读写白名单
- `enabled` — 是否启用该 role

## Permission Levels(三个 preset)

| Level | auto_execute | agent tools | 适用场景 |
|-------|--------------|-------------|---------|
| `full-auto` | 全部动作自动 | 所有工具 | 受控 CI / sandbox / 完全信任的 agent |
| `semi-auto` (默认) | checks + transitions | Read/Write/Edit/Bash(安全命令) | 日常开发,需要人审 produce_artifact |
| `manual` | 不自动执行任何动作 | Read-only | 谨慎审查 / 学习阶段 / 高风险项目 |
| `custom` | (手编 YAML) | (手编) | 需要精细控制时 |

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `show` | 显示当前权限配置(默认) |
| `set --level <level>` | 切换到某个 preset |
| `list-agents` | 列出所有注册的 agent roles |
| `sync` | 写出 `.claude/settings.json` 和 `.opencode.json` |

## Agent Roles(内置)

| Role | 职责 | 典型 action |
|------|------|-------------|
| `spec-author` | 生产 artifact | produce_artifact |
| `quality-runner` | 跑 check | run_check |
| `traceability-reviewer` | 校验 trace | verify_trace |
| `governance-reviewer` | 解决违规 | resolve_violation |
| `workflow-operator` | 推进 transition | transition |
| `stage-agent` | 整阶段执行 | perform_stage + 上述全部 |

## Usage

```bash
# 显示当前权限
spec-graph permissions show
spec-graph permissions show --json

# 切换 preset
spec-graph permissions set --level full-auto
spec-graph permissions set --level semi-auto   # 默认
spec-graph permissions set --level manual

# 列出 agent roles
spec-graph permissions list-agents

# 同步到 IDE 配置(覆盖 .claude/settings.json + .opencode.json)
spec-graph permissions sync
spec-graph permissions sync --force   # 已存在则覆盖
```

### Options

| Option | For | Description |
|--------|-----|-------------|
| `--level <level>` | set | `full-auto` / `semi-auto` / `manual` |
| `--force` | sync | 覆盖已存在的 IDE 配置文件 |
| `--json` | show / list-agents | JSON 输出 |

## Execution Rules

### ✅ 应该用 permissions 的场景

| 场景 | 推荐操作 |
|------|---------|
| 项目初始化后定权限基调 | init 时设 `--permission-level`,或事后 `set` |
| 切到 CI / 容器环境 | `set --level full-auto` + `sync` |
| 切到本地谨慎开发 | `set --level semi-auto`(默认) |
| 团队成员 onboard,想让 IDE 强制规则 | `permissions sync --force` |
| 想知道有哪些 role 可调 | `list-agents` |

### ❌ 不应该用 permissions 的场景

| 场景 | 替代做法 |
|------|---------|
| 改单个工具的允许/拒绝 | 直接编辑 `permissions.yaml`(custom level) |
| 改文件白名单 | 编辑 `permissions.yaml` 的 `file_scope` |
| 改 pack 行为 | 编辑 pack 或 `pack-overrides.yaml` |
| 控制单个 change 的策略 | 在 change descriptor 里加 metadata,不动 permissions |

## Agent Workflow

```
1. 判断环境
   - CI / sandbox / fully-trusted agent → full-auto
   - 本地开发 + 人工 review → semi-auto
   - 谨慎 / 高风险 / 调试 → manual
   ↓
2. spec-graph permissions set --level <level>
   ↓
3. spec-graph permissions show --json  (agent 自检)
   ↓
4. spec-graph permissions sync --force  (让 IDE 也吃这套规则)
   - 写出 .claude/settings.json (Claude Code 权限)
   - 写出 .opencode.json (OpenCode 权限)
   ↓
5. (可选) commit 这两个文件,团队共享规则
```

### 关键纪律

- **set 不会自动 sync** — IDE 配置只在 `sync` 时落地,改完别忘了 sync
- **full-auto 有风险** — 仅在受控环境用,不要在本地主仓库留 full-auto
- **custom 必须手编** — preset 是黑盒,要精细控制只能直接改 YAML

## Usage Scenarios

### Scenario 1: 初始化时定权限(默认 semi-auto)

```bash
spec-graph init --stack typescript --build spa \
  --permission-level semi-auto \
  --sync-agent-config
# init 时一并写入 IDE 配置
```

### Scenario 2: 切到 CI 全自动

```bash
# CI runner 里
spec-graph permissions set --level full-auto
spec-graph permissions sync --force
# 之后 spec-graph run 可自动 transition + 跑 check + produce_artifact
```

### Scenario 3: 团队 onboard,统一 IDE 规则

```bash
# 项目根
spec-graph permissions set --level semi-auto
spec-graph permissions sync --force
git add .claude/settings.json .opencode.json
git commit -m "chore: sync spec-graph permissions"
# 团队成员 pull 后自动吃到同样规则
```

### Scenario 4: 临时切到 manual 调试

```bash
spec-graph permissions set --level manual
# 现在每个动作都需要确认,适合排查问题
# 调试完切回
spec-graph permissions set --level semi-auto
spec-graph permissions sync
```

### Scenario 5: 查看 agent 配置

```bash
spec-graph permissions list-agents
# 输出表格:Agent / Status / Auto-Approve Tools
```

### Scenario 6: 失败 — 用了不存在的 level

```bash
$ spec-graph permissions set --level aggressive
✗ Invalid level: aggressive
Valid: full-auto, semi-auto, manual, custom
# 修复:用三选一,custom 需手编 YAML
```

### Scenario 7: 失败 — custom 走不通 set

```bash
$ spec-graph permissions set --level custom
Custom level must be configured by editing .spec-graph/permissions.yaml directly.
# 修复:直接编辑 YAML,然后 sync
```

### Scenario 8: 失败 — sync 不覆盖

```bash
$ spec-graph permissions sync
  - .claude/settings.json (skipped: already exists)
# 修复:加 --force
spec-graph permissions sync --force
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Project not initialized` | 未 init | `spec-graph init` |
| `Missing --level option` | set 没传 level | 加 `--level <x>` |
| `Invalid level: <x>` | level 拼错 | 用 full-auto/semi-auto/manual/custom |
| `Custom level must be configured...` | custom 不支持 CLI | 直接编辑 `permissions.yaml` |
| `skipped: already exists`(sync) | 已有 IDE 配置 | 加 `--force` 覆盖 |

## 衔接关系

- **前置**: `spec-graph init`(permissions.yaml 在 init 时生成)
- **与 init 协同**: `init --permission-level` / `init --sync-agent-config` 一步到位
- **被读取方**: `spec-graph run`(读 auto_execute)/ `dispatch`(读 agent_actions / file_scope)
- **下游 sync**: `permissions sync` → `.claude/settings.json` + `.opencode.json`
- **与 hooks 互补**: permissions 管「能不能做」,hooks 管「做完触发什么」
- **custom 升级路径**: preset 不够用时直接改 `permissions.yaml`,然后 `sync`
