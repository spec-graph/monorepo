## 1. Plan → Tasks 重命名

- [ ] 1.1 修改 `packages/core/src/automator/index.ts`: Stage type union `'plan'` → `'tasks'`, STAGES 数组, STAGE_OUTPUTS 字典
- [ ] 1.2 修改 `packages/core/src/automator/index.ts`: nextPrompt 方法论选择 `stage === 'plan'` → `stage === 'tasks'`
- [ ] 1.3 修改 `packages/core/src/dispatch/index.ts`: STAGE_OUTPUT_MAP `plan:` → `tasks:`
- [ ] 1.4 重命名目录 `packages/core/knowledge/stages/plan/` → `packages/core/knowledge/stages/tasks/`
- [ ] 1.5 更新 `packages/core/packs/foundation.pack/pack.yaml`: agent_bindings `plan: developer` → `tasks: developer`, actions 数组, gate on_transition
- [ ] 1.6 更新 `packages/core/packs/ddd.pack/pack.yaml`: actions 数组, gate on_transition
- [ ] 1.7 更新 `packages/core/src/gate-enforcement/index.test.ts`: STAGES 数组
- [ ] 1.8 更新所有依赖 `'plan'` stage 的测试文件 (grep 验证)
- [ ] 1.9 编译验证: `npm run build -w packages/core && packages/cli`
- [ ] 1.10 运行全量测试确保不破坏

## 2. 移除 Path A (auto + invokeAgent + child_process)

- [ ] 2.1 删除 `packages/core/src/external-coordination/index.ts` (invokeAgent, adapters, runProcess)
- [ ] 2.2 删除 `packages/core/src/prompt-construction/index.ts` (XML 格式)
- [ ] 2.3 从 `packages/core/src/index.ts` 移除 `externalCoordination` 和 `promptConstruction` 导出
- [ ] 2.4 删除 `packages/cli/src/commands/auto.ts`
- [ ] 2.5 删除 `packages/cli/src/commands/next-prompt.ts`
- [ ] 2.6 从 `packages/cli/src/index.ts` 移除 auto 和 next-prompt 注册
- [ ] 2.7 更新 `packages/core/src/automator/index.ts`: 移除 `autoRun()` 函数
- [ ] 2.8 删除相关测试文件: `auto.test.ts`, `next-prompt.test.ts`, `prompt-construction/*.test.ts`
- [ ] 2.9 编译验证
- [ ] 2.10 运行全量测试确保不破坏

## 3. Spec-graph init 真实实现

- [ ] 3.1 重写 `packages/cli/src/commands/init.ts`: 真实创建 `.spec-graph/` 目录
- [ ] 3.2 创建 `config.yaml` 模板 (项目 context)
- [ ] 3.3 创建 `sessions/` 空目录
- [ ] 3.4 如果 pack 目录存在，自动调用 compose → graph.yaml
- [ ] 3.5 `--force` 选项：覆盖已存在的 .spec-graph/
- [ ] 3.6 添加测试: init 后验证目录结构存在
- [ ] 3.7 编译验证

## 4. Pack compose 支持 $or/$and

- [ ] 4.1 在 `packages/core/src/composer/index.ts` 添加操作符解析
- [ ] 4.2 支持 `applies_when: always` / 缺失 → 总是加载 (已有)
- [ ] 4.3 支持 `applies_when: { dim: true/false, ... }` AND 语义 (已有)
- [ ] 4.4 新增: 支持 `applies_when: { $or: [...] }` → 任一条件匹配
- [ ] 4.5 新增: 支持 `applies_when: { $and: [...] }` → 所有条件匹配
- [ ] 4.6 限制最多 2 层嵌套，超过报错
- [ ] 4.7 更新测试: backend.pack (使用 $or), ddd.pack (5-way $or) 被正确过滤
- [ ] 4.8 编译验证

## 5. Plan stage (现 tasks stage) 可见 capabilities

- [ ] 5.1 修改 `packages/core/src/automator/index.ts`: nextPrompt 在 tasks stage 时
- [ ] 5.2 把 `plan.capabilities` 注入到 PromptContext 的特殊字段
- [ ] 5.3 修改 dispatch envelope: 在 tasks stage 的 Output Specification 里
- [ ] 5.4 列出每个 capability 的 description
- [ ] 5.5 要求 tasks.md 覆盖每个 capability
- [ ] 5.6 添加测试: tasks stage prompt 包含 capabilities 列表
- [ ] 5.7 编译验证

## 6. Implement stage gate 真实检查代码

- [ ] 6.1 修改 `packages/core/src/gate-enforcement/index.ts`: implement stage 的 exit gate
- [ ] 6.2 检查 `implement/` 目录下有至少 1 个源文件 (非 .md)
- [ ] 6.3 如果 `tsc` 可用，运行 `tsc --noEmit` 检查 exit code
- [ ] 6.4 如果 `vitest`/`jest` 可用，运行测试检查 exit code
- [ ] 6.5 更新 gate.yaml: implement stage 的 exit criteria 反映代码检查
- [ ] 6.6 添加测试: implement gate 失败场景 (空目录)
- [ ] 6.7 编译验证

## 7. 文档更新

- [ ] 7.1 更新 `README.md`:
  - 删除 `auto` 命令
  - 删除 `next-prompt` 命令
  - 添加 `dispatch` 命令说明 (JSON manifest, 9 段 envelope)
  - 添加 `compose` 命令说明
  - 添加 `machine-state.yaml` 文件说明
  - 添加 `dispatch-watcher.mjs` hook 注册说明
  - 重命名 `plan` stage → `tasks` stage
  - 更新 8 阶段 FSM 图
- [ ] 7.2 更新 `packages/skills/spec-graph-auto/SKILL.md`: 改为 dispatch + hook 路径
- [ ] 7.3 更新 `packages/skills/spec-graph-plan/SKILL.md`: 重命名 plan stage
- [ ] 7.4 创建 `packages/skills/spec-graph-dispatch/SKILL.md`: 新 SKILL 专门处理 dispatch + hook

## 8. E2E 测试

- [ ] 8.1 创建完整 E2E 测试: 真实跑 8 阶段流程 (用 mock sub-agent)
- [ ] 8.2 验证 init → plan → confirm → compose → dispatch (8 次) → done
- [ ] 8.3 验证 tasks stage 的 prompt 包含 capabilities
- [ ] 8.4 验证 implement stage gate 真实检查代码
- [ ] 8.5 验证 parallel wave 正确 (3 个 independent capability → Wave 0)
- [ ] 8.6 验证 machine-state 与 state.yaml 同步
- [ ] 8.7 编译验证 + 全量测试通过

## 9. 验收

- [ ] 9.1 在 test-project 真实运行一遍 (Claude Code session)
- [ ] 9.2 验证 hook 自动触发
- [ ] 9.3 验证 sub-agent 真实产出 artifact
- [ ] 9.4 验证 implement stage 产出实际代码
- [ ] 9.5 验证 `tsc --noEmit` 和 `vitest run` 通过
- [ ] 9.6 验证 state.yaml 完整 (8 个 artifact, readyForArchive=true)
- [ ] 9.7 验证 machine-state.yaml 完整 (8 个 completed artifact)
