# 示例:全栈 Web 项目的 Compose 合成

本项目演示 `spec-graph` 如何从 `profile.yaml` 自动合成出 `graph.yaml`。

## 项目假设

一个面向外部用户的 SaaS 任务管理应用:

- **Web 前端**:Next.js (React)
- **REST API**:Node.js + Express/Fastify
- **数据库**:PostgreSQL (Prisma ORM)
- **团队**:3 人小团队
- **质量**:标准级(非原型、非合规)
- **部署**:Docker 容器化托管服务
- **场**:绿场(从零开发)

## Sense 阶段:profile.yaml

见 [`profile.yaml`](./profile.yaml)。9 个维度的事实推断:

| 维度        | 值              | 置信度 | 来源 | 证据                             |
| ----------- | --------------- | ------ | ---- | -------------------------------- |
| has_ui      | web             | high   | repo | next.config.js + pages/          |
| boundary    | published-api   | high   | repo | api/routes/ + openapi.yaml       |
| topology    | mono            | high   | repo | 单仓库,frontend/ + backend/      |
| deployment  | hosted-service  | high   | repo | Dockerfile + docker-compose.yaml |
| consumers   | external-public | high   | repo | openapi.yaml 有 externalServers  |
| field       | greenfield      | high   | repo | 无现有 src/ 或 build/            |
| criticality | standard        | low    | llm  | —                                |
| team        | small           | low    | llm  | —                                |
| persistence | database        | high   | repo | prisma/schema.prisma + postgres  |

## Compose 阶段:匹配的 Packs

### 领域/形状轴(按 profile 事实命中)

| Pack                 | 命中条件                                           | 命中?         | 贡献                                                                    |
| -------------------- | -------------------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| foundation           | always                                             | ✅            | governance 底盘 + 通用 checks + 门骨架 + 流水线骨架                     |
| requirement-analysis | always                                             | ✅            | PRD + story-map + clarify-scan check                                    |
| architecture         | criticality ≠ prototype                            | ✅ (standard) | C4 + ADR + readiness + architecture-review                              |
| task-decomposition   | always                                             | ✅            | epics + story + story-slicing + ac-test-binding                         |
| api-design           | boundary=published-api                             | ✅            | openapi/grpc/graphql/async schema + contract-lint + breaking-change     |
| data-design          | persistence exists                                 | ✅ (database) | db-schema + data-model + migration-plan + schema-drift                  |
| frontend             | has_ui ∈ [web,native,gui]                          | ✅ (web)      | user-flows + wireframe + design-tokens + fe track + lighthouse/a11y/e2e |
| backend              | boundary=published-api ∨ deployment=hosted-service | ✅            | be track + contract-test + feature-test                                 |
| embedded             | deployment ∈ [firmware,binary]                     | ❌            | —                                                                       |
| plugin               | (未定义)                                           | ❌            | —                                                                       |

### 变更意图轴(按 change.type 命中)

| Pack        | 命中条件           | 命中? | 贡献                                             |
| ----------- | ------------------ | ----- | ------------------------------------------------ |
| feature     | type=feature(默认) | ✅    | pipeline_skeleton [implement→review→test→accept] |
| bugfix      | type=bugfix        | ❌    | —                                                |
| refactor    | type=refactor      | ❌    | —                                                |
| spike       | type=spike         | ❌    | —                                                |
| performance | type=perf          | ❌    | —                                                |
| migration   | type=migration     | ❌    | —                                                |
| deprecation | type=deprecation   | ❌    | —                                                |

**共 9 个 active packs**:foundation + 5 planning + frontend + backend + feature。

## 合成关键步骤

### Step 1:Artifacts 并集

所有 pack 的 `provides.artifacts` 合并去重,得到 25 个工件(见 graph.yaml §1)。

**关键设计点**:

- `contract/openapi` 由 **api-design pack** 声明 schema 模板/校验规则,但 `producer_track: be`(**backend track** 负责写出文件)。这是"设计规范与实现生产分离"的体现。
- `contract/db-schema` 同理,`producer_track: be`。

### Step 2:Tracks 收集

- **fe track**(frontend.pack):scope=frontend,actions=[implement,review,test,accept],consumes contract/openapi
- **be track**(backend.pack):scope=backend,actions=[contract,implement,review,test,accept],produces [contract/openapi, contract/db-schema]

### Step 3:Contract 连边

```
contract/openapi ──produces──▶ be track
                ◀──consumes─── fe track
                ◀──consumes─── be track (backend 实现也引用自己写的契约)

contract/db-schema ──produces──▶ be track
                   ◀──consumes─── be track
```

因 topology=mono(同一 repo),binding status = `bound`(直接可用,无需 federated mock)。

### Step 4:Pipeline 骨架

feature.pack 提供 `pipeline_skeleton: [implement, review, test, accept]`。
backend track 的 actions 包含 `contract`(在 implement 之前设计契约),frontend track 无 contract action。

Phase 4 执行时:

1. **be track** 先跑 `contract` action(写出 openapi.yaml + db-schema.md)
2. **fe track** 和 **be track** 并行跑 `implement`→`review`→`test`→`accept`
   - fe track 按 contract/openapi 版本 mock 开发(若 backend 未完成)
   - be track 按 contract/db-schema 实现 ORM 模型 + API 路由
3. 两端各自 accept 后,做 integration 验证(contract-test)

### Step 5:Gates 拼装

**入口门(entry-phase4)** — foundation 骨架 + 5 个 planning pack 的 gate_patches 累加:

```
require_artifacts:
  - requirement/prd          (requirement-analysis)
  - design/readiness         (architecture)
  - plan/story               (task-decomposition)
  - plan/epics               (task-decomposition)
  - contract/openapi         (api-design)
  - contract/db-schema       (data-design)

require_traces:
  - story_to_req: plan/story → requirement/prd   (requirement-analysis)
  - c4_to_req: design/c4 → requirement/prd       (architecture)
```

**出口门(exit-merged)** — foundation 骨架 + 所有 domain pack 的 gate_patches 累加:

```
require_checks (共 11 个):
  lint, typecheck, unit-test              (foundation)
  ac-test-binding                         (task-decomposition)
  breaking-change                         (api-design)
  schema-drift                            (data-design)
  lighthouse, a11y, e2e-browser           (frontend)
  contract-test, feature-test             (backend)

require_traces:
  - ac_to_test: plan/story → verification/test-report   (task-decomposition)
```

### Step 6:Acceptance Layers

| Layer       | Required | Checks (来源)                                                                                                                                                                                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit        | ✅       | lint, typecheck, unit-test (foundation) + clarify-scan (req-analysis) + architecture-review, complexity-budget (arch) + story-slicing, ac-test-binding (task) + contract-lint, breaking-change (api) + data-model-consistency, schema-drift (data) |
| integration | ✅       | contract-test, feature-test (backend)                                                                                                                                                                                                              |
| system      | ✅       | lighthouse, a11y (frontend)                                                                                                                                                                                                                        |
| deployment  | ✅       | e2e-browser (frontend)                                                                                                                                                                                                                             |

## 验证:与 wdf-method 等价性

| wdf 概念              | spec-graph 等价表达                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| Phase 1 (Analysis)    | propose + specify actions → impact-map/product-brief/PRD                                |
| Phase 2 (Planning)    | design action → user-flows/wireframe/design-tokens                                      |
| Phase 3 (Solutioning) | design + contract + plan actions → C4/ADR/readiness + openapi/db-schema + epics/stories |
| Phase 4 BE Track      | be track: contract→implement→review→test→accept                                         |
| Phase 4 FE Track      | fe track: implement→review→test→accept (consumes openapi)                               |
| Phase 4 Integration   | contract-test + feature-test (integration layer)                                        |
| 入口门 (3.9→4)        | entry-phase4 (6 个 artifact + 2 条 trace)                                               |
| 出口门 (4→MERGED)     | exit-merged (11 个 check + acceptance-report + ac_to_test trace)                        |
| 追溯链                | story_to_req + c4_to_req + ac_to_test                                                   |
| 宪法                  | change-record/constitution                                                              |
| 4 层验收              | unit/integration/system/deployment (checks 来源分解到各 pack)                           |

**结论**:9 个 pack 的交叉组合**无损复刻**了 wdf-method 的全栈 Web 流程,且没有预制的 web.pack —— 全栈是 `foundation + planning×5 + frontend + backend + feature` 的组合涌现。
