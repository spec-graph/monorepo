## Context

spec-graph 是一个声明式开发工作流引擎。当前架构中存在三套内容管理系统：`packs/`（compose 产物）、`knowledge/`（gate 和 skills）和 `packages/skills/`（coordinator 协议）。`knowledge/` 未列入 npm `files` 字段导致生产环境中 gate enforcement 降级；dispatch 模块承担了不属于它的 prompt 组装职责（~600 行）；stage output 映射硬编码在两处。

实验验证了 Claude Code Agent tool dispatch 的 sub-agent 会主动读取 manifest 中指定的文件（3 个实验全部通过），核心假设成立。

## Goals / Non-Goals

**Goals:**

- `knowledge/` 内容迁入 `packs/`，随 npm 发布，gate enforcement 在生产环境中使用完整质量标准
- dispatch 从 ~600 行 prompt 组装代码精简为 ~100 行路由表查询
- sub-agent 按 manifest 绝对路径自行读取角色、方法论和上游文档
- 消除 `STAGE_OUTPUTS` 和 `STAGE_OUTPUT_MAP` 硬编码
- manifest JSON 从几万字缩减为 ~200 字节

**Non-Goals:**

- 不修改 `packages/skills/`（coordinator skills 独立系统）
- 不修改 `spec-graph init` 的 git clone 安装方式
- 不修改 pack.yaml 格式和 gate_patches 机制
- 不修改 9-stage FSM 顺序
- 不修改 compose 的过滤 + 合并核心逻辑（只扩展 stages 字段收集）

## Decisions

### 1. knowledge 内容迁入 packs，而不是加入 npm files

**选择**: 迁入 `packs/foundation.pack/stages/` 和对应 planning pack

**理由**: packs 已有成熟的 compose 合并机制（priority 覆盖、gate_patches），knowledge 内容（gate.yaml + skills）天然适合这个机制。如果只加 `knowledge/` 到 files，两套系统继续并存，问题没有根本解决。

**替代方案**: 将 `knowledge/` 加入 `package.json` 的 `files` 字段。简单但不解决双轨制，compose 仍需合并两套来源。

### 2. dispatch 输出绝对路径，不用相对路径或约定

**选择**: manifest 中所有路径为绝对路径（如 `/usr/local/lib/node_modules/@spec-graph/core/packs/.../pm-agent.md`）

**理由**: `npm install -g`、项目安装、pnpm 虚拟存储的路径结构不同。`require.resolve('@spec-graph/core/package.json')` 是 Node.js 包定位的标准机制，跨安装方式统一可用。相对路径依赖 sub-agent 工作目录，不可靠。

**替代方案**: 使用 `node_modules/@spec-graph/core/packs/...` 相对路径。在 pnpm 等包管理器中可能解析失败。

### 3. sub-agent 自己读文件，而不是 dispatch 内联内容

**选择**: dispatch 输出路由 manifest，sub-agent 收到后调用 Read 工具读取 agent 文件和 skill 目录

**理由**: 实验验证了核心假设（3 个实验全部通过）。dispatch 不应承担 prompt 组装职责，那会使其成为 prompt 模板引擎而非路由表。sub-agent 读文件后能自主理解角色和方法论，减少 dispatch 的耦合。

**替代方案**: dispatch 继续内联内容。dispatch 保持 ~600 行，JSON 中嵌几万字 prompt，难以调试和转义。

### 4. stage output 用约定，不用配置

**选择**: `specify → proposal.md`, `design → design.md` 等 9 个固定映射写在 dispatch 中作为代码事实

**理由**: 9 个 stage 的产出物是框架固定的，不需要 per-pack 配置。硬编码为约定（代码事实）比 YAML 配置简单，且不需要 compose 传递这些信息。

**替代方案**: 在 `stage.yaml` 中声明 output，compose 写入 graph.yaml，dispatch 从 graph 读。增加了一层间接，但 9 个 stage 的产出物永远不会变。

### 5. gate 配置由 compose 写入 graph.yaml

**选择**: compose 时合并 foundation gate + pack gate_patches，将完整 gate criteria 写入 graph.yaml

**理由**: gate enforcement 不再依赖 `knowledgeBasePath` 参数，直接读 graph.yaml。production 环境中 graph.yaml 包含完整 gate 配置，不会降级。

**替代方案**: gate enforcement 直接读 `packs/*/stages/*/gate.yaml`。需要 gate enforcement 知道 packs 路径，增加耦合。

### 6. 并行 dispatch 使用 actions 数组

**选择**: manifest 单 action 时用顶层字段，多 action（implement stage）时用 `actions[]` 数组，每个 action 有独立的 agent/skills/upstream/output/checks

**理由**: 当前 manifest 已支持 `parallel_group`，扩展为 actions 数组自然。每个 capability 可能有不同的 agent 和 skill 需求。

## Risks / Trade-offs

**[sub-agent 不读文件]** → gate enforcement 是安全网：产出物结构不符合 gate criteria 会失败并 retry。manifest 中使用 `CRITICAL STEPS` 结构化指令提高遵循率。实验 1-3 验证了 sub-agent 可靠读文件。

**[skill 选择复杂度从 dispatch 转移到 main agent]** → graph.yaml 的 `stages[stage].skills[]` 提供候选列表，main agent 根据 manifest.yaml 的 `intent_keywords` 匹配。如果匹配逻辑复杂度过高，可退化为"加载该 stage 所有 skill"。

**[graph.yaml 过时]** → dispatch 检查 graph.yaml 的 `meta.composed_at` 与 packs/ 目录 mtime，差异过大时触发自动 recompose。

**[sub-agent 对 manifest 字段理解不一致]** → 字段命名使用直观语义（`role_file`, `skills_dirs`, `context_files`），在 sub-agent prompt 中给出字段说明。

**[路径不可达]** → dispatch 使用 `require.resolve` 解析绝对路径，跨安装方式统一。如果 `@spec-graph/core` 未安装，dispatch 本身就会失败（依赖导入），不会到达 manifest 生成阶段。
