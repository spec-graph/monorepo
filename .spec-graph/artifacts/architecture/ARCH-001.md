---
id: design/architecture/ARCH-001
kind: design/architecture
status: completed
created_at: 2026-06-27T15:00:00Z
author: AI Agent
---

# 架构文档: spec-graph 内核架构

## 概述

spec-graph 采用**三层架构**:声明式 Pack 层 → 确定性 Compose 层 → 强制 Enforce 层。内核只有 6 个领域无关原语,所有领域知识通过 pack 注入。

## 系统上下文

```
┌─────────────────────────────────────────────────────────────┐
│                    Coordinator (Claude/Codex)                │
│  - 读取 dispatch manifest                                     │
│  - Dispatch sub-agent via Agent tool                         │
│  - 生成文档内容并写入 .spec-graph/artifacts/                  │
└────────────────────┬────────────────────────────────────────┘
                     │ spec-graph dispatch --json
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      spec-graph (本系统)                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Sense     │  │   Compose    │  │   Enforce    │      │
│  │ (LLM+扫描)   │  │  (确定性)     │  │  (FSM/gate)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Dispatch   │  │   Machine    │  │    Trace     │      │
│  │   Engine     │  │   Engine     │  │    Index     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Project Filesystem                        │
│  .spec-graph/                                               │
│  ├── graph.yaml        ← spec-graph 管理                    │
│  ├── machine-state.yaml ← spec-graph 管理                  │
│  ├── profile.yaml      ← spec-graph 管理                    │
│  ├── constitution.yaml ← spec-graph 管理                    │
│  ├── artifacts/<type>/  ← AI Agent 写入(spec-graph 追踪)    │
│  ├── analysis/          ← spec-graph 管理(元数据)           │
│  └── changes/           ← spec-graph 管理(变更记录)         │
└─────────────────────────────────────────────────────────────┘
```

## 内核 6 原语

| 原语 | 定义 | 领域概念如何坍缩 |
|------|------|------------------|
| **Work-unit** | 有状态的工作节点 | story / task / phase 步骤 |
| **Artifact** | 带类型的产物 | PRD / wireframe / api-spec / 固件镜像 |
| **Contract** | = 一个有 producer 边和 consumer 边的 typed Artifact | API spec、库签名、文件格式、消息 schema |
| **Check** | 声明式校验(shell 命令或规则) | 单测 / 契约测试 / Lighthouse / 烧录 HIL |
| **Gate** | 状态转移上的不变量条件 | 入口/出口门 = "转移前这组 Check/Trace 必须满足" |
| **Trace-edge** | 任意节点→任意节点的 typed 边 | JTBD→REQ→Story→Test→Commit |

**内核不准写** target 类型枚举表,也不准把 "contract" 预设成 API。

## 三段式管线: Sense → Compose → Enforce

### ① Sense(感知)
- **输入**: 用户描述 + 现有 repo
- **输出**: `profile.yaml`(9 维事实集)
- **LLM 参与**: 是(分类自由文本)
- **确定性扫描**: 是(检测 package.json/Cargo.toml 等)

### ② Compose(合成)
- **输入**: profile.yaml + pack 库
- **输出**: `graph.yaml`(具体的图:action 序列 + artifact 注册 + check 挂载)
- **LLM 参与**: 否(纯规则引擎)
- **规则**: pack 的 `applies_when` 匹配 profile → 取并集 + 去重 + 依赖解析

### ③ Enforce(强制)
- **输入**: graph.yaml + 当前状态
- **输出**: 状态转移决策 / gate 评估结果
- **LLM 参与**: 否(完全等同 wdf 的 FSM/gate)
- **机制**: 入口/出口门检查 + trace 评估 + contract 漂移检测

## 关键模块

### src/engine/next/index.ts
- `computeNextPlan(graph, state, traceIndex, projectRoot)` 异步函数
- 计算: missing_artifacts / failed_checks / missing_traces / missing_contracts / forbidden_violations
- 输出: NextPlan + suggested_actions

### src/commands/dispatch.ts
- `buildDispatchManifest(plan, ...)` 异步函数
- 为 produce_artifact 动作添加: template_ref / suggested_doc_path / document_guidance
- 为 run_check 动作添加: check_command(实际 shell 命令)
- 为 verify_trace 动作添加: trace_query(查询详情)

### src/engine/machine/index.ts
- StateMachineEngine 管理 machine-state.yaml
- evaluateGate 检查: artifacts / checks / traces / contracts / forbidden
- transition 执行状态转移并记录 history

### src/engine/enforce/index.ts
- 导出: loadContractRegistry / loadForbiddenInvariants / collectDriftedConsumers
- 被 next/index.ts 和 machine/index.ts 共用(消除重复)

### src/engine/meeting/index.ts
- MeetingRuntime 持久化到 .spec-graph/meetings/<id>.yaml
- 支持声明的 meeting 和 ad-hoc meeting
- 多轮广播式讨论,coordinator 主导

## 数据流

```
用户输入 → spec-graph init
  ↓
sense(profile.yaml) → compose(graph.yaml) → prime(machine-state.yaml)
  ↓
spec-graph dispatch --json
  ↓ (返回 manifest)
AI Agent 读 manifest
  ↓
AI Agent 读模板(packs/.../templates/*.md)
  ↓
AI Agent 生成内容 → 写入 .spec-graph/artifacts/<type>/*.md
  ↓
spec-graph checklist <artifact-id>(质量检查)
  ↓
spec-graph analysis --phase <phase> --docs <path>(追踪链接)
  ↓
spec-graph artifact complete <artifact-id>(标记完成)
  ↓
spec-graph dispatch --json(下一步)
  ↓
...循环直到 manifest.done === true
```

## 技术决策

### 1. 为什么 TypeScript?
- 复用 wdf-method 已验证的 FSM/gate/traceability 实现
- 类型安全,降低 bug 率
- Node.js 生态丰富

### 2. 为什么纯 CLI,不做 UI?
- AI Agent 通过 Bash 调用,CLI 是天然接口
- 减少复杂度,专注内核
- UI 可后续作为 pack 提供

### 3. 为什么不存储文档内容?
- 关注点分离: spec-graph 专注状态,内容由 AI Agent 生成
- 灵活性: AI Agent 可自由调整结构
- Git 友好: 文档是普通 markdown

### 4. 为什么 6 原语,不是更多?
- 足够表达所有领域概念(已纸面验证)
- 避免内核膨胀
- 强制 pack 设计者用组合而非新原语

## 测试覆盖

- **35 个测试文件**
- **484 个测试用例**
- **全部通过** ✅

关键测试领域:
- Dispatch manifest 生成和字段
- 状态机转移和 gate 评估
- 会议协议和运行时状态
- 契约漂移检测
- 追溯系统
- Checklist 质量检查
- Analysis 链接追踪
- Constitution 版本化
- 项目配置注入

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 中立内核过于抽象,用户难上手 | 高 | 提供官方电池包(foundation/frontend/backend) |
| Pack 生态未建立 | 中 | 先用 wdf-method 的 pack 作为参考实现 |
| AI Agent 不遵守 manifest 协议 | 高 | 通过 hook + status-report 强制 |
| 性能瓶颈(大型 graph) | 低 | 已优化测试套件(single fork 模式) |

## 下一步

1. 完善 coordinator-protocol.md 文档
2. 增加 pack 数量(嵌入式、移动端等)
3. 优化 dispatch manifest 的上下文精简
4. 考虑添加可视化工具(作为 pack)
