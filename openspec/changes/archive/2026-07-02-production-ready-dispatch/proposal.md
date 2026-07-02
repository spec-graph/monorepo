## Why

spec-graph 当前有三个基础设施缺口和一个集成断裂，导致系统无法可靠地从 plan 走到 sub-agent dispatch：

1. **pack composer 是存根**: `compose` CLI 只调用 `loadKnowledgeBase()`，不扫描 pack.yaml、不过滤 profile、不产出 graph.yaml
2. **state 持久化不完整**: `formatStateYaml` 不写 `dependsOn`/`previousDiagnoses`/`plan.order`/`readyForArchive`；`parseStateYaml` 硬编码丢失 `completedArtifacts`、`previousDiagnoses`、`retryCount`
3. **machine-state 无追踪**: 没有 artifact/check 的运行时状态文件，gate 评估只能检查文件是否存在，重启后丢失所有进度
4. **dispatch 与 compose 断裂**: dispatch 内联了 `loadPackAgents()` 直接扫描 pack 目录，不尊重 priority/profile，且 compose 的产出（graph.yaml）无人消费

这些问题的累积效应：进程重启后 spec-graph 丢失 session 进度、无法正确评估 gate、sub-agent 拿到不完整的 agent 绑定。

## What Changes

- **pack composer**: 扫描 17 个 pack.yaml → 按 `applies_when` (AND 语义) 过滤 → 按 priority 合并 agents/bindings/gates/checks → 产出 `.spec-graph/graph.yaml`
- **state persistence 完整修复**: `formatStateYaml` 写入所有字段 → `parseStateYaml` 完整恢复 → round-trip 等价性保证
- **machine state tracker**: 新增 artifact/check 运行时状态追踪，写入 `.spec-graph/machine-state.yaml`，gate 评估使用该状态判断通过/失败
- **dispatch 集成 graph.yaml**: dispatch 从 graph.yaml 读取 agent 配置和绑定，不再直接扫描 pack 目录
- **CLI 命令补全**: `compose` 替换存根；新增 `artifact-complete`、`check-run` 子命令供 hook/用户标记状态

## Capabilities

### New Capabilities

- `pack-composer`: 扫描 pack.yaml，profile 过滤 (AND 语义)，priority 合并，产出 Graph → graph.yaml
- `machine-state-tracker`: 追踪 artifact/check 运行时状态，持久化到 machine-state.yaml，提供查询 API
- `state-persistence-fix`: 完整 round-trip — formatStateYaml 写入全部字段，parseStateYaml 完整恢复
- `dispatch-integration`: dispatch 消费 graph.yaml + machine-state.yaml，消除内联 pack 扫描

### Modified Capabilities

- `compose`: 替换存根，接入 pack-composer
- `dispatch`: 从 graph.yaml 读取配置替代内联 `loadPackAgents()`；gate 评估改用 machine-state.yaml

## Impact

- 修改文件: `automator/index.ts`、`dispatch/index.ts`、`compose.ts`、`index.ts`
- 新增文件: `composer/index.ts`、`machine-state/index.ts`、`cli/artifact-complete.ts`、`cli/check-run.ts`
- 新增状态文件: `graph.yaml`（compose 产出）、`machine-state.yaml`（运行时追踪）
- 不影响: 8-stage FSM、gate evaluation 核心逻辑、prompt construction、external-coordination、knowledge-base
