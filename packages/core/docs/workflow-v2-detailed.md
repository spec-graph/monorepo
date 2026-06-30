# spec-graph Workflow v2 — Detailed Design

## 完整流程（从 init 到交付）

### 阶段 1：项目初始化

```bash
# 用户：初始化项目
spec-graph init --stack typescript --build spa --description "电商平台"
```

**spec-graph 做什么**：
- 创建 `.spec-graph/` 目录结构
- 生成 `profile.yaml`（项目配置）
- 生成 `graph.yaml`（声明需要的 artifacts：PRD, epics, stories, design 等）
- 生成 `machine-state.yaml`（所有 artifact = pending）
- 生成 `commands.yaml`（技术栈对应命令）

**输出**：
```
✓ Infrastructure ready.

📋 Plan stage incomplete — artifacts needed:

    ⬜ requirement/prd
    ⬜ design/c4
     plan/epics
    ⬜ plan/story
    ...
```

---

### 阶段 2：规划（plan）

**AI Agent 接管**，通过 dispatch 循环生产 plan artifacts：

```
Agent 运行：spec-graph dispatch --json
    ↓
Manifest 说："生产 requirement/prd，写到 .spec-graph/artifacts/requirements/prd.md"
    ↓
Agent 读用户需求，写 PRD 内容到文件
    ↓
Agent 运行：spec-graph artifact complete requirement/prd --producer agent
    ↓
Agent 重新 dispatch
    ↓
Manifest 说："生产 plan/epics，写到 .spec-graph/artifacts/plan/epics.md"
    ↓
Agent 读 PRD，分解 Epics，写到文件
    ↓
Agent 运行：spec-graph artifact complete plan/epics --producer agent
    ↓
... 循环直到 plan 阶段所有 artifact 完成
```

**plan 阶段产出**：
- `requirement/prd.md` — 产品需求文档
- `plan/epics.md` — Epic 分解（如：E1: 用户认证, E2: 商品管理, E3: 订单流程）
- `plan/story.md` — Story 拆分（如：S1.1: 用户注册, S1.2: 用户登录, S1.3: 密码找回...）

---

### 阶段 3：从 Stories 自动生成 Changes

```bash
# Agent 运行：
spec-graph change create-all-from-stories
```

**spec-graph 做什么**：
1. 读取 `.spec-graph/artifacts/plan/story.md`
2. 解析出所有 stories（S1.1, S1.2, S1.3, ...）
3. 为每个 story 创建 change：
   - `change create --story S1.1 --title "用户注册"`
   - `change create --story S1.2 --title "用户登录"`
   - `change create --story S1.3 --title "密码找回"`
4. 每个 change 的 `plan_md` 自动引用对应 story 内容
5. 每个 change 状态 = `proposed`

**输出**：
```
✓ Created 7 changes from stories:

  Change-001: S1.1 用户注册 [proposed]
  Change-002: S1.2 用户登录 [proposed]
  Change-003: S1.3 密码找回 [proposed]
  ...
```

---

### 阶段 4：开发循环（每个 Change）

```bash
# Agent 开始第一个 change：
spec-graph change apply Change-001
```

#### 4.1 Dev 循环开始

```bash
spec-graph dev Change-001
```

**Dev 循环内部**：

```
┌─ CODING 阶段
│     ↓
│   Agent 读 story 需求，写代码
│   Agent 运行：spec-graph check --layer unit
│     ↓
│   检查通过？
│     ├─ 否 → 显示错误 → Agent 修复 → 回到 CODING
│     └─ 是 ↓
│
├─ REVIEWING 阶段
│     ↓
│   启动 review sub-agent 审查代码
│   review 子 agent 输出：
│     - 代码质量评分
│     - 发现的问题列表
│     - 改进建议
│     ↓
│   有问题？
│     ├─ 是 → Agent 根据反馈修复 → 回到 CODING
│     └─ 否 ↓
│
├─ TESTING 阶段
│     ↓
│   运行全量测试：spec-graph check --layer unit,integration
│     ↓
│   测试通过？
│     ├─ 否 → 显示失败测试 → Agent 修复 → 回到 CODING
│     └─ 是 ↓
│
└─ DEV 循环结束
```

**Dev 循环退出条件**：
- 所有 unit + integration 测试通过
- Review 无问题
- 无 lint 错误

---

#### 4.2 Change 完成

```bash
# Dev 循环自动完成后：
spec-graph change complete Change-001
```

**spec-graph 做什么**：
- 标记 change 状态 = `completed`
- 记录完成时间、产出物
- 更新 machine-state（相关 artifacts = completed）

---

#### 4.3 Change 归档

```bash
spec-graph change archive Change-001
```

**spec-graph 做什么**：
- 移动 change 文件到 `.spec-graph/archived/`
- 保留 plan_md（审计追溯）
- 保留代码 diff（如果有 git 集成）

---

### 阶段 5：下一个 Change

```bash
# 自动开始下一个：
spec-graph change apply Change-002
spec-graph dev Change-002
spec-graph change complete Change-002
spec-graph change archive Change-002
```

**循环直到所有 changes 完成**：
```
Change-001 ✅ → Change-002 ✅ → Change-003 ✅ → ... → Change-007 ✅
```

---

### 阶段 6：整合与发布

```bash
# 所有 changes 完成后
spec-graph machine transition --from plan --to integrate
```

**spec-graph 做什么**：
- 验证所有 stories 已实现
- 运行最终全量测试
- 生成发布清单

---

## 完整命令序列（用户视角）

```bash
# 1. 初始化
spec-graph init --stack typescript --build spa --description "电商平台"

# 2. 规划（Agent 自动运行 dispatch 循环）
spec-graph dispatch  # 生产 PRD
spec-graph dispatch  # 生产 Epics
spec-graph dispatch  # 生产 Stories

# 3. 从 Stories 生成 Changes
spec-graph change create-all-from-stories

# 4. 开发循环（Agent 自动运行）
for change in Change-001 Change-002 ... Change-007:
    spec-graph change apply $change
    spec-graph dev $change          # Dev 循环（coding↔review↔test）
    spec-graph change complete $change
    spec-graph change archive $change

# 5. 整合
spec-graph machine transition --from plan --to integrate
spec-graph check --layer unit,integration,system
spec-graph gate

# 6. 发布
spec-graph change retro Change-001  # 可选：回顾
spec-graph change retro Change-002  # 可选：回顾
```

---

## 关键改进点

### 1. Story → Change 自动衔接

**之前**：plan 写完 story，change 要手动创建，两者无关
**现在**：`change create-all-from-stories` 自动绑定

### 2. Dev 循环替代线性阶段

**之前**：implement → review → test（线性，不能回头）
**现在**：coding ↔ review ↔ test（迭代，有问题就回去修）

### 3. Change 驱动开发

**之前**：change 是可选的元数据
**现在**：change 是开发的基本单元，每个 story 对应一个 change

### 4. Agent 主导流程

**之前**：用户手动跑每个命令
**现在**：Agent 自动运行 dispatch/dev/complete 循环，用户只需确认关键节点

---

## 状态机（FSM）v2

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
specify → design → plan → [change loop × N] → integrate     │
                             │                                │
                             ├── proposed                     │
                             ├── in_progress                  │
                             │     ── { coding ↔ review ↔ test }
                             ├── completed                    │
                             └── archived                     │
                                                            │
                    └─────────────────────────────────────────┘
```

---

## 文件结构

```
.spec-graph/
├── profile.yaml           # 项目配置
├── graph.yaml             # 声明 artifacts/checks/gates
├── machine-state.yaml     # 当前状态
├── commands.yaml          # 技术栈命令映射
├── agent-constraints.md   # Agent 行为规范
├── artifacts/
│   ├── requirements/prd.md        # PRD
│   ├── plan/epics.md              # Epics
│   └── plan/story.md              # Stories（S1.1, S1.2, ...）
── changes/
│   ├── Change-001.json            # Change 元数据
│   ├── Change-001-plan.md         # Change 计划（继承自 story）
│   ├── Change-002.json
│   └── Change-002-plan.md
├── archived/
│   ├── Change-001.json            # 已归档
│   └── Change-001-plan.md
└── traces/
    └── traces.yaml                # 追溯关系
```

---

## 实现优先级

### P0（必须）
1. `change create --story <id>` — 绑定 story 创建 change
2. `change create-all-from-stories` — 批量从 stories 生成 changes
3. Dev loop 引擎（coding↔review↔test 循环）

### P1（应该）
4. `spec-graph dev <change-id>` — 启动 dev 循环
5. Review sub-agent 集成
6. Change 自动推进（一个完成自动开始下一个）

### P2（可以）
7. Retro 自动生成（从 change 历史学习）
8. Change 并行开发（多 story 同时开发）
9. Change 依赖管理（story 之间有依赖）

---

## 向后兼容

- 现有 `change create`（无 --story）仍然可用
- 现有 FSM 阶段仍然可用
- Dev loop 是新增功能，不破坏现有流程
