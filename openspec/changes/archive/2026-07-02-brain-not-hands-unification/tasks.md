## 阶段 1: 基础重构 (增量增强, 不删任何功能)

### Section 1: Plan → Tasks 重命名

- [ ] 1.1 修改 `packages/core/src/automator/index.ts`: Stage type union `'plan'` → `'tasks'`
- [ ] 1.2 修改 `packages/core/src/automator/index.ts`: STAGES 数组 `'plan'` → `'tasks'`
- [ ] 1.3 修改 `packages/core/src/automator/index.ts`: STAGE_OUTPUTS 字典 `plan:` → `tasks:` (dir 也改)
- [ ] 1.4 修改 `packages/core/src/automator/index.ts`: nextPrompt 方法论选择 `stage === 'plan'` → `stage === 'tasks'`
- [ ] 1.5 修改 `packages/core/src/dispatch/index.ts`: STAGE_OUTPUT_MAP `plan:` → `tasks:`
- [ ] 1.6 重命名目录 `packages/core/knowledge/stages/plan/` → `packages/core/knowledge/stages/tasks/`
- [ ] 1.7 修改 `packages/core/packs/foundation.pack/pack.yaml`: actions 数组 `'plan'` → `'tasks'`
- [ ] 1.8 修改 `packages/core/packs/foundation.pack/pack.yaml`: agent_bindings `plan:` → `tasks:`
- [ ] 1.9 修改 `packages/core/packs/foundation.pack/pack.yaml`: gate on_transition `[plan, implement]` → `[tasks, implement]`
- [ ] 1.10 修改 `packages/core/packs/ddd.pack/pack.yaml`: actions 数组 `'plan'` → `'tasks'`
- [ ] 1.11 修改 `packages/core/packs/ddd.pack/pack.yaml`: gate on_transition `[design, plan]` → `[design, tasks]`
- [ ] 1.12 修改 `packages/core/src/gate-enforcement/index.test.ts`: STAGES 数组
- [ ] 1.13 grep 验证所有 `'plan'` stage 引用都已更新 (排除 Plan type 和 plan 字段)
- [ ] 1.14 修改 `packages/core/src/automator/index.ts`: buildTraceEdges 函数统一使用 STAGES 数组
- [ ] 1.15 添加向后兼容: dispatch 看到 stage: "plan" → 自动映射到 "tasks"
- [ ] 1.16 编译验证: `npm run build -w packages/core && packages/cli`
- [ ] 1.17 运行现有测试确保不破坏

### Section 2: Init 真实实现

- [ ] 2.1 重写 `packages/cli/src/commands/init.ts`: 真实创建 `.spec-graph/` 目录
- [ ] 2.2 创建 `config.yaml` 模板 (项目 context: language, framework, rules, references)
- [ ] 2.3 创建 `sessions/` 空目录
- [ ] 2.4 如果 pack 目录存在, 自动调用 compose → graph.yaml
- [ ] 2.5 `--force` 选项: 覆盖已存在的 .spec-graph/
- [ ] 2.6 `--skip-hook` 选项: 只建目录, 不注册 hook
- [ ] 2.7 自动注册 hook 到 `.claude/settings.json`
  - 检查 settings.json 是否存在
  - 如果存在: 读 + 合并 hook 配置
  - 如果不存在: 创建新文件
  - 保留其他已存在的配置
- [ ] 2.8 hook 路径自动检测:
  - 相对路径: `../packages/core/hooks/dispatch-watcher.mjs` (monorepo)
  - 绝对路径: `/absolute/path/to/packages/core/hooks/dispatch-watcher.mjs` (全局安装)
- [ ] 2.9 添加测试: init 后验证目录结构存在
- [ ] 2.10 添加测试: init 后验证 hook 配置正确
- [ ] 2.11 添加测试: init --force 覆盖已有
- [ ] 2.12 编译验证

### Section 3: Compose 支持 $or/$and

- [ ] 3.1 在 `packages/core/src/composer/index.ts` 添加 `matchesCondition()` 函数
- [ ] 3.2 支持 `applies_when: always` / 缺失 → 总是加载 (已有)
- [ ] 3.3 支持 `applies_when: { dim: true/false, ... }` AND 语义 (已有)
- [ ] 3.4 新增: 支持 `applies_when: { $or: [...] }` → 任一条件匹配
- [ ] 3.5 新增: 支持 `applies_when: { $and: [...] }` → 所有条件匹配
- [ ] 3.6 新增: 支持嵌套组合 (最多 2 层)
- [ ] 3.7 限制超过 2 层嵌套 → 跳过 + warning
- [ ] 3.8 未知操作符 (如 $xor) → 跳过 + warning
- [ ] 3.9 更新测试: backend.pack (使用 $or) 被正确过滤
- [ ] 3.10 更新测试: api-design.pack (使用 $or) 被正确过滤
- [ ] 3.11 更新测试: ddd.pack (5-way $or) 被正确过滤
- [ ] 3.12 添加测试: 嵌套 $or + $and
- [ ] 3.13 添加测试: 超过 2 层嵌套被跳过
- [ ] 3.14 添加测试: 未知操作符被跳过
- [ ] 3.15 编译验证

### Section 4: Tasks Stage 看 Capabilities

- [ ] 4.1 修改 `packages/core/src/automator/index.ts`: nextPrompt 在 tasks stage 时
- [ ] 4.2 把 `plan.capabilities` 注入到 PromptContext 的特殊字段
- [ ] 4.3 修改 dispatch envelope: 在 tasks stage 的 Task Context 里列出每个 capability
- [ ] 4.4 格式: "- capability-id: description" 列表
- [ ] 4.5 要求 sub-agent: "tasks.md MUST cover all capabilities listed"
- [ ] 4.6 修改 `packages/core/knowledge/stages/tasks/gate.yaml`: 添加 traceability 规则
- [ ] 4.7 Gate 验证: tasks.md 覆盖每个 capability
- [ ] 4.8 添加测试: tasks stage prompt 包含 capabilities 列表
- [ ] 4.9 添加测试: tasks.md 缺失 capability 时 gate 失败
- [ ] 4.10 编译验证

### Section 5: Implement Gate 真实检查代码

- [ ] 5.1 修改 `packages/core/src/gate-enforcement/index.ts`: implement stage 的 exit gate
- [ ] 5.2 检查 `implement/` 目录下有至少 1 个源文件 (非 .md)
- [ ] 5.3 如果 `tsc` 可用 (package.json scripts.tsc 存在) → 运行 `tsc --noEmit`
- [ ] 5.4 如果 `vitest` 可用 (package.json scripts.test 包含 vitest) → 运行 `npm test`
- [ ] 5.5 如果 `jest` 可用 → 运行 `npm test`
- [ ] 5.6 如果都没有 → 只检查文件存在
- [ ] 5.7 失败诊断:
  - 空目录 → "missing implementation"
  - tsc 失败 → "typecheck failed: <error>"
  - test 失败 → "test failed: <error>"
- [ ] 5.8 更新 `knowledge/stages/implement/gate.yaml`: 反映代码检查规则
- [ ] 5.9 添加测试: implement gate 失败场景 (空目录)
- [ ] 5.10 添加测试: implement gate 失败场景 (tsc 报错)
- [ ] 5.11 添加测试: implement gate 通过场景 (代码 + 测试都 ok)
- [ ] 5.12 编译验证

### Section 6: 文档更新 (只加不删)

- [ ] 6.1 更新 `README.md`:
  - 添加 dispatch 命令说明 (JSON manifest, 9 段 envelope)
  - 添加 compose 命令说明
  - 添加 machine-state.yaml 文件说明
  - 添加 dispatch-watcher.mjs hook 注册说明
  - 重命名 plan stage → tasks stage
  - 更新 8 阶段 FSM 图
  - 更新 CLI 命令表
- [ ] 6.2 创建 `packages/skills/spec-graph-dispatch/SKILL.md`:
  - 何时使用
  - 前提条件
  - 工作流 (循环 8 次)
  - 并行 dispatch
  - 错误处理
- [ ] 6.3 创建 `packages/skills/spec-graph-init/SKILL.md`:
  - 何时使用
  - 步骤 (创建目录 + 注册 hook)
  - 验证方法
- [ ] 6.4 更新 `packages/skills/spec-graph-plan/SKILL.md`:
  - 重命名 plan stage → tasks stage
  - 更新流程
- [ ] 6.5 添加 deprecation warning 到 auto 命令:
  - `console.warn("[deprecation] spec-graph auto will be removed in 2.0. Use dispatch + hook instead.")`
- [ ] 6.6 添加 deprecation warning 到 next-prompt 命令
- [ ] 6.7 创建 migration guide: `docs/migration-2.0.md`
  - auto → dispatch + hook
  - plan stage → tasks stage
  - XML prompt → 9 段 envelope
- [ ] 6.8 更新 `packages/core/CLAUDE.md`:
  - 反映新流程
  - 删除 external-coordination 引用

### Section 7: E2E 测试 (mock sub-agent)

- [ ] 7.1 创建完整 E2E 测试文件: `packages/core/src/e2e-full-flow.test.ts`
- [ ] 7.2 测试 init → plan → confirm → compose → 8 阶段循环 (mock sub-agent)
- [ ] 7.3 验证 tasks stage 的 prompt 包含 capabilities
- [ ] 7.4 验证 implement gate 真实检查代码
- [ ] 7.5 验证 parallel waves (3 个 independent capability → Wave 0)
- [ ] 7.6 验证 machine-state 与 state.yaml 同步
- [ ] 7.7 验证 round-trip persistence (formatStateYaml → parseStateYaml)
- [ ] 7.8 验证 deprecation warnings 出现 (在 auto 和 next-prompt 命令上)
- [ ] 7.9 编译验证

### Section 8: 验收 (真实跑一遍)

- [ ] 8.1 在 test-project 真实运行一遍 (Claude Code session)
- [ ] 8.2 验证 hook 自动触发 (每次 dispatch)
- [ ] 8.3 验证 sub-agent 真实产出 artifact
- [ ] 8.4 验证 implement stage 产出实际代码
- [ ] 8.5 验证 `tsc --noEmit` 通过
- [ ] 8.6 验证 `vitest run` 通过
- [ ] 8.7 验证 state.yaml 完整 (8 个 artifact, readyForArchive=true)
- [ ] 8.8 验证 machine-state.yaml 完整 (8 个 completed artifact)
- [ ] 8.9 收集真实运行时间 (目标: < 2 小时)
- [ ] 8.10 收集真实 LLM 成本 (目标: < $10)

## 阶段 2: 清理 (删功能)

### Section 9: Deprecation 周期结束

- [ ] 9.1 在阶段 1 发布后等待 1 周
- [ ] 9.2 收集用户反馈
- [ ] 9.3 确认没有外部依赖 auto / next-prompt
- [ ] 9.4 准备删除清单
- [ ] 9.5 发布 1.x 版本 (包含 deprecation warnings)

### Section 10: 删除违反 brain-not-hands 的代码

- [ ] 10.1 删除 `packages/core/src/external-coordination/index.ts`
  - spawn `claude -p`
  - createClaudeCodeAdapter
  - createCodexAdapter
  - runProcess
  - invokeAgent
- [ ] 10.2 从 `packages/core/src/index.ts` 移除 `externalCoordination` 导出
- [ ] 10.3 删除 `packages/core/src/prompt-construction/index.ts`
  - buildPrompt (XML)
  - weaveMethodology
- [ ] 10.4 从 `packages/core/src/index.ts` 移除 `promptConstruction` 导出
- [ ] 10.5 删除 `packages/cli/src/commands/auto.ts`
- [ ] 10.6 从 `packages/cli/src/index.ts` 移除 auto 注册
- [ ] 10.7 删除 `packages/cli/src/commands/next-prompt.ts`
- [ ] 10.8 从 `packages/cli/src/index.ts` 移除 next-prompt 注册
- [ ] 10.9 删除 `packages/core/src/automator/index.ts` 的 `autoRun()` 函数
- [ ] 10.10 删除 `packages/skills/spec-graph-auto/` 整个 SKILL 目录
- [ ] 10.11 grep 验证没有残留引用
- [ ] 10.12 删除相关测试文件
- [ ] 10.13 编译验证

### Section 11: 归档 spec-graph-v2

- [ ] 11.1 确认 spec-graph-v2 提案已被归档
- [ ] 11.2 它的核心承诺 (auto 命令) 已被删除
- [ ] 11.3 在 README 里添加说明: spec-graph 不再支持 auto 命令

### Section 12: 最终验证

- [ ] 12.1 全量测试通过: `npm test`
- [ ] 12.2 编译通过: `npm run build -w packages/core && packages/cli`
- [ ] 12.3 在 test-project 真实运行一遍 (真实 sub-agent)
- [ ] 12.4 验证 8 阶段完整流程
- [ ] 12.5 验证 dispatch + hook 路径是唯一路径
- [ ] 12.6 验证没有 child_process 调用
- [ ] 12.7 发布 2.0.0 版本
  - Breaking change 明确标注
  - Migration guide: `docs/migration-2.0.md`
  - 新文档: dispatch + hook 流程
  - 删除: auto 命令, XML prompt, external-coordination

## 实施依赖

```
阶段 1 的依赖顺序:
  Section 1 (重命名) → Section 4 (tasks stage 看 caps) → Section 5 (implement gate)
  Section 2 (init) → Section 6 (文档) → Section 7 (E2E 测试)
  Section 3 (compose $or) → 独立
  Section 8 (验收) 依赖 Section 1-7 全部完成

阶段 2 的依赖顺序:
  Section 9 (等待 1 周) → Section 10 (删除) → Section 11 (归档) → Section 12 (最终验证)
```

## 验收标准

```
阶段 1 完成后:
  ✓ 新流程能用 (init → dispatch + hook)
  ✓ 老流程能用 (auto + deprecation warning)
  ✓ 所有测试通过
  ✓ 文档完整

阶段 2 完成后:
  ✓ auto / next-prompt / external-coordination 全部删除
  ✓ 没有 child_process 调用
  ✓ 没有 XML prompt 生成
  ✓ 唯一路径: dispatch + hook
  ✓ 全量测试通过
  ✓ 2.0.0 版本发布
```

## 风险与缓解

```
风险 1: 删除 auto 命令影响现有用户
  缓解: deprecation warning 提前 1 周
  缓解: migration guide 详细
  缓解: 1.x 版本先发布, 2.0.0 再删

风险 2: 重命名 plan → tasks 破坏老 session
  缓解: dispatch 自动兼容老 stage 名
  缓解: migration script 可选

风险 3: 删除 external-coordination 模块影响测试
  缓解: 先 grep 所有引用
  缓解: 确认无外部依赖
  缓解: 删除前全量跑测试

风险 4: hook 自动注册失败
  缓解: 手动检查 .claude/settings.json
  缓解: 提供 spec-graph install --hook 命令
  缓解: 文档说明手动配置方法

风险 5: compose $or/$and 解析错误
  缓解: 限制 2 层嵌套
  缓解: 未知操作符跳过
  缓解: 测试覆盖所有 $or/$and pack
```
