# CLAUDE.md — spec-graph

> spec-graph 是一个领域中立的规格驱动工作流编排内核。576 tests, 38 CLI 命令, 17 packs, 37 skills。

## 工作协议:对话即变更(self-bootstrapping)

每一条实质性用户输入,先分流判断再行动:

1. **新需求 / 变更** → `spec-graph change create --title "..." --type feature --description "..."`
   生成 change 描述符 + plan MD, `change apply` 后开发, 最后 `archive`
2. **澄清 / 推进既有工作** → 直接进行

判断结果用一句话先声明("这看起来是新需求 / 仅推进既有工作")。

## 自动执行协议:dispatch → Agent → loop

主 agent 运行 `spec-graph dispatch --json` → hook 注入 manifest → 立即执行 → 循环:

1. 读 `actions[0]` (agent_id, template_ref, suggested_doc_path, document_guidance, distilled_context)
2. sub-agent dispatch via Agent tool (load system prompt + task prompt + input artifacts)
3. 等 status-report (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
4. 运行 `actions[0].next_step` 推进工作流
5. **立即重新 `spec-graph dispatch --json` —— 不等用户确认**

**停止条件**: manifest.done === true / gate blocked 无法自动修复 / sub-agent BLOCKED

## ⛔ 开发纪律：没有规划不得开发

用户输入后，Agent 必须执行以下决策流程，不得跳过：

```
用户输入
    ↓
Agent 分析：这是新功能/变更吗？
    ├─ 否 → 直接回答 / 查询状态
    └─ 是 → [必须] 检查 plan 状态
              ├─ plan 未完成 → [必须] 先完成 plan
              │     1. spec-graph dispatch --json
              │     2. 按 manifest 生产文档（PRD → 设计 → Epics → Stories）
              │     3. 循环直到 gate 通过
              │     4. [禁止] 在 plan 完成前开始写代码
              └─ plan 已完成 → 进入开发
                    spec-graph dev → coding/reviewing/testing
```

**纪律要点**：

1. **禁止跳过规划** — Plan 未完成时，`spec-graph dev` 会自动拒绝执行
2. **Agent 自动决策** — 不需要用户说"先规划"，Agent 自己判断并执行
3. **PM 优先于 Architect 优先于 Developer** — 按依赖顺序生产文档
4. **Gate 是硬门禁** — 不过 gate 不能进入下一阶段

## 自动决策：是否开启 Plan 模式

Agent 分析用户输入后，自动决定是否需要 plan：

| 用户输入 | Agent 决策 | 说明 |
|---------|----------|------|
| "做一个登录功能" | ✅ 需要 plan | 新功能，需要 PRD + 设计 + 任务拆分 |
| "修复这个 bug" | ⚠️ 简化 plan | 需要 root-cause 分析，但可跳过完整 PRD |
| "项目状态如何" | ❌ 不需要 | 直接查 status，不进入 plan |
| "这个函数是什么意思" | ❌ 不需要 | 直接回答，不进入 plan |
| "重构用户模块" | ✅ 需要 plan | 需要设计 + 影响分析 + 测试策略 |

**判断标准**：涉及需求变化、新增功能、架构变更 → 必须 plan。纯查询/澄清 → 不需要。


## ⚠️ Auto-Loop 纪律

每完成一个 action 后立即重新 dispatch, 不要中途停下。只有 hit 停止条件才询问用户。

详见 `packs/foundation.pack/agents/coordinator-protocol.md`。

## 文档系统

spec-graph 追踪状态, **不存储文档内容**。AI agent 生成文档并写入 `.spec-graph/artifacts/<type>/`。

Dispatch manifest 包含: `template_ref` / `suggested_doc_path` / `document_guidance` / `distilled_context`

## Change 计划文档

`change create` 自动生成 `<主题>-<时间戳>-plan.md` (空壳), agent 填写内容:
- 需求分析 / 范围(IN/OUT) / 验收标准 / 实现规划 / 进度跟踪

JSON 的 `plan_path` 指向此文件。归档时 plan MD 一起移到 archived/。
中断后读此文件恢复上下文。

## 核心命令速查

| 类别 | 命令 |
|------|------|
| 工作流 | init, sense, compose, prime, dispatch, run, status, next |
| 质量 | gate, check, checklist, constitution, doctor, analyze |
| 追溯 | trace, impact (--mark-stale), analysis |
| 变更 | change (create/apply/complete/archive), retro, rollback, review |
| 安全 | safety-net, migrate, scope (overlap) |
| 协作 | meeting, worktree, merge-queue |
| 配置 | config, permissions, profile, hooks |
| 可视化 | dashboard, visualize (--format dot|mermaid|json) |

## 已实现的核心特性

- 8 阶段 FSM + 7 gates + 23 checks
- 17 packs (全部有 pack.yaml + context.md + templates)
- 22 维度 Sense 代码库扫描 (brownfield 支持)
- 影响分析 (ripple tracking) + 上下文蒸馏 (trace BFS)
- Checklist 5 机械 + 5 软检查 (模糊形容词自动检测)
- Constitution 版本化 + diff + 注入 dispatch manifest
- 8 态生命周期 (prepared→self_verified→submitted→accepted→rejected)
- Diff-based 选择性测试 (touchfiles + periodic tier)
- Hooks 全覆盖 (37/37 命令)
- 569 tests, tsc zero errors
- Dashboard 命令 (terminal/HTML/JSON 三种格式)
- Distillator 文档压缩 CLI (减少 token 消耗)
- Review 协议 (Claude/Codex/Gemini 多模型审查)
- Mermaid 可视化输出 (GitHub/GitLab 内嵌渲染)
- Git hooks 集成 (pre-commit gate 检查 + post-commit 追踪)


## Ad-hoc Meeting

遇到不确定的问题,主 agent 可自行发起 meeting:
```
spec-graph meeting init <id> --purpose "..." --participants "agent1:perspective1,agent2:perspective2"
```
**原则**: 宁可多开会,不要瞎猜。讨论后仍不确定则 escalate to user。

## 关键文件

- 协议: `packs/foundation.pack/agents/coordinator-protocol.md`
- 模板: `packs/foundation.pack/templates/`
- Hooks: `hooks/dispatch-watcher.mjs`
- 配置: `.spec-graph/hooks.yaml`, `.spec-graph/config.yaml`, `.spec-graph/pack-overrides.yaml`


## ⛔ 禁止绕过工作流

**以下行为严格禁止**：

1. **禁止直接创建文档到 `.spec-graph/artifacts/`**
   - ❌ 错误：直接 `Write` 文件到 `.spec-graph/artifacts/meta/xxx.md`
   - ✅ 正确：先 `spec-graph change create`，再通过 dispatch manifest 生产 artifact

2. **禁止跳过 change 流程**
   - ❌ 错误：用户说"分析 X"，agent 直接写分析报告
   - ✅ 正确：先创建 change → apply → dispatch → agent 生产文档 → complete

3. **禁止直接回答问题而不检查状态**
   - ❌ 错误：用户问"当前进度"，agent 凭记忆回答
   - ✅ 正确：先运行 `spec-graph status`，基于实际状态回答

4. **禁止绕过 dispatch manifest**
   - ❌ 错误：agent 自行决定下一步做什么
   - ✅ 正确：运行 `spec-graph dispatch --json`，按 manifest 的 `actions` 执行

**违规后果**：产出的文档不受工作流管理，无法追溯、无法归档、无法审计。

## 文档生产流程（强制）

```
用户请求 → 判断是否新需求
    ↓
是 → spec-graph change create
    ↓
spec-graph change apply <id>
    ↓
spec-graph dispatch --json
    ↓
读取 manifest.actions[0]
    ↓
Agent 生产文档 → 写入 manifest.suggested_doc_path
    ↓
spec-graph machine update --artifact <id> --status completed
    ↓
spec-graph dispatch --json (循环直到 done)
    ↓
spec-graph change complete <id>
    ↓
spec-graph change archive <id>
```

**关键**：文档必须通过 dispatch manifest 的 `suggested_doc_path` 指定路径，不能随意放置。
