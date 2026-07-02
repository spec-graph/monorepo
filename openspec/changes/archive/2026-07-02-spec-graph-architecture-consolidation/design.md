## 实施阶段

### 阶段 1: 增量增强 (不删任何功能)

```
目标: 先让用户能用上新流程, 老流程暂时保留

1.1 plan → tasks 重命名
  - Stage type union: 'plan' → 'tasks'
  - STAGES 数组
  - STAGE_OUTPUTS 字典
  - dispatch STAGE_OUTPUT_MAP
  - nextPrompt 方法论选择
  - knowledge/stages/plan/ → knowledge/stages/tasks/
  - pack agent_bindings: plan → tasks
  - pack actions 数组: plan → tasks
  - pack gate on_transition
  - tests 更新

1.2 init 真实实现
  - 创建 .spec-graph/ 目录
  - 写 config.yaml 模板
  - 创建 sessions/ 空目录
  - 可选: 自动 compose (如果 pack 目录存在)
  - --force 选项覆盖
  - 自动注册 hook 到 .claude/settings.json

1.3 compose $or/$and 支持
  - 解析 $or / $and 操作符
  - 嵌套 2 层限制
  - 向后兼容 AND 语义
  - 测试: backend.pack / ddd.pack 被正确过滤

1.4 tasks stage 看 capabilities
  - nextPrompt 在 tasks stage 注入 plan.capabilities
  - dispatch envelope 在 tasks stage 列出每个 capability
  - gate 验证 tasks 覆盖所有 capabilities

1.5 implement gate 真实检查
  - 检查 implement/ 目录下有源文件
  - 如果 tsc 可用 → tsc --noEmit
  - 如果 vitest/jest 可用 → 跑测试
  - 兼容无 TypeScript 项目

1.6 文档更新 (只加不删)
  - README 加 dispatch 命令说明
  - README 加 hook 注册说明
  - 新增 spec-graph-dispatch SKILL.md
  - 新增 spec-graph-init SKILL.md
  - auto 命令加 deprecation warning

1.7 E2E 测试 (mock sub-agent)
  - 完整 8 阶段循环
  - 验证 tasks stage 看到 capabilities
  - 验证 implement gate 检查代码
  - 验证 parallel waves

1.8 验收 (真实跑一遍)
  - 在 test-project 真实运行
  - 验证 hook 自动触发
  - 验证 sub-agent 真实产出
  - 验证 tsc + vitest 通过
```

### 阶段 2: 清理 (删功能)

```
目标: 移除违反原则的实现, 完成架构统一

2.1 deprecation 周期结束
  - 在阶段 1 发布后等待 1 周
  - 收集用户反馈
  - 准备迁移文档

2.2 删除 external-coordination 模块
  - 删除 packages/core/src/external-coordination/
  - 从 core/index.ts 移除导出
  - 删除相关测试

2.3 删除 prompt-construction 模块
  - 删除 packages/core/src/prompt-construction/
  - 从 core/index.ts 移除导出
  - 删除相关测试
  - 更新所有依赖 XML 格式的代码

2.4 删除 auto 命令
  - 删除 packages/cli/src/commands/auto.ts
  - 从 cli/index.ts 移除注册
  - 删除 automator.autoRun() 函数
  - 更新 README 和 SKILL.md

2.5 删除 next-prompt 命令
  - 删除 packages/cli/src/commands/next-prompt.ts
  - 从 cli/index.ts 移除注册
  - 更新 README 和 SKILL.md

2.6 归档 spec-graph-v2 提案
  - 它的核心承诺 (auto 命令) 已被删除
  - 用 spec-graph-architecture-consolidation 替代

2.7 编译验证 + 全量测试

2.8 发布 2.0.0 版本
  - Breaking change 明确标注
  - 迁移指南: auto → dispatch + hook
  - Migration guide: state.yaml plan → tasks
```

## 关键变更细节

### 1. plan → tasks 重命名

```
Stage type:
  - 改 'plan' → 'tasks'

STAGES 数组:
  - 改 'plan' → 'tasks'

STAGE_OUTPUTS 字典:
  - 改 plan: { artifact: 'tasks.md', dir: 'plan' }
  - 为 tasks: { artifact: 'tasks.md', dir: 'tasks' }

knowledge/stages/plan/ 目录:
  - 重命名为 knowledge/stages/tasks/

packs/foundation.pack/pack.yaml:
  - actions 数组: 'plan' → 'tasks'
  - agent_bindings: plan → tasks
  - gate on_transition: plan → tasks

packs/ddd.pack/pack.yaml:
  - actions 数组: 'plan' → 'tasks'
  - gate on_transition: plan → tasks

NOT 改:
  - Plan TypeScript type (大写, 表示 Plan 对象)
  - state.yaml#plan 字段 (Plan 对象存储)
  - planning.generatePlan() 函数
  - spec-graph plan 命令
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
    language: "<auto-detected>"
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
      "PostToolUse": [
        {
          "matcher": "Bash",
          "command": "node ../packages/core/hooks/dispatch-watcher.mjs"
        }
      ]
    }
  }
  (路径相对于项目根, 或者用绝对路径)
```

### 3. compose $or/$and

```
解析逻辑:
  function matchesCondition(condition, facts):
    if typeof condition === 'object':
      keys = Object.keys(condition)
      if keys.includes('$or'):
        return condition['$or'].some(c => matchesCondition(c, facts))
      if keys.includes('$and'):
        return condition['$and'].every(c => matchesCondition(c, facts))
      # 普通 AND 语义
      return keys.every(dim => facts[dim]?.value === condition[dim])
    return false

限制:
  - 最多 2 层嵌套 (超过报错)
  - 未知操作符 (如 $xor) 报错
```

### 4. tasks stage 看 capabilities

```
nextPrompt 在 tasks stage:
  - 从 state.yaml 读 plan.capabilities
  - 注入到 PromptContext 的特殊字段:
    ctx.capabilities = plan.capabilities
  - 或者作为 Input Artifacts 的一部分

dispatch envelope 在 tasks stage:
  - ## Output Specification 里列出每个 capability
  - "tasks.md MUST cover these capabilities:"
    - capability-a: <description>
    - capability-b: <description>
    - capability-c: <description>

Gate 验证:
  - 检查 tasks.md 里每个 task 是否引用某个 capability
  - 如果所有 capabilities 都没有对应 task → gate fail
```

### 5. implement gate 检查代码

```
Gate 规则:
  - 检查 implement/ 目录下有至少 1 个非 .md 文件
  - 如果 package.json 有 "scripts.tsc" → 跑 tsc --noEmit
  - 如果 package.json 有 "scripts.test" → 跑测试
  - 如果都没有 → 只检查文件存在

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

方案 C: SKILL 文档引导
  文档里写 "如何手动配置 hook"
  用户自己复制文件 + 改 settings.json

选择: 方案 A, 因为:
  - 用户第一次 init 后就能直接用 dispatch
  - 不需要额外步骤
  - 自动注册 = 自动可用
```

## 向后兼容

```
老 session (state.yaml 里有 stage: "plan"):
  选项 1: Migration script
    spec-graph migrate
    自动把 stage: "plan" → stage: "tasks"
  
  选项 2: 自动兼容
    dispatch 看到 stage: "plan" → 自动映射到 "tasks"
    (向后兼容, 新代码也能读老数据)
  
  选项 3: 强制用户手动改
    文档说明, 用户自己改 state.yaml
    (最简单, 但用户麻烦)

选择: 选项 1 + 选项 2
  - 提供 migration script
  - dispatch 自动兼容老 stage 名
```

## 删除后的空位

```
external-coordination 删除后:
  - core 没有外部调用能力
  - 只有 dispatch (给 manifest)
  - hook 系统消费 manifest
  - 用户环境自己调度

prompt-construction 删除后:
  - core 没有 XML prompt 生成
  - 只有 dispatch envelope (9 段 markdown)
  - 更简单, 更直接

auto 命令删除后:
  - 没有"一条命令跑完"
  - 用户需要: dispatch → hook → advance → 重复
  - SKILL.md 引导用户
```
