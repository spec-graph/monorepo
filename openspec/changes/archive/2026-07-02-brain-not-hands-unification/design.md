## 完整流程 (Phase 0-11)

### 全新命令体系

```
保留 (15 个命令):
  spec-graph init              ← 重写: 真实创建 .spec-graph/
  spec-graph plan "<intent>"   ← 保留: 战略层规划
  spec-graph confirm <id>      ← 保留: 锁定 plan
  spec-graph compose           ← 保留: pack 组装
  spec-graph dispatch --json   ← 保留: 产出 manifest
  spec-graph advance --result  ← 保留: 推进状态
  spec-graph status            ← 保留: 显示状态
  spec-graph intervene <action>← 保留: 手动干预
  spec-graph diagnose          ← 保留: 查看诊断
  spec-graph sessions          ← 保留: 列出 session
  spec-graph validate          ← 保留: 验证状态
  spec-graph config            ← 保留: 查看配置
  spec-graph machine           ← 保留: machine-state 操作
  spec-graph artifact-complete ← 保留: 标记 artifact
  spec-graph check-run         ← 保留: 运行 check
  spec-graph completion        ← 保留: shell 补全
  spec-graph migrate           ← 新增: 老 session 迁移

删除 (2 个命令):
  spec-graph auto              ← 删除 (spawn child_process)
  spec-graph next-prompt       ← 删除 (XML 格式)

新增 (1 个命令):
  spec-graph install           ← 安装 hook 到用户环境
```

### 全新 SKILL 体系

```
保留 (6 个 SKILL):
  spec-graph-plan              ← 战略规划
  spec-graph-status            ← 查看状态
  spec-graph-intervene         ← 手动干预
  spec-graph-diagnose          ← 查看诊断
  spec-graph-validate          ← 验证状态
  spec-graph-init              ← 初始化项目

新增 (1 个 SKILL):
  spec-graph-dispatch          ← dispatch + hook 路径 (新核心)

删除 (1 个 SKILL):
  spec-graph-auto              ← 删除 (引用被删的 auto 命令)
```

### 新工作流 (用户视角)

```
第一次使用:
  $ cd /path/to/your/project
  $ spec-graph init
    → 创建 .spec-graph/ + 注册 hook
  $ spec-graph plan "我要做一个 todo app"
    → LLM 生成 capabilities
    → sessionId = "build-a-todo-app"
  $ spec-graph confirm build-a-todo-app
    → 锁定 plan, state = "running"
  $ spec-graph compose
    → 扫描 packs → graph.yaml

开始循环 (每阶段):
  $ spec-graph dispatch --session build-a-todo-app --json
    → hook 自动触发
    → 主 agent 派发 sub-agent
    → sub-agent 产出 artifact
  $ spec-graph advance --session build-a-todo-app --result '{...}'
    → gate 评估
    → state 推进
    → machine-state 更新

  重复 8 次, 直到 state = "completed"
```

### 新 SKILL 设计: spec-graph-dispatch

```yaml
---
name: spec-graph-dispatch
description: >
  通过 dispatch + hook 路径运行 spec-graph 工作流.
  每次 dispatch --json 后, hook 自动注入 system-reminder,
  Claude Code 主 agent 用 Agent tool 派发 sub-agent.
  重复 8 阶段循环直到 done.
---

# spec-graph-dispatch SKILL

## 何时使用

- 用户想运行完整的 spec-graph 工作流
- 用户有已确认的 plan (state.yaml 里 state = "running")

## 前提条件

- spec-graph CLI 已安装
- .spec-graph/ 目录已存在 (已跑过 init)
- 当前 session 的 state = "running"
- hook 已注册 (.claude/settings.json 里有 dispatch-watcher)

## 工作流

  循环以下步骤 8 次 (每个 FSM 阶段一次):

  1. 运行 spec-graph dispatch --session <id> --json
     → 拿到 manifest JSON

  2. hook 自动注入 system-reminder
     → 你会看到 dispatch 指令

  3. 按 system-reminder 指示派发 sub-agent
     → 单 action: 派发 1 个 sub-agent
     → 并行 action: 同时派发多个 sub-agent
     → 等待所有 sub-agent 返回

  4. 收集 sub-agent 的产出 (artifact 路径 + 内容)
     → 打包成 { artifacts: [...] }

  5. 运行 spec-graph advance --session <id> --result '<json>'
     → gate 评估, state 推进

  6. 检查 result:
     - advanced = true, nextStage = "X" → 继续下一轮
     - advanced = false, diagnosis = {...} → 读诊断, 修复, 重试
     - done = true → 工作流完成

## 并行 dispatch

  当 manifest.actions.length > 1 时:
  - 所有 action 在同一个 parallel_group → 同时派发
  - 多个 parallel_group → 按 group 顺序派发, 组内并行

## 错误处理

  Gate 失败:
  1. 读 spec-graph diagnose --session <id>
  2. 根据 diagnosis 修复 artifact
  3. 重新跑 dispatch + advance

  Agent 返回 BLOCKED:
  1. 报告给用户
  2. 等待用户指导
  3. 可能需要 spec-graph intervene

  Hook 没触发:
  1. 检查 .claude/settings.json 配置
  2. 检查 dispatch-watcher.mjs 路径
  3. 手动跑: spec-graph install --hook dispatch-watcher
```

### 新 SKILL 设计: spec-graph-init

```yaml
---
name: spec-graph-init
description: >
  初始化一个 spec-graph 项目. 创建 .spec-graph/ 目录,
  写 config.yaml, 注册 hook 到 .claude/settings.json.
---

# spec-graph-init SKILL

## 何时使用

- 第一次使用 spec-graph
- 项目里没有 .spec-graph/ 目录

## 步骤

  1. 运行 spec-graph init
     → 创建 .spec-graph/config.yaml
     → 创建 .spec-graph/sessions/ 目录
     → 自动注册 dispatch-watcher hook 到 .claude/settings.json
     → 如果 pack 目录存在 → 自动 compose

  2. 验证:
     - ls .spec-graph/ 看到 config.yaml + sessions/
     - cat .claude/settings.json 看到 hook 配置

  3. 接下来:
     - spec-graph plan "<intent>"
     - 进入 spec-graph-dispatch SKILL
```

## 完整流程 (Phase 0-11)

```
Phase 0: spec-graph init
  做什么:
    1. 创建 .spec-graph/ 目录
    2. 写 config.yaml (项目 context 模板)
    3. 创建 sessions/ 空目录
    4. 如果 pack 目录存在 → 自动 compose → graph.yaml
    5. 自动注册 hook 到 .claude/settings.json
  
  输出:
    .spec-graph/
    ├── config.yaml
    ├── sessions/
    └── graph.yaml (可选)
    
    .claude/settings.json 添加:
    {
      "hooks": {
        "PostToolUse": [{
          "matcher": "Bash",
          "command": "node ../packages/core/hooks/dispatch-watcher.mjs"
        }]
      }
    }
  
  验证:
    ls .spec-graph/
    cat .claude/settings.json
    spec-graph compose 能跑通

Phase 1: spec-graph plan "<intent>"
  做什么:
    1. 调用 planning.generatePlan(intent)
       → LLM 分解 intent → capabilities[]
    2. 生成 sessionId = intent.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,64)
    3. 创建 state.yaml (state=paused, plan.capabilities)
  
  输出:
    stdout: { sessionId, plan.capabilities, plan.order, plan.complexity, ... }
    .spec-graph/sessions/<sessionId>/state.yaml
  
  验证:
    cat state.yaml
    应有 plan.capabilities 数组

Phase 2: spec-graph confirm <sessionId>
  做什么:
    1. loadSession(sessionId)
    2. state = "running"
    3. trace.push({ trigger: "user-force" })
    4. saveSession()
  
  输出:
    state.yaml 改写: state = "running"
  
  验证:
    spec-graph status --json → state = "running"

Phase 3: spec-graph compose
  做什么:
    1. 扫描 packs/ 下所有 *.pack/pack.yaml
    2. 按 applies_when 过滤:
       - always / 缺失 → 总是加载
       - { dim: true/false, ... } → AND 语义
       - { $or: [...] } → 任一匹配
       - { $and: [...] } → 全部匹配
       - 嵌套最多 2 层
    3. 按 priority 排序
    4. 合并 agents, bindings, gates, checks, meetings
    5. 写 graph.yaml
  
  输出:
    .spec-graph/graph.yaml
  
  验证:
    graph.agents ≥ 5
    graph.agent_bindings ≥ 8
    graph.meta.packs_used.length = 预期数量

Phase 4-11: 8 阶段 FSM 循环 (每阶段重复以下 4 步)

  ┌─────────────────────────────────────────────────────┐
  │ Step A: spec-graph dispatch --session <id> --json   │
  │                                                     │
  │   读 graph.yaml + state.yaml + machine-state.yaml  │
  │   产出 DispatchManifest:                            │
  │   {                                                 │
  │     current_stage,                                  │
  │     gate_passed,                                    │
  │     actions: [{                                     │
  │       id, agent_id, model_tier,                     │
  │       parallel_group,                               │
  │       prompt (9 段 envelope),                       │
  │       output_spec, file_scope, verification,        │
  │       next_step                                     │
  │     }],                                             │
  │     meetings (可选)                                 │
  │   }                                                 │
  │                                                     │
  │   单 stage → 1 action                               │
  │   implement stage → N actions (N = capabilities)    │
  │   按 parallel_group 分组, group 内并行              │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step B: dispatch-watcher hook 触发                  │
  │                                                     │
  │   PostToolUse(Bash) 检测 "spec-graph dispatch"       │
  │   解析 manifest JSON                                │
  │   注入 system-reminder:                              │
  │   "Wave 0 (PARALLEL): dispatch N sub-agents"        │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step C: Claude Code 派发 sub-agent                   │
  │                                                     │
  │   主 agent 用 Agent tool 同时派发 N 个 sub-agent   │
  │   每个 sub-agent:                                   │
  │     - 收到 9 段 envelope prompt                      │
  │     - 读 Input Artifacts (上游产出)                  │
  │     - 按 File Scope 约束写文件                        │
  │     - 跑 Verification (lint/test/typecheck)           │
  │     - 返回 status-report JSON                       │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────┐
  │ Step D: spec-graph advance --result '<json>'        │
  │                                                     │
  │   收集 sub-agent 的 artifacts[]                      │
  │   写入 .spec-graph/sessions/<id>/<stage>/           │
  │   评估 gate (stage-specific checks)                 │
  │                                                     │
  │   If passed:                                        │
  │     - trace.push(gate-pass)                         │
  │     - completedArtifacts.push                       │
  │     - machineState.trackArtifact(completed)         │
  │     - stage → 下一阶段                               │
  │                                                     │
  │   If failed:                                        │
  │     - diagnoseFailure                               │
  │     - previousDiagnoses.push                        │
  │     - retryCount++                                   │
  │     - 重试 (最多 4 次)                              │
  └────────────────────┬────────────────────────────────┘
                       │
                       ▼
              下一个阶段 (重复 8 次)
              直到 state = "completed"
```

## 9 段 Envelope 详细规格

```
## 1. Identity
   sub-agent 的身份: "You are the {agent.id} agent — {agent.description}"
   model_tier: capable | standard | fast

## 2. System Prompt
   从 pack/agents/{agent.id}-agent.md 加载
   包含领域知识、工作原则、质量标准

## 3. Task Context
   - Stage: 当前 stage 名 (specify / design / tasks / implement / ...)
   - Session: sessionId
   - Intent: 用户意图
   - Action: 具体动作描述
   - Parallel group (如有)

## 4. Input Artifacts (READ-ONLY)
   上一个阶段的产出 (如: specify/proposal.md, design/design.md)
   每个 artifact 包含 id, kind, path, content
   内容截断到 3000 字

## 5. Output Specification (MUST)
   精确路径: .spec-graph/sessions/<id>/<stage>/<artifact>
   模板引用 (如有)
   格式描述 (Markdown with sections: ...)
   "You MUST write the artifact to the exact path above"

## 6. File Scope (MUST)
   read: 可读路径 glob 列表
   write: 可写路径 glob 列表
   forbid: 禁止触碰路径 glob 列表
   违反 scope = BLOCKED status

## 7. Verification (MUST)
   按 stage 不同:
   implement: lint, typecheck, test 命令
   其他: format verification note

## 8. Status Report Protocol (MUST)
   必须返回 fenced code block:
   ```status-report
   {"status":"DONE",
    "artifacts_produced":[...],
    "concerns":[],
    "missing_context":null,
    "blocker":null,
    "summary":"..."}
   ```
   Status values: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED

## 9. After Completion
   next_step 命令: spec-graph advance --result '{...}'
   "The coordinator will run: <command>"
```

## 关键变更细节

### 1. plan → tasks 重命名

```
改:
  - Stage type union: 'plan' → 'tasks'
  - STAGES 数组: 'plan' → 'tasks'
  - STAGE_OUTPUTS.plan → STAGE_OUTPUTS.tasks
  - dispatch STAGE_OUTPUT_MAP.plan → .tasks
  - nextPrompt 方法论选择: stage === 'plan' → stage === 'tasks'
  - knowledge/stages/plan/ 目录 → knowledge/stages/tasks/
  - pack agent_bindings: plan → tasks
  - pack actions 数组: 'plan' → 'tasks'
  - pack gate on_transition 数组: plan → tasks
  - tests 里所有引用 'plan' stage 的地方

不改:
  - Plan TypeScript interface (大写, 表示 Plan 对象)
  - state.yaml#plan 字段 (Plan 对象存储)
  - plan.capabilities 字段
  - planning.generatePlan() 函数
  - spec-graph plan 命令 (战略层规划)

向后兼容:
  - dispatch 看到 stage: "plan" → 自动映射到 "tasks"
  - 老 session 不需要立即改 state.yaml
  - 提供 migration script: spec-graph migrate
```

### 2. init 真实实现

```
创建目录结构:
  .spec-graph/
  ├── config.yaml     ← 项目 context 模板
  ├── sessions/       ← 空
  └── graph.yaml      ← (如果 pack 存在, 自动 compose)

config.yaml 模板:
  version: "1"
  context:
    language: "<auto-detected by sense>"
    framework: "<auto-detected>"
  rules:
    code_style: "follow project conventions"
    test_requirement: "every source file has a test file"
  references:
    readme: "README.md"

自动注册 hook:
  .claude/settings.json:
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": "Bash",
        "command": "node ../packages/core/hooks/dispatch-watcher.mjs"
      }]
    }
  }
  (路径相对于项目根, 或者用绝对路径)

命令:
  spec-graph init                   # 创建目录 + 注册 hook
  spec-graph init --force           # 覆盖已有
  spec-graph init --skip-hook       # 只建目录, 不注册 hook
```

### 3. compose $or/$and 支持

```
解析逻辑 (伪代码):
  function matchesCondition(condition, facts):
    if typeof condition === 'object':
      keys = Object.keys(condition)
      if keys.includes('$or'):
        return condition['$or'].some(c => matchesCondition(c, facts))
      if keys.includes('$and'):
        return condition['$and'].every(c => matchesCondition(c, facts))
      # 普通 AND 语义: 每个 fact 维度都存在/不存在
      return keys.every(dim => {
        if condition[dim] === true:
          return facts[dim]?.value?.trim() !== ''
        if condition[dim] === false:
          return !facts[dim] || facts[dim].value?.trim() === ''
        return facts[dim]?.value === condition[dim]
      })
    return false

限制:
  - 最多 2 层嵌套 (超过报错, 包跳过 + warning)
  - 未知操作符 (如 $xor) 报错
  - 向后兼容现有 AND 语义

测试:
  - backend.pack 的 $or: [boundary, deployment]
  - api-design.pack 的 $or: [boundary, deployment]
  - ddd.pack 的 $or: 5-way OR
  - 嵌套 $or + $and
```

### 4. tasks stage 看 capabilities

```
nextPrompt 在 tasks stage:
  - 从 state.yaml 读 plan.capabilities
  - 注入到 prompt envelope 的 Task Context 段
  - 列出每个 capability 的 id 和 description
  - 要求 tasks.md 覆盖每个 capability

dispatch envelope 在 tasks stage:
  ## 3. Task Context
  ...
  - Strategic plan capabilities (MUST cover all):
    - capability-a: <description>
    - capability-b: <description>
    - capability-c: <description>
  - tasks.md MUST contain tasks for every capability listed above

Gate 验证:
  - 检查 tasks.md 里每个 task 是否引用某个 capability
  - 如果所有 capabilities 都没有对应 task → gate fail
  - traceability 规则: task ↔ capability 一一对应
```

### 5. implement gate 真实检查代码

```
Gate 规则:
  - 检查 implement/ 目录下有至少 1 个非 .md 文件
  - 如果 package.json 有 "scripts.tsc" → 跑 tsc --noEmit
  - 如果 package.json 有 "scripts.test" → 跑测试
  - 如果都没有 → 只检查文件存在

诊断失败:
  - 如果 implement/ 空 → "missing implementation"
  - 如果 tsc 失败 → "typecheck failed"
  - 如果 test 失败 → "test failed"

Machine-state 追踪:
  - 每个 capability 的产出单独追踪
  - capability-a.ts → completed / failed
  - capability-b.ts → completed / failed
  - capability-c.ts → completed / failed
```

### 6. Hook 注册方式

```
方案 A: init 自动注册 (推荐)
  spec-graph init 时自动在 .claude/settings.json 添加 hook
  用户不需要手动配置

方案 B: 独立命令注册
  spec-graph install --hook dispatch-watcher
  用户显式选择注册

选择: 方案 A, 因为:
  - 用户第一次 init 后就能直接用 dispatch
  - 不需要额外步骤
  - 自动注册 = 自动可用

实现细节:
  - 检查 .claude/settings.json 是否存在
  - 如果存在 → 读 + 合并 hook 配置
  - 如果不存在 → 创建新文件
  - 保留其他已存在的配置
```

## 分阶段实施策略

```
阶段 1: 增量增强 (不删任何功能)
  目标: 先让用户能用上新流程, 老流程暂时保留

  Section 1: plan → tasks 重命名
    - 加向后兼容 (dispatch 老 stage 名自动映射)
    - 同时保留老名字作为 alias

  Section 2: init 真实实现
    - 创建目录 + 注册 hook

  Section 3: compose $or/$and
    - 支持嵌套操作符

  Section 4: tasks stage 看 capabilities
    - prompt 注入 + gate 验证

  Section 5: implement gate 真实检查
    - 源文件存在 + tsc + 测试

  Section 6: 文档更新 (只加不删)
    - README 加 dispatch 命令说明
    - README 加 hook 注册说明
    - 新 SKILL.md

  Section 7: E2E 测试
    - 完整 8 阶段循环
    - mock sub-agent

  Section 8: 验收
    - 在 test-project 真实运行
    - 真实 sub-agent 产出
    - tsc + vitest 通过

阶段 2: 清理 (删功能)
  目标: 移除违反原则的实现

  Section 9: deprecation 周期结束
    - 在阶段 1 发布后等待 1 周
    - 收集用户反馈
    - 准备 migration guide

  Section 10: 删除违反 brain-not-hands 的代码
    - external-coordination 模块
    - prompt-construction 模块
    - auto 命令
    - next-prompt 命令
    - autoRun 函数
    - spec-graph-auto SKILL

  Section 11: 归档 spec-graph-v2
    - 它的核心承诺 (auto 命令) 已被删除

  Section 12: 最终验证
    - 全量测试通过
    - 编译通过
    - 发布 2.0.0
```

## 向后兼容策略

```
老 session (state.yaml 里有 stage: "plan"):
  - dispatch 看到 stage: "plan" → 自动映射到 "tasks"
  - 老代码 + 新代码都能正确读老 session
  - 提供 spec-graph migrate 命令 (可选)

老用户习惯 spec-graph auto:
  - auto 命令在阶段 2 之前加 deprecation warning
  - 1 周后删除
  - migration guide: auto → dispatch + hook

老 machine-state.yaml 格式:
  - 自动兼容, 格式未变
  - 新增的 artifact 追踪自动工作

老 graph.yaml:
  - 重新 compose 即可更新
  - 老格式依然可读
```

## test-project 完整测试场景

```
项目: /Users/wang/study/ai-agent/spec-graph/test-project/
意图: "Build 3 independent TypeScript utility libraries"

3 个独立 capability:
  - math-utils: sum, multiply, average (dependsOn: [])
  - string-utils: capitalize, truncate, slugify (dependsOn: [])
  - date-utils: formatDate, daysBetween, isWeekend (dependsOn: [])

验证矩阵:

  Phase      │ 输入                      │ 输出                       │ 验证方法
  ───────────┼──────────────────────────┼───────────────────────────┼──────────────────
  init       │ 无                        │ .spec-graph/ + config.yaml│ ls .spec-graph/
  plan       │ intent 字符串             │ state.yaml (paused)       │ cat state.yaml
  confirm    │ sessionId                │ state.yaml (running)      │ status state="running"
  compose    │ 17 个 pack               │ graph.yaml                │ cat graph.yaml
  specify    │ graph + state            │ proposal.md               │ 4 section 存在
  design     │ graph + proposal         │ design.md                 │ Context/Goals 存在
  tasks      │ graph + design           │ tasks.md                  │ checkbox 格式
  implement  │ graph + tasks            │ src/**/* (3 个库)          │ tsc + vitest pass
  review     │ graph + 代码              │ review.md                 │ findings/resolutions
  test       │ graph + 代码 + review    │ test.md                   │ 测试结果 + coverage
  accept     │ graph + 所有产出         │ verification.md           │ E2E 验证 ok
  integrate  │ graph + 所有产出         │ pr.md                     │ Summary + Test Plan
  done       │ 所有 8 个 artifact       │ state="completed"         │ readyForArchive=true
```
