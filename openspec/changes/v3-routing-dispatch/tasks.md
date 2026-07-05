## 1. Knowledge 内容迁入 packs

- [x] 1.1 创建 `packs/foundation.pack/stages/` 目录结构（9 个子目录）
- [x] 1.2 将 `knowledge/stages/specify/gate.yaml` 迁入 `packs/foundation.pack/stages/specify/gate.yaml`
- [x] 1.3 将 `knowledge/stages/specs/gate.yaml` 迁入 `packs/foundation.pack/stages/specs/gate.yaml`
- [x] 1.4 将 `knowledge/stages/design/gate.yaml` 迁入 `packs/foundation.pack/stages/design/gate.yaml`
- [x] 1.5 将 `knowledge/stages/tasks/gate.yaml` 迁入 `packs/foundation.pack/stages/tasks/gate.yaml`
- [x] 1.6 将 `knowledge/stages/implement/gate.yaml` 迁入 `packs/foundation.pack/stages/implement/gate.yaml`
- [x] 1.7 将 `knowledge/stages/review/gate.yaml` 迁入 `packs/foundation.pack/stages/review/gate.yaml`
- [x] 1.8 将 `knowledge/stages/test/gate.yaml` 迁入 `packs/foundation.pack/stages/test/gate.yaml`
- [x] 1.9 将 `knowledge/stages/accept/gate.yaml` 迁入 `packs/foundation.pack/stages/accept/gate.yaml`
- [x] 1.10 将 `knowledge/stages/integrate/gate.yaml` 迁入 `packs/foundation.pack/stages/integrate/gate.yaml`
- [x] 1.11 为每个 stage 创建 `stage.yaml`（id, index, label）
- [x] 1.12 将通用 skills 迁入 foundation.pack（brainstorming, design-thinking, specs-authoring, design-authoring, prd, code-generation, story-splitting, code-review, security-hardening, test-strategy, e2e-verification, ci-integration, retrospective）
- [x] 1.13 将 requirement-analysis skill 迁入 `packs/requirement-analysis.pack/stages/specify/skills/`
- [x] 1.14 将 architecture skill 迁入 `packs/architecture.pack/stages/design/skills/`
- [x] 1.15 将 api-design skill 迁入 `packs/api-design.pack/stages/design/skills/`
- [x] 1.16 将 task-decomposition skill 迁入 `packs/task-decomposition.pack/stages/tasks/skills/`
- [x] 1.17 将 `knowledge/shared/` 迁入 `packs/foundation.pack/shared/`
- [x] 1.18 为每个 skill 创建 `manifest.yaml`（id, stage, priority, intent_keywords, agent_compatibility, templates）
- [x] 1.19 删除 `packages/core/knowledge/` 目录

## 2. compose 扩展

- [x] 2.1 compose 扫描 `packs/*/stages/` 收集 skills 列表（id, path, priority）
- [x] 2.2 compose 将合并后的 gate 完整内容写入 graph.yaml 的 `gates[]` 字段
- [x] 2.3 compose 将 skills 列表写入 graph.yaml 的 `stages.{stageId}.skills[]` 字段
- [x] 2.4 compose 输出 `meta.stages_scanned` 统计信息

## 3. dispatch 重构

- [x] 3.1 实现 `resolvePacksDir()` 通过 `require.resolve('@spec-graph/core/package.json')` 定位 core 包
- [x] 3.2 实现 `resolveAgentPath(packName, promptRef)` 返回绝对路径
- [x] 3.3 实现 `resolveSkillPath(packName, stage, skillId)` 返回绝对路径
- [x] 3.4 实现 `resolveOutputPath(stage, sessionId, projectRoot)` 返回绝对路径
- [x] 3.5 实现 `resolveUpstreamPath(artifactPath, sessionId, projectRoot)` 返回绝对路径
- [x] 3.6 重写 `generateDispatchManifest()` 为路由表查询（~80 行）
- [x] 3.7 删除 `STAGE_OUTPUT_MAP` 硬编码
- [x] 3.8 删除 `buildPromptEnvelope()` 函数
- [x] 3.9 删除 `loadSystemPrompt()` 函数
- [x] 3.10 删除 `collectInputArtifacts()` 函数
- [x] 3.11 删除 `buildFallbackEnvelope()` 函数
- [x] 3.12 删除 `loadPackAgents()` 和 `loadPackAgentsFromGraph()`
- [x] 3.13 删除 `findPacksDir()`
- [x] 3.14 支持并行 dispatch：manifest 包含 `actions[]` 数组，每个 action 有独立字段

## 4. gate-enforcement 重构

- [x] 4.1 删除 `knowledgeBasePath` 参数（改为 `packsDir`）
- [x] 4.2 `loadGateConfig()` 从 packs/foundation.pack/stages/ 读取 gate 配置
- [x] 4.3 `buildMergedCriteria()` 使用 packs gate + graph gates 合并
- [x] 4.4 保留 `getBuiltinGate()` 作为 fallback
- [x] 4.5 保留 `parseGateYaml()`（gate.yaml 现在从 packs 读取，仍需解析）

## 5. automator 简化

- [x] 5.1 删除 `STAGE_OUTPUTS` 硬编码（替换为 `STAGE_OUTPUT_FILE` + `stageArtifactPath()`）
- [x] 5.2 output 路径使用约定：`stage → outputFile` 映射保留在 dispatch 中，automator 不再维护
- [x] 5.3 `submitResult()` 中的 artifact 跟踪使用传入的路径，不依赖硬编码

## 6. knowledge-base 模块删除

- [x] 6.1 删除 `packages/core/src/knowledge-base/` 目录
- [x] 6.2 从 `packages/core/src/index.ts` 删除 `knowledgeBase` 导出
- [x] 6.3 删除所有 `import * as knowledgeBase` 引用（更新 planning/recovery/gate-enforcement 注释）
- [x] 6.4 删除相关测试文件（随 knowledge-base 目录一起删除）

## 7. hook 与 coordinator skill 更新

- [x] 7.1 更新 `packages/cli/src/commands/hook.ts` 适配新 manifest 格式（`agent`/`skills` 路径字段）
- [x] 7.2 hook `buildReminder()` 不再引用 `actions[0].prompt`，改为指示 sub-agent 读文件
- [x] 7.3 更新 `packages/skills/spec-graph-auto/SKILL.md`：sub-agent prompt 模板改为 manifest + CRITICAL STEPS 格式
- [x] 7.4 更新 `packages/skills/spec-graph-dispatch/SKILL.md`：dispatch 输出格式说明

## 8. 测试

- [x] 8.1 compose 测试：验证 graph.yaml 包含完整的 stages 和 gates 字段
- [x] 8.2 dispatch 测试：验证 manifest 输出格式和绝对路径解析
- [x] 8.3 dispatch 测试：验证 manifest 不包含 prompt 字段
- [x] 8.4 dispatch 测试：验证并行 dispatch 的 actions 数组
- [x] 8.5 gate-enforcement 测试：验证从 packs 读取 gate 配置
- [x] 8.6 端到端测试：完整 9-stage 流程通过（compose → plan → dispatch 全部验证）
- [x] 8.7 端到端测试：sub-agent 正确读取 packs 中的 agent 和 skill 文件（实验 1-3 验证通过）
- [x] 8.8 路径解析测试：全局安装、项目安装、pnpm 三种场景下 `require.resolve` 正常工作（标准 Node.js 机制验证通过）
