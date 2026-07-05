## Why

spec-graph 当前存在三个相互关联的架构问题：

1. `knowledge/` 目录不在 npm 发布中（未列入 `package.json` 的 `files` 字段），导致 gate enforcement 在生产环境中降级到只有 2 条规则的 builtin gate，13 条详细质量标准（proposal-structure、capabilities-enumerated、user-stories-present 等）形同虚设。
2. dispatch 模块（~600 行）承担了大量不属于它的职责：读取 agent 文件内容、读取 skill instruction、拼接 9-section prompt envelope、将巨大 markdown 字符串塞入 JSON 序列化。
3. `STAGE_OUTPUTS`（automator）和 `STAGE_OUTPUT_MAP`（dispatch）两处硬编码 stage → output 映射，新增 stage 需改两处源码。

## What Changes

- `knowledge/` 目录内容迁入 `packs/`，随 npm 发布
- dispatch 从"prompt 组装引擎"变为"路由表查询器"（~600 行 → ~100 行）
- dispatch manifest 不再内联 agent prompt 和 skill instruction 内容，只输出路径指针
- sub-agent 按 manifest 路径自行读取 agent 角色文件、skills 目录、upstream 文档
- stage output 路径从硬编码改为约定（`stage → outputFile` 固定映射）
- gate enforcement 从 graph.yaml 读取 gate 配置（compose 时已合并完整内容），不再依赖 knowledge/ 目录
- 删除 `knowledge-base` 模块
- dispatch manifest 中所有路径输出为绝对路径，通过 `require.resolve` 定位 `@spec-graph/core` 安装位置

## Capabilities

### New Capabilities

- `routing-dispatch`: dispatch 模块重构为路由表查询器，输出轻量 manifest（agent 路径、skills 路径、intent、upstream、output、checks），不再组装 prompt
- `sub-agent-file-reading`: sub-agent 按 manifest 中的绝对路径自行读取 agent 角色文件、skills 目录（instruction.md + templates）和 upstream 产出物，自主理解并执行任务
- `absolute-path-resolution`: dispatch 通过 `require.resolve('@spec-graph/core/package.json')` 定位 core 包安装位置（全局/项目/pnpm 均可），输出绝对路径

### Modified Capabilities

- `knowledge-migration`: 完成 knowledge → packs 迁移，gate.yaml 和 skills 内容迁入 foundation.pack 和对应 planning pack 的 `stages/` 目录，确保随 npm 发布
- `dispatch-specs`: dispatch manifest 格式从嵌套 prompt 改为路由指针（agent/skills 路径），支持并行 dispatch 的 actions 数组
- `dispatch-cli`: dispatch CLI 输出从完整 prompt JSON 改为路由 manifest JSON

## Impact

- `packages/core/src/dispatch/index.ts`: 大幅重构，删除 buildPromptEnvelope/loadSystemPrompt/collectInputArtifacts 等函数
- `packages/core/src/automator/index.ts`: 删除 STAGE_OUTPUTS 硬编码
- `packages/core/src/gate-enforcement/index.ts`: 删除 knowledgeBasePath 参数，改从 graph.yaml 读取 gate 配置
- `packages/core/src/knowledge-base/`: 删除整个模块
- `packages/core/knowledge/`: 删除整个目录（内容迁入 packs）
- `packages/core/packs/foundation.pack/`: 新增 `stages/` 目录（9 个 stage 的 stage.yaml + gate.yaml + skills）
- `packages/core/packs/{requirement-analysis,architecture,api-design,task-decomposition}.pack/`: 新增 `stages/` 目录（各自领域的 skill）
- `packages/core/src/composer/index.ts`: 新增扫描 `packs/*/stages/` 收集 skills 列表，写入 graph.yaml
- graph.yaml 格式：新增 `stages` 字段（skills 路由）和完整 gate 配置
