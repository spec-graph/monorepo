---
name: spec-graph-install
description: "Install spec-graph skills into IDE project (Claude Code / Cursor / OpenCode / GitHub Copilot). Copies SKILL.md files and optionally bootstraps (init + compose + prime) and installs git hooks. Use when onboarding a new project or sharing skills with team."
---

# spec-graph install

把 spec-graph skills 安装到 IDE 项目目录,可选 bootstrap 和 git hooks 集成。

## Architecture Principle

**spec-graph install 是文件复制器 + 可选引导 — 不修改 graph / state。**

- ❌ install 不会自动选择 IDE(可自动检测,但用户应确认)
- ❌ install 不会覆盖既有 skills(除非 `--force`)
- ❌ install 不会替你写 profile(那是 init 的事)
- ✅ install 把 `skills/*/SKILL.md` 复制到 IDE 期望的目录
- ✅ install `--quick` 可串联 init + compose + prime
- ✅ install `--git-hooks` 装上 pre-commit gate 检查 + post-commit 追踪

**Agent 职责**:新项目起手 → install → init → compose → prime → 开始工作流。

## What this does

### Step 1: 检测 / 选择 IDE

自动检测顺序:

1. 有 `.claude/` → `claude-code`
2. 有 `.cursor/` → `cursor`
3. 有 `.opencode.json` → `opencode`
4. 默认 → `claude-code`

可用 `--ide` 强制指定。

### Step 2: 定位 skills 源

按顺序找:

1. `__dirname/../../skills`(dist 构建)
2. `__dirname/../skills`(src 开发)
3. `process.cwd()/skills`

### Step 3: 复制 skills

把每个 `skills/<name>/SKILL.md`(及其目录)复制到目标 IDE 目录。

### Step 4: 可选 bootstrap(`--quick`)

调 `init --quick`,内部跑: init → compose → prime --bootstrap。

### Step 5: 可选 git hooks(`--git-hooks`)

装到 `.git/hooks/`:

- **pre-commit** — 跑 `spec-graph gate`,失败阻止 commit
- **post-commit** — 日志记录 commit(供追溯)

## IDE 目录映射

| IDE | skill 目录 |
|-----|-----------|
| Claude Code | `.claude/skills/` |
| Cursor | `.agents/skills/` |
| OpenCode | `.agents/skills/` |
| GitHub Copilot | `.agents/skills/` |

## Usage

```bash
# 自动检测 IDE,装到当前项目
spec-graph install

# 强制 IDE
spec-graph install --ide claude-code
spec-graph install --ide cursor
spec-graph install --ide opencode
spec-graph install --ide github-copilot

# 装到指定项目目录
spec-graph install --target ~/projects/my-app

# 一键 bootstrap(install + init + compose + prime)
spec-graph install --quick \
  --description "My app" \
  --permission-level semi-auto

# 装完同时装 git hooks
spec-graph install --git-hooks

# 全量(装 skills + bootstrap + hooks)
spec-graph install --quick --git-hooks --description "..."

# 覆盖已存在的 skills
spec-graph install --force

# JSON 输出
spec-graph install --json
```

### Options

| Option | Description |
|--------|-------------|
| `--ide <name>` | 强制 IDE(claude-code/cursor/opencode/github-copilot) |
| `--target <dir>` | 目标项目目录(默认当前) |
| `--quick` | bootstrap:init + compose + prime |
| `--force` | 覆盖已存在的 skills 目录 |
| `--git-hooks` | 安装 pre-commit / post-commit hooks |
| `--description <text>` | 传给 init(`--quick` 模式) |
| `--permission-level <level>` | 传给 init(默认 semi-auto) |
| `--sync-agent-config` | 传给 init(同步 IDE agent 配置) |
| `--json` | JSON 输出 |

## Execution Rules

### ✅ 应该用 install 的场景

| 场景 | 操作 |
|------|------|
| 新项目首次接入 spec-graph | `install --quick --git-hooks` |
| 团队成员 onboard | `install`(pull 仓库后跑) |
| 切换 IDE(从 Claude 到 Cursor) | `install --ide cursor --force` |
| 升级 spec-graph 后更新 skills | `install --force` |
| CI 环境配置 | `install --quick --json` |

### ❌ 不应该用 install 的场景

| 场景 | 替代做法 |
|------|---------|
| 改单个 skill 内容 | 直接编辑 `.claude/skills/<name>/SKILL.md` |
| 已 init 的项目重新 init | `spec-graph init --force` |
| 仅同步权限配置 | `spec-graph permissions sync` |
| 改 git hooks 内容 | 手编 `.git/hooks/*` |

## Agent Workflow

### 标准新项目起手

```
1. cd /path/to/new-project
   ↓
2. spec-graph install --quick --git-hooks \
     --description "项目描述" \
     --permission-level semi-auto
   ↓
   - 检测/选择 IDE
   - 复制 skills/* 到 .claude/skills/
   - 跑 init --quick(compose + prime)
   - 装 .git/hooks/pre-commit + post-commit
   ↓
3. 验证:
   spec-graph show       # 看 graph 结构
   spec-graph dashboard  # 看初始状态
   ↓
4. 开始工作流:
   spec-graph change create --title "..." --type feature
```

### 仅装 skills(不 bootstrap)

```
1. spec-graph install
   ↓ (只复制 skills)
2. spec-graph init --stack X --build Y
3. spec-graph compose
4. spec-graph prime --bootstrap
```

## Usage Scenarios

### Scenario 1: 新项目一键起手

```bash
mkdir my-app && cd my-app
git init

spec-graph install --quick --git-hooks \
  --description "E-commerce platform" \
  --permission-level semi-auto

# 输出:
# ✓ spec-graph skills installed
#   IDE: Claude Code
#   Target: .claude/skills
#   Skills installed: 37
#   ⚡ Quick mode: running init...
#   🔗 Installing git hooks...
#   ✓ Git hooks installed
```

### Scenario 2: 团队 onboard

```bash
# 新成员 pull 仓库后
git clone repo && cd repo

spec-graph install
# 把 .claude/skills/* 装好
# (graph.yaml / profile.yaml 已 commit,无需 re-compose)

spec-graph dashboard  # 直接看状态
```

### Scenario 3: 切换 IDE

```bash
# 从 Claude Code 切到 Cursor
spec-graph install --ide cursor --force
# 覆盖安装到 .agents/skills/
```

### Scenario 4: CI 自动化(JSON)

```bash
# .github/workflows/setup.yml
- run: |
    npx spec-graph install --json > install-result.json
    # 解析 installed 数,失败则 exit
    jq '.skills_installed | length' install-result.json
```

### Scenario 5: 只装 git hooks(已装 skills)

```bash
spec-graph install --git-hooks
# 不传 --quick,只装 hooks
# ✓ Git hooks installed
```

### Scenario 6: 失败 — 未在 git repo 装 hooks

```bash
$ spec-graph install --git-hooks
  Git hooks skipped: Not a git repository
# 修复:先 git init
git init
spec-graph install --git-hooks
```

### Scenario 7: 失败 — skills 已存在(不覆盖)

```bash
$ spec-graph install
  All skills already installed. Use --force to overwrite.
# 修复:确认要覆盖
spec-graph install --force
```

### Scenario 8: 失败 — quick bootstrap 失败

```bash
$ spec-graph install --quick
  ✓ skills installed
  ⚡ Quick mode: running init...
  Quick bootstrap skipped: Missing required parameter: --stack
# 修复:init 需要 stack,补上
spec-graph install --quick --description "..." # 还不够
# 或分开跑:
spec-graph install
spec-graph init --stack typescript --build spa --quick
```

### Scenario 9: 失败 — 未找到 skills 源

```bash
$ spec-graph install
✗ Could not locate spec-graph skills directory.
Ensure spec-graph is properly installed.
# 修复:
# 1. 检查 spec-graph 是否正确装(npm list spec-graph)
# 2. 用 npm 装到全局或本地
# 3. 或手动设 cwd 到含 skills/ 的目录
```

### Scenario 10: 失败 — 未知 IDE

```bash
$ spec-graph install --ide vim
Unknown IDE: vim
Supported IDEs: claude-code, cursor, opencode, github-copilot
# 修复:用四选一
```

## Git Hooks 内容

### pre-commit(阻止不合规 commit)

```sh
echo "🔍 Running spec-graph gate checks..."
npx spec-graph gate --json > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ spec-graph gate check failed. Fix issues before committing."
  exit 1
fi
echo "✓ spec-graph gate check passed"
```

### post-commit(日志追溯)

```sh
COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)
echo "✓ Commit $COMMIT_SHA: $COMMIT_MSG"
```

> 注:hooks 是基础模板,可手动编辑 `.git/hooks/pre-commit` 加自定义逻辑。

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Unknown IDE: <x>` | ide 拼错 | 用四选一 |
| `Could not locate spec-graph skills directory` | 安装不完整 | 重装 spec-graph,或 cd 到含 skills/ 的目录 |
| `All skills already installed` | 已存在不覆盖 | 加 `--force` |
| `Not a git repository`(hooks) | 未 git init | 先 `git init` |
| `Quick bootstrap skipped: Missing --stack` | quick 模式缺 init 参数 | 分开跑 install + init |

## 衔接关系

- **首次接入**: install 是 spec-graph 进入项目的入口
- **下游**: install --quick 自动调 init → compose → prime
- **权限同步**: install 不直接 sync permissions,但 `--sync-agent-config` 会透传给 init
- **与 hooks**: `--git-hooks` 装 `.git/hooks/`,但 `.spec-graph/hooks.yaml`(spec-graph 内部 hooks)是另一回事
- **更新 skills**: spec-graph 版本升级后,跑 `install --force` 更新 SKILL.md
- **团队共享**: 把 `.claude/skills/` commit 到 repo,新成员 pull 后即可用(也可选择不 commit,每人自跑 install)
- **典型链路**: install --quick --git-hooks → change create → dispatch loop → complete → archive
