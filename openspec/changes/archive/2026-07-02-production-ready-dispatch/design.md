## Context

spec-graph 是一个"大脑非双手"的开发工具，通过 8 阶段 FSM 生成 prompts 派发给外部 AI agent 执行。当前 dispatch 模块（`packages/core/src/dispatch/index.ts`, 684 行）已实现 manifest 生成、prompt envelope 组装、parallel wave 规划。但以下基础设施仍缺失或断裂：

1. **pack composer 是存根**: `compose` CLI 只调用 `loadKnowledgeBase()`，dispatch 内联了 `loadPackAgents()` 直接扫描 pack 目录，不按 priority 合并、不过滤 `applies_when`
2. **state 持久化不完整**: `formatStateYaml()` 不写 `dependsOn`/`previousDiagnoses`/`plan.order`/`readyForArchive`；`parseStateYaml()` 硬编码 `completedArtifacts: []`、`previousDiagnoses: []`、`retryCount: 0`
3. **machine-state 无追踪**: 没有 artifact/check 的运行时状态文件，gate 评估只能检查文件是否存在（dispatch/index.ts:615-649）
4. **compose ↔ dispatch 断裂**: compose 产出的 graph.yaml 不被 dispatch 消费，dispatch 自己内联 pack 扫描

修复策略：pack composer 是 graph.yaml 的单一来源；machine-state tracker 是状态查询的单一来源；state persistence 确保 crash-recovery；dispatch 改为消费 graph.yaml。

## Goals / Non-Goals

**Goals:**
- pack composer 扫描 17 个 pack.yaml，按 `applies_when` (AND 语义) 过滤，按 priority 合并，产出完整 Graph → graph.yaml
- dispatch 从 graph.yaml 读取 agent 配置和绑定，不再直接扫描 pack 目录
- parseStateYaml 完整恢复 formatStateYaml 写入的所有字段（包括 plan.order、dependsOn、previousDiagnoses、retryCount、readyForArchive）
- machine-state tracker 追踪 artifact/check 状态，gate 评估用其判断
- sub-agent prompt envelope 验证：确认 9 段协议（Identity/System Prompt/Task Context/Input Artifacts/Output Spec/File Scope/Verification/Status Report/After Completion）正确填充

**Non-Goals:**
- 不在此变更中实现 Phase 2（worktree/parallel dispatcher/integration runner）
- 不在此变更中实现 Phase 3（meeting/contract/trace）
- 不改现有的 8-stage FSM 架构

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION-READY DISPATCH                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  packs/*.pack/pack.yaml                                             │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────┐     ┌───────────────┐                                 │
│  │  sense   │────▶│ pack-composer │────▶ .spec-graph/graph.yaml     │
│  │  profile │     │ (NEW)         │                                 │
│  └──────────┘     └───────────────┘                                 │
│                           │                                         │
│                           ▼                                         │
│  ┌──────────────────────────────────────────────┐                   │
│  │              dispatch (MODIFIED)             │                   │
│  │  reads graph.yaml instead of scanning packs  │                   │
│  └──────────────────────┬───────────────────────┘                   │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────┐                   │
│  │           dispatch manifest JSON             │                   │
│  │  (consumed by dispatch-watcher.mjs hook)     │                   │
│  └──────────────────────┬───────────────────────┘                   │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────┐                   │
│  │            sub-agent execution               │                   │
│  │    (Claude Code Agent tool via hook)         │                   │
│  └──────────────────────┬───────────────────────┘                   │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────┐                   │
│  │   spec-graph advance --result '{...}'        │                   │
│  │         → automator.submitResult()           │                   │
│  │           → gate evaluation                  │                   │
│  │             → trackArtifact()                │                   │
│  └──────────────────────┬───────────────────────┘                   │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────┐                   │
│  │  .spec-graph/                                │                   │
│  │  ├── graph.yaml          (compose 产出)      │                   │
│  │  ├── machine-state.yaml  (运行时追踪)         │                   │
│  │  └── sessions/<id>/                           │                   │
│  │      └── state.yaml      (session 元数据)     │                   │
│  └──────────────────────────────────────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Decisions

### Decision 1: pack composer 独立模块，dispatch 消费 graph.yaml

**选择**: 新建 `packages/core/src/composer/index.ts`，CLI `compose` 调用此模块。dispatch 调用 `composer.composeGraph()` 或直接读取 graph.yaml 获取 Graph。

**替代方案**: 在 dispatch 内继续内联 pack 扫描 → 拒绝。compose 和 dispatch 是不同的关注点：compose 负责"组装静态配置"，dispatch 负责"基于运行时状态生成动态指令"。内联导致 priority/profile 逻辑重复。

### Decision 2: applies_when 使用 AND 语义

**选择**: 所有 `applies_when` 中的 fact 必须全部匹配（AND）。`applies_when: always` 永远命中。

```
pack.applies_when = { has_ui: true, has_db: true }
profile.facts = { has_ui: true, has_db: false }
→ pack NOT loaded (has_db mismatches)
```

**替代方案**: OR 语义 → 拒绝。OR 会导致不相关的 pack 意外加载（如 `{has_ui: true, has_db: true}` 在纯前端项目中匹配 has_ui 就加载，带入不需要的 DB check）。

### Decision 3: machine-state.yaml 格式

**选择**: 简单 YAML 字典格式：
```yaml
artifacts:
  requirement/proposal: { status: completed, path: ..., producer: pm, updated_at: ... }
  design/design.md: { status: pending }
checks:
  lint: { status: pending }
  unit-test: { status: pending }
```
status 值: `pending | in_progress | completed | failed`

**替代方案**: JSON → 拒绝，用户可能需要手动编辑。SQLite → 拒绝，过度设计。

### Decision 4: parseStateYaml 修复策略

**选择**: 重写为基于状态机的分段解析器，先匹配 section marker（plan:/trace:/completedArtifacts:/previousDiagnoses:），在段内逐行匹配 regex。

**替代方案**: 引入 js-yaml 作为 session parser → 部分接受：loadSessionPlan 已在用 js-yaml，但 automator 的 session cache 使用 parseStateYaml。保持两个解析路径最小化改动。

### Decision 5: dispatch 消费 graph.yaml 的方式

**选择**: dispatch 接受可选的 `graphPath` 参数。如果 graph.yaml 存在则读取；否则 fallback 到内联 pack 扫描（向后兼容）。

```
generateDispatchManifest(sessionId, projectRoot, packsDir?, graphPath?)
```

**替代方案**: 强制要求 compose 先运行 → 拒绝。增加使用复杂度，且交互式开发中用户可能想跳过 compose。

### Decision 6: check-run 安全约束

**选择**: `check-run` CLI 执行 check 命令前检查 constitution 中的 `security.command_whitelist` 和 `security.forbidden_patterns`。哨兵命令（`<...>` 格式）始终安全（走 TS dispatch，不调 shell）。

**替代方案**: 无约束执行 → 拒绝。pack 是用户可编辑的 YAML，任意 shell 命令执行是安全隐患。

**已知限制**: 黑名单方式（ban `&&`, `curl`, `sudo`）是 best-effort 防护，可被 `$(...)`、函数别名等方式绕过。真正的沙箱需要 OS-level isolation（Phase 2/3）。

### Decision 7: applies_when 匹配语义

**选择**: `applies_when` 检查的是 profile fact **维度是否存在**，而非匹配 fact 的 value 字符串。

```
pack.applies_when = { has_ui: true }    → "has_ui 维度必须存在于 profile.facts 中"
pack.applies_when = { has_ui: false }   → "has_ui 维度必须不存在于 profile.facts 中"
pack.applies_when = { has_db: true }    → "has_db 维度必须存在"
```

匹配逻辑：
1. `applies_when: always` → 永远加载
2. `applies_when: { dim: true }` → `profile.facts[dim]` 存在且 value 非空 → 匹配
3. `applies_when: { dim: false }` → `profile.facts[dim]` 不存在或 value 为空 → 匹配
4. 多个 fact → ALL 必须匹配（AND 语义）

**为什么不匹配 fact.value 字符串**: `ProfileFact.value` 是项目具体值（如 `"react"`, `"postgres"`），而 pack 的 `applies_when` 关心的是"项目有没有 UI/数据库"这个维度。匹配具体值会导致 pack 过于脆弱（换一个框架就失效）。

### Decision 8: applies_when 缺失时的默认行为

**选择**: pack 未声明 `applies_when` 时，视为 `applies_when: always`（总是加载）。

**替代方案**: 视为不匹配 → 拒绝。会导致所有未声明 `applies_when` 的 pack 静默不被加载，且与 `always` 的显式语义不一致。

### Decision 9: machine-state 写入策略

**选择**: machine-state tracker 使用 atomic write（写临时文件 → rename）避免并发写入损坏 YAML。trackArtifact/trackCheck 先读取当前 machine-state.yaml，修改内存中的对象，再 atomic write 回磁盘。

**替代方案**: 直接覆盖写入 → 拒绝。两个进程同时写入会损坏 YAML 文件。

### Decision 10: dispatch gate 评估的三级 fallback 链

**选择**: dispatch 的 `evaluateGateStatus` 使用三级 fallback：

1. **machine-state.yaml**（优先）— 检查 artifact/check 运行时状态
2. **文件存在性检查**（fallback）— 当 machine-state.yaml 不存在时
3. **session diagnosis**（最后）— 当上述都无法判断时

machine-state 是 "best-effort mirror"，automator 的 `evaluateGate()` 才是真正的 gate keeper。dispatch 消费 machine-state 仅用于 manifest 展示，不参与 automator 的状态推进决策。

**替代方案**: dispatch 直接调用 automator.status() → 拒绝。dispatch 需要独立于 automator 运行（由 hook 触发），不应加载完整 session。

## Risks / Trade-offs

- **pack-composer 依赖 sense profile**: compose 时需要 ProfileFacts 来判断 applies_when 匹配，但 sense 可能误判 → 保守处理：不匹配的 pack 默认不加载；用户可通过 `.spec-graph/config.yaml` 覆盖 profile facts
- **空 profile 场景**: sense 可能对新项目/空目录产生空 facts → composer 在 profile 为空时只加载 `applies_when: always` 的 pack（foundation 等），其他 pack 需要至少一个 fact 维度匹配才加载
- **machine-state 与 session state 可能不一致**: 两个文件分离 → machine-state 是状态查询的权威来源，session state.yaml 是 session 元数据；不一致时以 machine-state 为准
- **intervene 操作绕过 machine-state**: `force-advance`/`rollback` 直接修改 session state 但不更新 machine-state → 修复：intervene 也调用 `trackArtifact` 同步状态（见 tasks 3.11）
- **两套 gate 评估机制**: automator 用 gate-enforcement 模块（文件内容匹配），dispatch 用 machine-state（状态查询）→ 前者是权威 gate keeper，后者是 best-effort mirror 用于 manifest 展示；两者职责不同，不互相替代
- **graph.yaml 可能过期**: pack 文件修改后 graph.yaml 不会自动更新 → compose 命令设计为幂等且快速（<100ms），用户应在 pack 变更后重新运行；未来可加 checksum 检测（Phase 2）
- **parseStateYaml 仍是自定义解析器**: js-yaml 更健壮 → 待 machine-state 稳定后可完全迁移到 js-yaml；dispatch 中 `loadSessionPlan` 已用 js-yaml 读同一文件，存在双解析器
- **check-run 安全性是 best-effort**: 黑名单可被绕过 → sentinel 命令（`<...>`）始终安全（TS dispatch）；真正的沙箱需 OS-level isolation（Phase 2/3）
- **并发写入 machine-state.yaml**: 两个进程同时 `trackArtifact` → atomic write（tmp file + rename）防止损坏，但不提供分布式锁语义（单机场景足够）
