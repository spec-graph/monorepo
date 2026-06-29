# spec-graph 数据契约 schemas

> 本文件定义 spec-graph 三段机制(Sense / Compose / Enforce)的数据契约。CLAUDE.md 的设计稿落到代码,先要把这三份 schema 定稿。

---

## 0. 内核 6 原语 — 底层数据模型

profile / graph / pack 三个上层 schema 的所有字段,最终都坍缩成这 6 个原语的实例。内核只认识这 6 个,**零领域词**。下面用 TypeScript interface 表达(实现时即可直接用)。

### 公共基础

```ts
// 所有原语共享的标识
type NodeId = string;            // 全局唯一,格式 "<kind>:<slug>"(如 "story:S-001"、"contract:openapi-v2")
type Iso8601 = string;

interface NodeBase {
  id: NodeId;
  created_at: Iso8601;
  pack: string;                  // 哪个 pack 实例化了它(内核自身产出的为 "kernel")
  labels?: Record<string, string>;  // 自由标注,内核不解释(供 pack / 查询用)
}
```

### ① Work-unit — 有状态的工作节点

```ts
interface WorkUnit extends NodeBase {
  primitive: 'work-unit';
  action: ActionVerb;            // 12 个标准动作之一(见 graph.yaml actions)
  state: WorkUnitState;          // 当前 FSM 状态
  produces: NodeId[];            // 产出的 Artifact / Contract id
  consumes: NodeId[];            // 消费的 Artifact / Contract id
  depends_on: NodeId[];          // 前驱 work-unit(DAG 边)
  scope_write?: string[];        // 该 work-unit 可写的文件 glob(scope-lock 用;沿用 wdf)
  retries?: { max: number; used: number };  // pipeline 重试预算(沿用 wdf ≤5)
}

type ActionVerb =
  | 'propose' | 'specify' | 'design' | 'contract' | 'plan' | 'implement'
  | 'review' | 'test' | 'accept' | 'integrate' | 'release' | 'archive'
  | 'diagnose';                  // 第 13 动作:分析现有系统找根因/定位暴露/清点影响
                                 // (reactive 流共用 — bugfix 根因 / perf 热点 / migration inventory;
                                 //  原 12 个是 greenfield 推出来的,无此原子,见 §7 + §6.4)

// 状态机:wdf 的 NOT_STARTED→...→MERGED 是 web 实例,泛化为通用阶段标签
type WorkUnitState =
  | 'not_started' | 'in_progress' | 'implemented'
  | 'verified'                   // 通过 review + test(wdf 的 TESTED/SPEC_COMPLIANT)
  | 'accepted'                   // 通过 acceptance 四层(wdf 的 *_ACCEPTED)
  | 'integrated'                 // 已合并主线(wdf 的 MERGED)
  | 'concluded'                  // 非集成终态:spike 出结论(graduate),代码不进主线(见 §7)
  | 'discarded'                  // 非集成终态:spike 结论"别做",丢弃
  | 'escalated';                 // 超重试预算,升级人工(wdf 的 PIPELINE_ESCALATED)
```

### ② Artifact — 带类型的产物

```ts
interface Artifact extends NodeBase {
  primitive: 'artifact';
  kind: ArtifactKind;            // 7 根分类 / 具体子类型(如 "requirement/prd")
  path: string;                  // 产物文件路径(相对项目根)
  schema_ref?: string;           // 对应 pack 的 template / schema 路径
  version?: string;              // semver(Contract 必填,普通 artifact 可选)
  produced_by: NodeId;           // 产出它的 work-unit
  content_hash?: string;         // sha256,用于 drift 检测
}

// 7 个根分类(MIME 顶层式),pack 在其下注册具体子类型
type ArtifactRoot =
  | 'requirement' | 'design' | 'contract' | 'plan'
  | 'implementation' | 'verification' | 'change-record';
type ArtifactKind = `${ArtifactRoot}/${string}`;  // 如 "design/c4"、"contract/register-map"
```

### ③ Contract — 有 producer 边 + consumer 边的 typed Artifact

```ts
// Contract 是 Artifact 的子型,唯一强制双边关系的原语
interface Contract extends Artifact {
  kind: `contract/${string}`;
  version: string;               // 强制 semver(契约破坏要看版本)
  producer: NodeId;              // 唯一生产者(work-unit)
  consumers: ContractBinding[];  // ≥0 个消费者;允许空但 integrate 门会查 TBD
}

interface ContractBinding {
  consumer: NodeId;              // 消费方 work-unit(可跨 repo/项目 → federated)
  bound_version: string;         // 绑定到的契约版本(消费方按此 mock 独立开发)
  status: 'mock' | 'live' | 'tbd';  // tbd = 消费方未定,integrate 门要求落定
  source?: 'local' | 'external-repo';  // external-repo = federated 跨项目契约
  integration?: 'inline' | 'deferred'; // deferred = 两端各自就绪后再做联邦集成验证
}
```

> **federated 验证(embedded.pack 反推)**:嵌入式固件消费另一个 repo 的 API 契约时,`source=external-repo` + `status=mock` + `integration=deferred` —— 固件按契约版本独立 mock 开发,跑完自己的 unit→HIL,API 端各自就绪后才做联邦集成。这正是 spec-graph 的契约级跨项目治理空白可填区。

### ④ Check — 声明式校验

```ts
interface Check extends NodeBase {
  primitive: 'check';
  kind: string;                  // 'lint' | 'test' | 'lighthouse' | 'hil' | ...(pack 自定义,内核不枚举)
  command?: string;              // shell 命令(StoryRail 风格:验收 = 声明式 shell)
  rule_ref?: string;             // 或引用一条规则(pack rules/ 下)
  layer: AcceptanceLayer;        // 4 层固定标签
  threshold?: Record<string, unknown>;  // 如 { min_score: 90 }、{ coverage: 0.95 }
  target?: NodeId;               // 校验对象(work-unit / artifact);空 = 全局
}

// 4 层固定,pack 不可扩展新层
type AcceptanceLayer = 'unit' | 'integration' | 'system' | 'deployment';
```

### ⑤ Gate — 状态转移上的不变量

```ts
interface Gate extends NodeBase {
  primitive: 'gate';
  on_transition: [from: WorkUnitState | ActionVerb, to: WorkUnitState | ActionVerb];
  require_checks: NodeId[];      // 这组 Check 必须全 PASS
  require_artifacts: ArtifactKind[];  // 这些工件必须存在
  require_traces: TraceQuery[];  // 这些追溯关系必须成立(如每个 AC 有 test)
  fail_mode: 'block' | 'warn';   // block = 失败闭合(默认,wdf 风格);warn = 建议
  enabled: boolean;              // opt-out 开关(沿用 wdf semantic_gate)
}

// 追溯查询:断言图上存在某种 trace-edge 闭包
interface TraceQuery {
  name: string;                  // 如 'ac_to_test'、'req_to_test'
  from_kind: ArtifactKind | 'work-unit';
  to_kind: ArtifactKind | 'work-unit';
  via: TraceEdgeType[];          // 允许经过的边类型
  cardinality: 'every' | 'exists';  // every = 每个 from 都要有路径 / exists = 至少一条
}
```

### ⑥ Trace-edge — 任意节点→任意节点的 typed 边

```ts
interface TraceEdge {
  primitive: 'trace-edge';
  id: NodeId;
  from: NodeId;
  to: NodeId;
  type: TraceEdgeType;
  created_at: Iso8601;
  commit?: string;               // 关联 commit sha(代码↔需求追溯用;沿用 wdf trace blame)
}

// 边类型:JTBD→REQ→Story→Test→Commit 是 web 实例,泛化为通用关系
type TraceEdgeType =
  | 'derives'        // 需求派生(JTBD → REQ → Story)
  | 'satisfies'      // 实现满足(Implementation → REQ)
  | 'verifies'       // 测试验证(Test → AC / Story)
  | 'produces'       // 契约生产(work-unit → Contract)
  | 'consumes'       // 契约消费(work-unit → Contract)
  | 'records';       // 变更留痕(Commit → Story)
```

### 6 原语 ↔ 上层 schema 的映射

| 上层 schema 字段 | 坍缩成的原语 |
|---|---|
| `graph.actions[*]` | Work-unit |
| `graph.artifacts[*]`(非 contract) | Artifact |
| `graph.artifacts[*]`(contract/*) | Contract |
| `graph.checks[*]` | Check |
| `graph.gates[*]` | Gate |
| `graph.gates[*].require_traces` | Gate 内嵌 TraceQuery,运行期对 Trace-edge 集合求值 |
| 运行期产生的 JTBD→REQ→… 链 | Trace-edge |

**不变量**:内核引擎只操作这 6 个 interface;profile/graph/pack 是它们的**声明式投影**,Sense/Compose 负责把声明翻译成原语实例,Enforce 只在原语图上跑 FSM + Gate 求值。

---

## 1. `profile.yaml` — Sense 阶段产物

**真相源**:工程需求的机器可读快照。LLM + 确定性扫描共同产出,可人工 override,冻结后作为 Compose 输入。

```yaml
# profile.yaml
version: "1"
meta:
  created_at: "2026-06-24T10:00:00Z"
  source:
    prompt: "温控器固件,配手机 app 看数据,后端走 REST API"
    repo_scan: true                   # 是否扫了 repo
    llm_classified: true              # 是否经 LLM 分类
    reviewed_at: "2026-06-24T10:05:00Z"  # 人工复核时间戳(空 = 未复核,Compose 前必须填)

# 推断事实(每条都带置信度 + 来源)
facts:
  has_ui:
    value: none                       # none | cli | gui | web | native
    confidence: high                  # high = repo 硬证据 / low = LLM 推断
    source: repo                      # repo | llm | user
  boundary:
    value: published-api
    confidence: high
    source: repo
    evidence: "api/openapi.yaml detected"
  topology:
    value: federated
    confidence: low
    source: llm
    evidence: "firmware + mobile app + API 三件套,跨设备"
  deployment:
    value: firmware                   # process | package | binary | firmware | hosted-service
    confidence: high
    source: repo
    evidence: "platformio.ini detected"
  consumers:
    value: external-public            # self | internal-team | external-public
    confidence: low
    source: llm
  field:
    value: greenfield                 # greenfield | brownfield
    confidence: high
    source: repo
    evidence: "no src/ or build/ directory"
  criticality:
    value: standard                   # prototype | standard | compliance
    confidence: low
    source: llm
  team:
    value: small                      # solo | small | multi
    confidence: low
    source: llm
  persistence:
    value: database                   # none | embedded-store | database
    confidence: high
    source: repo
    evidence: "prisma/schema.prisma detected"

# 确定性扫描得到的原始信号(供调试/复核)
repo_signals:
  package_manager: null
  has_package_json: false
  has_exports_field: false
  has_dockerfile: false
  has_platformio_ini: true
  has_cargo_toml: false
  has_existing_src: false             # brownfield 信号
  has_ci_publish_workflow: false
  has_db_config: true                 # 数据库/ORM 配置文件存在
  has_sqlite_file: false              # SQLite 文件存在(嵌入式存储信号)

# 用户显式 override(优先级最高;来源是 CLI flag 或交互确认)
overrides:
  criticality: compliance             # 用户坚持要合规,无视 LLM
```

**字段语义**:
- `facts.<dim>.confidence`:high = repo 硬证据,LLM 不能下调;low = LLM 推断,可被 override 覆盖。
- `facts.<dim>.source`:`repo` > `llm`,冲突时 repo 胜出;`user`(来自 override 段)> 一切。
- `reviewed_at`:Compose 前**必须**人工复核(填时间戳),否则引擎拒绝合成——这是"LLM 不静默通过"的硬卡点。

**完整推断规则**:见 [`docs/sense-inference-rules.md`](./docs/sense-inference-rules.md)(9 维度偏序格定义、repo 信号检测、严格方向单调上调算法)。

---

## 2. `graph.yaml` — Compose 阶段产物

**真相源**:本项目具体要执行的工作流图。由 Compose 引擎从 `profile.yaml` + 匹配 pack 的 `provides` 并集生成。**一旦生成,Enforce 阶段严格按此执行,不再咨询 LLM**。

```yaml
# graph.yaml
version: "1"
meta:
  composed_at: "2026-06-24T10:06:00Z"
  profile_hash: "abc123"              # 关联的 profile.yaml sha256,用于检测 profile 漂移
  packs_used:                         # 参与合成的 pack 列表 + 各自命中的条件
    - name: web
      matched: { has_ui: web }
    - name: api
      matched: { boundary: published-api }

# 工作流动作序列(每个节点是一个 action 实例)
actions:
  - id: specify-req
    action: specify                   # 12 个标准动作之一
    produces: [requirement/prd, requirement/jtbd]
    depends_on: []
  - id: design-arch
    action: design
    produces: [design/c4, design/adr]
    depends_on: [specify-req]
  - id: api-contract
    action: contract
    produces: [contract/openapi]
    depends_on: [design-arch]
  - id: impl
    action: implement
    produces: [implementation/*]
    depends_on: [api-contract]
  - id: review
    action: review
    depends_on: [impl]
  - id: test-integration
    action: test
    depends_on: [impl]
  - id: accept
    action: accept
    depends_on: [review, test-integration]
  - id: integrate
    action: integrate
    depends_on: [accept]

# 工件注册表(每个工件实例绑定到产出它的 action)
artifacts:
  - id: prd
    kind: requirement/prd             # 7 种根分类之一 / 具体子类型
    produced_by: specify-req
    schema: templates/prd.md          # 产物骨架路径
  - id: api-spec
    kind: contract/openapi
    produced_by: api-contract
    schema: schemas/openapi.yaml
    producer: impl                    # Contract 原语必须有 producer 边(哪个 action/节点产出)
    consumers: [impl, test-integration]  # Contract 原语必须有 consumer 边(哪些节点消费)

# Check 挂载(每个 check 实例绑定到一个 acceptance 层)
checks:
  - id: lint
    kind: lint
    command: "npm run lint"
    layer: unit                       # 4 层固定标签:L1 unit / L2 integration / L3 system / L4 deployment
  - id: unit-test
    kind: test
    command: "npm test"
    layer: unit
  - id: contract-test
    kind: test
    command: "npx pact verify"
    layer: integration
  - id: lighthouse
    kind: lighthouse
    command: "npx lighthouse-ci assert"
    layer: system
    threshold: { min_score: 90 }
  - id: e2e-browser
    kind: test
    command: "npx playwright test"
    layer: deployment

# Gate 声明(状态转移的不变量)
gates:
  - id: entry-phase4
    on_transition: [plan, implement]  # 从 plan 到 implement 的状态转移
    require_checks: [lint, unit-test]
    require_artifacts: [requirement/prd, contract/openapi]
    require_traces: [req_to_test]     # 追溯门(每个 REQ 必须有对应 test)
  - id: exit-merged
    on_transition: [accept, integrate]
    require_checks: [lint, unit-test, contract-test, lighthouse, e2e-browser]
    require_traces: [ac_to_test]      # 每个 AC 必须绑定到 test

# Acceptance 分层(把 checks 分配到 4 层;每层全过才算该层 PASS)
acceptance_layers:
  unit:
    required: true
    checks: [lint, unit-test]
  integration:
    required: true
    checks: [contract-test]
  system:
    required: true
    checks: [lighthouse]
  deployment:
    required: true
    checks: [e2e-browser]

# Agent Registry(子代理编排)
# 每个 agent 是独立 sub-agent:隔离 context、专职 prompt、通过 artifact 交接
agents:
  - id: pm
    description: "Product Manager — elicits requirements from user intent"
    prompt_ref: agents/pm-agent.md       # 相对于 pack 目录
    model_tier: capable                  # fast | standard | capable
    input_artifact_kinds: []             # 从用户输入开始,无前置 artifact
    output_artifact_kinds: [requirement/*]
    actions: [propose, specify]
  - id: architect
    description: "Software Architect — designs system structure, freezes contracts"
    prompt_ref: agents/architect-agent.md
    model_tier: capable
    input_artifact_kinds: [requirement/*]
    output_artifact_kinds: [design/*, contract/*]
    actions: [design, contract]
  - id: developer
    description: "Software Developer — implements code from plan + contracts"
    prompt_ref: agents/developer-agent.md
    model_tier: standard                 # 计划充分时机械化执行
    input_artifact_kinds: [design/*, contract/*, plan/*]
    output_artifact_kinds: [implementation/*, verification/*]
    actions: [implement, plan]
  - id: reviewer
    description: "Code Reviewer — reviews against design + contracts"
    prompt_ref: agents/reviewer-agent.md
    model_tier: capable
    input_artifact_kinds: [implementation/*, design/*, contract/*]
    output_artifact_kinds: [verification/*]
    actions: [review]
    checks: [lint, typecheck, clone-detection]
  - id: qa
    description: "QA Engineer — runs integration/system/deployment tests"
    prompt_ref: agents/qa-agent.md
    model_tier: standard
    input_artifact_kinds: [implementation/*, contract/*, plan/*]
    output_artifact_kinds: [verification/*]
    actions: [test, accept]

# Action → Agent 绑定(coordinator 据此自动选 agent)
agent_bindings:
  - { action: propose, agent_id: pm, provided_by: foundation }
  - { action: design, agent_id: architect, provided_by: foundation }
  - { action: implement, agent_id: developer, provided_by: foundation }
  - { action: review, agent_id: reviewer, provided_by: foundation }
  - { action: test, agent_id: qa, provided_by: foundation }

# Meeting 声明(多 agent 协作讨论)
# 在需求阶段,多个 agent 以圆桌会议模式讨论,互相质疑、提问、收敛
meetings:
  - id: requirements-meeting
    description: "Requirements roundtable — PM, Architect, QA discuss together"
    purpose: "Transform user intent into structured requirements through multi-perspective discussion"
    on_actions: [propose, specify]
    min_rounds: 2                  # 最少轮次(至少 diverge + converge)
    max_rounds: 10                 # 最多轮次(facilitator 可在此范围内动态决定)
    participants:
      - { agent_id: pm, role: core, perspective: "user needs, business value" }
      - { agent_id: architect, role: core, perspective: "technical feasibility" }
      - { agent_id: qa, role: core, perspective: "testability, quality" }
    expert_invite_protocol: agents/expert-invite-protocol.md
    output_artifacts: [requirement/proposal, requirement/requirements]
    rounds:
      - { number: 1, phase: diverge, objective: "Initial perspectives", prompt: "Share your perspective", speakers: [] }
      - { number: 2, phase: challenge, objective: "Question assumptions", prompt: "Challenge assumptions", speakers: [] }
      - { number: 3, phase: converge, objective: "Align on shared understanding", prompt: "Summarize agreements", speakers: [] }
```

**不变量**(Compose 引擎必须保证):
- `actions[*].action` 必须是 12 个标准动作之一。
- `artifacts[*].kind` 必须是 7 个根分类之一的具体化。
- `artifacts` 中 `kind` 以 `contract/` 开头的,必须同时有 `producer` 和 `consumers`(Contract 原语的双边强制)。
- `checks[*].layer` 必须是 4 层之一,不可自定义新层。
- `acceptance_layers` 的 key 必须恰好是 `[unit, integration, system, deployment]` 四个。
- `gates[*].require_checks` 引用的 check 必须在 `checks` 中声明。
- `profile_hash` 必须与当前 `profile.yaml` 一致;不一致 = profile 漂移,Compose 必须重算。
- `agents[*].id` 必须全局唯一(跨 pack 去重后)。
- `agents[*].model_tier` 必须是 `fast | standard | capable` 之一。
- `agent_bindings[*].action` 必须在 `actions` 中存在。
- `agent_bindings[*].agent_id` 必须在 `agents` 中存在。
- `meetings[*].id` 必须全局唯一(跨 pack 去重后,高优先级覆盖)。
- `meetings[*].participants[*].role` 必须是 `core | optional | invite_only | facilitator` 之一。
- `meetings[*].participants[*]` 必须有 `agent_id` 或 `expert_role` 之一。
- `meetings[*].min_rounds` 必须 ≤ `max_rounds`。
- `meetings[*].rounds[*].phase` 必须是 `diverge | challenge | converge | deep_dive` 之一。
- `meetings[*].on_actions` 引用的 action 必须在 `actions` 中存在。

---

## 3. `pack.yaml` 的 `applies_when` 与 `provides` — pack 声明

每个 pack 通过这两个字段声明"何时启用"和"启用后提供什么"。Compose 引擎按 `applies_when` 过滤,把命中 pack 的 `provides` 做并集。

```yaml
# web.pack/pack.yaml
name: web
version: "1"
priority: 10                          # 冲突时的默认优先级(数字越大越优先)

applies_when:                         # profile 匹配条件
  has_ui: web
  # 支持更复杂的表达式语法(见下)

provides:
  artifacts:
    - id: requirement/prd
      kind: requirement
      schema_ref: templates/prd.md
    - id: design/c4
      kind: design
      schema_ref: templates/c4.md
    - id: design/wireframe
      kind: design
      schema_ref: templates/wireframe.md
    - id: contract/openapi
      kind: contract
      schema_ref: templates/openapi.yaml
      default_producer: api-impl
      default_consumers: [web-impl]
  actions:
    - specify
    - design
    - contract
    - plan
    - implement
    - review
    - test
    - accept
    - integrate
  checks:                             # 本 pack 提供的 check 池(可被 graph 引用)
    - id: lint
      kind: lint
      command: "npm run lint"
      layer: unit
    - id: unit-test
      kind: test
      command: "npm test"
      layer: unit
    - id: lighthouse
      kind: lighthouse
      command: "npx lighthouse-ci assert"
      layer: system
    - id: e2e-browser
      kind: test
      command: "npx playwright test"
      layer: deployment
  gates:
    - id: entry-phase4
      on_transition: [plan, implement]
      require_checks: [lint, unit-test]
    - id: exit-merged
      on_transition: [accept, integrate]
      require_checks: [lint, unit-test, lighthouse, e2e-browser]
      require_traces: [ac_to_test]

  # Agent Registry(子代理声明)
  # 每个 agent 是独立 sub-agent;coordinator 按 agent_bindings 自动选 agent
  agents:
    - id: frontend-dev
      description: "Frontend Developer — implements UI components from design specs"
      prompt_ref: agents/frontend-dev-agent.md
      model_tier: standard
      input_artifact_kinds: [design/*, contract/*, plan/*]
      output_artifact_kinds: [implementation/*]
      actions: [implement]
    - id: a11y-reviewer
      description: "Accessibility Reviewer — audits UI for WCAG compliance"
      prompt_ref: agents/a11y-reviewer-agent.md
      model_tier: capable
      input_artifact_kinds: [implementation/*, design/*]
      output_artifact_kinds: [verification/*]
      actions: [review]
      checks: [a11y-audit]

  # Action → Agent 绑定(高优先级 pack 覆盖低优先级的同名绑定)
  agent_bindings:
    implement: frontend-dev             # 覆盖 foundation 的 developer → frontend-dev
    review: a11y-reviewer               # 补充 foundation reviewer 之外的视角
```

### `applies_when` 匹配语法

```yaml
# 标量相等
has_ui: web

# 数组成员(任一匹配即可)
deployment: [firmware, binary]

# 否定(! 前缀)
has_ui: "!none"

# 逻辑 AND(同层多个键隐式 AND,显式 $and 用于同键多次约束)
has_ui: web
boundary: published-api             # 同时满足两个维度

# 逻辑 OR($or)
$or:
  - { has_ui: web }
  - { has_ui: native }

# 存在性检查
topology: "$exists"                 # profile 里必须有这个维度
```

**表达式求值**:Compose 引擎遍历所有 pack 的 `applies_when`,对当前 `profile.yaml` 求值;命中的 pack 进入候选集。

### 冲突解决(多 pack 提供同 ID 工件 / check)

当多个命中的 pack 都提供同一个 `artifact.id` 或 `check.id`:

1. **优先 `priority` 高的 pack**(数字大者胜)。
2. **同 priority → 看 `provides` 是否兼容**(schema 结构相等或子集关系)。
3. **不兼容 → 报 conflict 给用户**,由用户在 `profile.overrides` 里显式选一个(或写 merge 指令)。
4. **check 可叠加**:同一 `check.id` 在多个 pack 里定义且 command/layer 相同 → 自动去重;不同 → 视为不同 check,需改名(`web.lint` / `api.lint`)避免冲突。

### profile → graph 的变更传播(OpenSpec 风格 change)

`profile.yaml` 改了 → 触发 Compose 重算 → 产出 **sync-impact diff**:

```yaml
# .spec-graph/changes/2026-06-24-raise-criticality.yaml
type: profile-patch
timestamp: "2026-06-24T12:00:00Z"
diff:
  criticality: { from: standard, to: compliance }
impact:
  added_checks: [security-audit, coverage-95]
  removed_checks: []
  changed_gates:
    - id: exit-merged
      before: { require_checks: [... standard threshold] }
      after:  { require_checks: [... compliance threshold] }
  affected_artifacts: [implementation/*]  # 因新 check 可能需要重验的工件
  affected_downstream_consumers: []       # 沿 trace-edge 计算的下游 Contract consumer
requires_revalidation:
  - story/S-001
  - story/S-002
```

用户确认后才落到 `changes/`,触发 Enforce 阶段按新 graph 继续。

---

## 4. 三 schema 的协作关系

```
profile.yaml    ──(Compose 输入)──┐
                                   ├──▶ graph.yaml ──(Enforce 输入)──▶ FSM 执行
packs/*.pack    ──(applies_when   │
                   + provides)──┘

profile.yaml 改动 ──▶ changes/*.yaml ──▶ 重算 graph.yaml ──▶ Enforce 接力
```

- **profile.yaml** 是"工程需求快照"(Sense 产物),可改,改了触发涟漪。
- **pack.yaml** 是"领域知识包"(第三方可写),通过 `applies_when` 自声明适用条件。
- **graph.yaml** 是"本项目具体工作流"(Compose 产物),**一旦生成冻结,Enforce 严格按此执行**。

这三者合起来 = 把"自动根据工程需求生成流程"落成可复现、可审计、可强制的声明式数据契约。

---

## 5. 并行 track 与流水线 — 由 pack 贡献,Compose 拼装

> **设计修正**:早期把 BE∥FE 并行轨写死在 `phases.yaml` 里,这是 wdf 硬编码的倒退。正确模型:**每个 domain pack 声明自己贡献一条 track,Compose 收集所有 active pack 的 track 拼成并行阶段**。全栈 = frontend.pack + backend.pack 各贡献一条 track 的组合涌现,不存在单体 web.pack。

### pack 顶层新增字段

```ts
interface PackManifest {
  name: string;
  version: string;
  priority: number;                // 冲突解决 / merge 顺序(foundation=0 最低)
  applies_when: ApplyCondition | 'always';   // 'always' = 常驻包(如 foundation)
  provides: Provides;

  // domain pack 贡献的并行 track(foundation 不贡献,只提供 pipeline_skeleton)
  contributes_track?: TrackContribution;

  context_ref?: string;            // 注入 AI 的上下文(OpenSpec config 对应)
  constitution_ref?: string;       // 本包宪法规则
}

interface TrackContribution {
  id: string;                      // 'fe' | 'be' | 'firmware' | ...
  scope: string;                   // 落到 work-unit.scope_write 分区
  actions: ActionVerb[];
  produces?: ArtifactKind[];       // 本 track 产出的契约(如 be → contract/openapi)
  consumes?: ArtifactKind[];       // 本 track 消费的契约(如 fe → contract/openapi);可 mock 独立开发
  federated_consume?: FederatedConsume;  // 跨 repo 消费外部契约(embedded.pack 反推)
}

// 跨项目契约消费声明:消费方按版本 mock 独立开发,两端就绪后做联邦集成
interface FederatedConsume {
  contract: ArtifactKind;          // 消费哪个契约(如 contract/openapi)
  source: 'external-repo';         // 契约来自另一个 spec-graph 项目
  binding: 'by-version';           // 绑定到具体契约版本
  integration: 'deferred';         // 两端各自就绪后再做 federated 集成验证
}
```

### foundation 提供流水线骨架,domain track 填充

```ts
interface Provides {
  artifacts: ArtifactDecl[];
  actions: ActionVerb[];
  checks: CheckDecl[];
  gates?: GateDecl[];              // foundation 定义门骨架;domain pack 也可新增门(如 embedded 的 release-firmware)
  gate_patches?: GatePatchMap;     // domain pack 往已有门追加(不重定义)
  acceptance_layers?: AcceptanceLayerMap;  // 各包贡献,按 layer merge(union checks)
  pipeline_skeleton?: Pipeline;    // 仅 foundation 提供
}

interface ArtifactDecl {
  id: ArtifactKind;
  kind: ArtifactRoot;
  schema_ref: string | null;
  optional?: boolean;              // wdf auto-skip 产物
  default_producer?: string;       // contract 专用:默认生产 track id
  default_consumers?: string[];    // contract 专用:默认消费 track id(active 时自动连边)
}

// domain pack 往已有 gate 追加约束(merge,不覆盖)
type GatePatchMap = Record<NodeId, {
  add_checks?: NodeId[];
  add_artifacts?: ArtifactKind[];
  add_traces?: TraceQuery[];
}>;

interface Pipeline {
  stages: ActionVerb[];
  max_retries: number;             // wdf ≤5
  on_exhausted: 'escalate' | 'block';
}
```

### Compose 拼装并行 phase 的算法

```
1. 取所有 active pack(applies_when 命中 + foundation 常驻)
2. tracks = 收集每个 pack 的 contributes_track
3. 对每条 contract:producer track + 各 consumer track 之间连 Contract 边
   - consumer 若与 producer 不在同一 repo(track.federated_consume) → ContractBinding.status = mock + source = external-repo(federated 独立开发)
4. phase-4 = 用 foundation.pipeline_skeleton 包裹这组并行 track
5. gates = foundation.gates ∪ 各 domain pack 的 provides.gates(新增门,如 release-firmware)
              再经所有 pack 的 gate_patches 累加约束
6. acceptance_layers = 各 pack 同名 layer 的 checks 取并集
7. release 动作(若有 pack 贡献)= integrate 之后的后置阶段,其门(on_transition:[integrate,release])在 pipeline_skeleton 末端追加
```

**全栈 web 的涌现示例**:`has_ui=web` + `boundary=published-api` → foundation + frontend + backend 三包 active → tracks = [fe, be] → backend 的 `contract/openapi`(producer=be, consumers=[fe])自动连边 → phase-4 并行跑 fe∥be → 等价 wdf 的 BE∥FE,但纯组合得出。

### phases.yaml(可选,纯展示编排)

`phases.yaml` 降级为**可选的展示层**:仅当 pack 想给用户呈现 wdf 式的"Phase 1→4"命名分组时提供。它**不再承载 track/pipeline 语义**(那些已上移到 `contributes_track` + `pipeline_skeleton`),只是给动作分组贴 phase 标签。不写则按 `depends_on` 自由取用(OpenSpec 风格)。

---

## 6. 纸面验证发现(pack 分解反推出的 schema 补丁)

用 foundation + frontend + backend 表达 wdf web 流程、再用 embedded 压测 web 三包未覆盖能力的过程,暴露并已修补的缺口:

### 6.1 web 三包(foundation + frontend + backend)反推

| 缺口 | 修补 |
|------|------|
| artifact 无法标记 auto-skip | `ArtifactDecl.optional?` |
| 全栈被错误做成单体 web.pack | 分解为 foundation(脊柱)+ frontend + backend,全栈 = 组合涌现 |
| BE∥FE 并行轨写死在 phases.yaml | 上移为 pack 的 `contributes_track`,Compose 拼装 |
| domain pack 要往共享门/验收层追加 | `gate_patches`(merge)+ `acceptance_layers` union |
| 常驻包无法表达 | `applies_when: 'always'`(foundation) |
| 流水线骨架归属不清 | foundation 提供 `pipeline_skeleton`,track 填充 |
| 契约跨 track 自动连边 | `default_producer` / `default_consumers` 用 track id,active 时连边 |

### 6.2 embedded.pack 反推(压测 web 未覆盖能力)

| 缺口 | 修补 |
|------|------|
| `release` 动作 web 三包没有,其门无处归属 | domain pack 可经 `provides.gates` **新增门**(不只 patch);`release-firmware` 门 `on_transition:[integrate,release]`,Compose 在 pipeline 末端追加 |
| 跨 repo 消费外部契约无法声明 | `TrackContribution.federated_consume`(contract + source=external-repo + binding=by-version + integration=deferred) |
| Contract 被默认当成 API | `contract/register-map`(寄存器图)、`contract/can-dbc`(CAN 报文)证明 Contract 原语不预设 API,producer/consumer 同形适用 |
| deployment 层默认浏览器 e2e | `kind: hil`(硬件在环)挂 deployment 层,证明 4 层是抽象标签而非 web 退化 |

**结论**:schema 经两轮补丁后,可无损表达 wdf 的全部能力(web 三包),并额外覆盖 wdf 完全没有的 `release` 动作、federated 跨 repo 契约、非 API 契约、HIL 验收(embedded)。两条核心主张均被验证——**全栈是组合涌现而非预制包**,**领域能力靠加 pack 而非改内核**。**剩余待压测**:plugin/桌面等更多 domain pack、多 active pack 的契约冲突解决实战。

### 6.3 治理现象压测:需求漂移 + 重复造轮子(现有 6 原语够用)

前两节压测的是"领域能力表达"。这一节压测两个**跨领域的工程治理现象**,验证内核不必为它们新增原语。

#### (a) 需求漂移 —— 已被现有原语覆盖,残留一处工具边界

漂移分四种,均落到既有机制:

| 漂移类型 | 坍缩成的原语机制 |
|---|---|
| 代码偏离 spec(漏实现 / 漏测) | `TraceQuery{via:[satisfies,verifies]}` + 出口门 `require_traces` |
| 代码长出 spec 外的东西(unspec 端点) | drift `Check`(扫实现 vs 契约)挂出口门 `fail_mode:block` |
| 消费方偏离所绑契约版本 | `Contract.version` + `ContractBinding.bound_version` 比对;变更沿 `consumes` 边 CR 涟漪 |
| profile 过期(工程现实变了) | `graph.profile_hash` 与当前 profile 不一致 → 强制重 Compose |

**工具边界**:以上全是"内部一致性"。**意图漂移**(spec 本身还合不合用户的意)无任何原语能判——只能靠 `profile.reviewed_at` 冻结点 + CR 重验把人拉进环。内核不假装能自动化它(呼应 CLAUDE.md 的 spec 正确性 vs 一致性留白)。

#### (b) 重复造轮子 —— 隔离与复用感知的张力,用现有原语补门

根因:给并行能力的那套隔离(track `scope_write`、sub-agent context 胶囊、federated 多 repo、brownfield 不知旧码)同时切断了全局复用感知。三个机制按性价比排,**全部映射到现有 Check/Gate/Contract,无需新原语**:

| 机制 | 坍缩成的原语 | 形态 |
|---|---|---|
| clone 检测(字面重复,兜底) | `Check{kind:'clone', layer:'unit', threshold:{dup_ratio_max}}` | 确定性、零 LLM、超阈值 block |
| reuse 扫描(语义复用,动手前) | `implement` 转移上的 `Gate{require_checks:[reuse-scan], fail_mode:'warn'}`,其中 reuse-scan 是个查"现有代码相似符号 + trace 图已有 `satisfies` 边 / 已有 Contract 覆盖同 REQ"的 `Check` | warn 不 block(相似性误报多),命中即提示复用 |
| 跨轨重复提升为共享契约(根治) | reuse 扫描发现同一能力被 ≥2 个 track 需要 → Compose 期人工建议引入 `contract/shared-lib`(单 producer、多 consumer) | 不自动连边(避免过早抽象:三行相似不该硬拗成契约) |

reuse 门是把 wdf 的 brownfield converge/gap 分析,从"一次性"升级成"常驻复用门"。

**结论**:漂移与重复造轮子两类治理现象,均可用 6 原语的组合表达(漂移=trace+contract+gate,重复=check+gate+contract),**无需为治理新增第 7 原语**——这是对内核最小性的又一轮佐证。意图漂移是被显式承认的工具边界,不是缺口。

### 6.4 变更意图轴反推(写 6 个 change-intent pack 暴露的内核补丁)

把 bugfix / refactor / spike / performance / migration / deprecation 写成纸面 pack(见 `packs/*.pack`),暴露的缺口及修补:

| 缺口 | 修补 | 由哪个 pack 逼出 |
|------|------|------|
| 12 动作全 greenfield,无"分析现有系统"原子 | 加第 13 动作 `diagnose`(§0) | bugfix 根因 / perf 热点 / migration inventory **共用** |
| WorkUnitState 止于 `integrated`,spike 产出是知识非代码 | 加非集成终态 `concluded` / `discarded`(§0) | spike |
| pipeline_skeleton 只有 feature 一套 | **每个变更意图包贡献自己的 skeleton**(§7);foundation 只给 feature | 全部 |
| pack 选择只认 profile 事实 | 加第二条选择轴 `applies_when_change`(按 change.type)+ `kind: change-intent`(§7) | 全部 |
| Gate 只能"require 某物存在" | 加 `forbid` 负向不变量(契约不准 bump / 无新 AC / 行为不变) | refactor、performance |
| fail_mode 被当成全局常量 | **fail_mode 是意图相对的**:feature/bugfix fail-closed,spike fail-open(§7) | spike |
| 无法限定修复 scope 不外扩 | `scope_policy{derive_from, forbid_widen}`(从 diagnose 半径派生可写文件) | bugfix |
| 流水线段无法按数据循环 / 跨 release 挂起 | skeleton 加 `iterate_over`(批次循环)/ `spans_releases`(跨版本挂起) | migration、deprecation |
| `on_exhausted` 只有 escalate/block | 加 `conclude`(时间盒到直接出结论,不升级) | spike |

**结论**:变更意图是与领域/形状**正交的第二条 pack 轴**。6 个意图包无损表达后,内核净增 1 个动作(`diagnose`)、2 个终态、若干 Gate/skeleton 字段,**未动 6 原语本身**——领域轴证"造什么靠加 pack",意图轴证"做哪种改动也靠加 pack"。`diagnose` 被三条 reactive 流共用,是它够格进内核(而非留在单包)的关键证据。详见 §7。

### 6.5 领域 planning 包分解反推(5 个独立 planning pack)

把 foundation 中"规划脊柱"拆成 5 个独立 pack,暴露的结构性发现:

| 缺口 | 修补 | 由哪个 pack 逼出 |
|------|------|------|
| foundation 既管 governance 又管 planning,违反单一职责 | 拆出 requirement-analysis / architecture / task-decomposition / api-design / data-design;foundation 缩为纯 governance 底盘 | 全部 |
| `applies_when: always` 只能有一个常驻包 | 允许多个 pack 声明 `always`,按 priority 排序;planning 包 priority=20 高于 foundation(0) | requirement-analysis、task-decomposition |
| 原型项目不应强要 C4/ADR | architecture 的 `applies_when: criticality: "!prototype"` | architecture |
| API 契约不该混在 backend 实现里 | api-design.pack 生产 `contract/openapi`;backend.pack 改为 `consumes` | api-design |
| DB schema 不该混在 backend 实现里 | data-design.pack 生产 `contract/db-schema`;backend.pack 改为 `consumes` | data-design |
| 无持久化能力的项目(纯算法库/CLI 工具)不应命中数据设计 | 新增 profile 第 9 维 `persistence: none\|embedded-store\|database`;data-design `applies_when: persistence: "$exists"` | data-design |
| planning 产物需要在 entry-phase4 门中体现,但 foundation 不想硬编码 | 各 planning pack 通过 `gate_patches.entry-phase4` 把 artifact/trace 注入共享门 | 全部 |
| 出口门的 `ac_to_test` trace 是任务分解层的职责,不应留在 foundation | `task-decomposition.pack` 的 `gate_patches.exit-merged` 注入 `ac_to_test` trace | task-decomposition |

**结论**:planning 脊柱的分解验证了"compose, don't hardcode"原则在**时间维度**上的适用性——不仅是横向(前后端)可拆,纵向(分析→架构→任务→API→数据)也可拆。foundation 作为常驻 governance 底盘,不再预设任何 planning 产物;项目类型通过 profile 维度自动选择需要的 planning 层。新增 `persistence` 维度是第 9 个 profile 事实,使数据设计成为可选层而非强制层。

---

## 7. 第二条 pack 轴:变更意图(change-intent)

> bug-fix 逼出的发现:pack 不只一条选择轴。**领域/形状轴**(profile 命中)管"造什么";**变更意图轴**(change.type 命中)管"做哪种改动"。两轴正交,Compose 取交叉积:选中的意图骨架 × 所有 active 领域包的 scope/check。

### 两轴对比

| | 领域/形状轴 | 变更意图轴 |
|---|---|---|
| 成员 | foundation / frontend / backend / embedded / requirement / architecture … | feature / bugfix / refactor / performance / migration / spike / deprecation |
| 选择输入 | `profile.yaml` 事实(has_ui / boundary / deployment …) | 变更描述符 `.spec-graph/changes/<id>.yaml` 的 `type` |
| 选择字段 | `applies_when` | `applies_when_change` |
| 贡献什么 | artifacts / `contributes_track`(scope) / checks | `pipeline_skeleton`(流程形状) / 意图特定门 |
| pack 判别 | (默认 domain) | `kind: change-intent` |

### change-intent pack 的 manifest 扩展

```ts
interface ChangeIntentManifest {
  name: string;
  version: string;
  kind: 'change-intent';           // 判别字段:落在意图轴
  priority: number;
  applies_when_change: { type: ChangeType };  // 按变更描述符的 type 命中,而非 profile
  provides: Provides;              // 复用同一 Provides,但核心是 pipeline_skeleton + gates
}

type ChangeType =
  | 'feature' | 'bugfix' | 'refactor' | 'performance'
  | 'migration' | 'spike' | 'deprecation';   // pack 可扩展;feature 由 foundation 提供

// 变更描述符(OpenSpec "change as unit" 的坍缩:一次变更 = 一个 patch + 一个 type)
interface ChangeDescriptor {
  id: NodeId;
  type: ChangeType;                // 决定激活哪个意图包
  title: string;
  targets?: NodeId[];              // 受影响节点(diagnose 产出;driver of scope_policy)
}
```

### Pipeline / Gate 字段扩展(意图包逼出)

```ts
interface Pipeline {
  stages: ActionVerb[];
  max_retries: number;
  on_exhausted: 'escalate' | 'block' | 'conclude';  // 'conclude' = spike 时间盒到直接出结论
  iterate_over?: 'batches';        // migration:implement→test 段按 plan 的批次循环
  spans_releases?: boolean;        // deprecation:跨多个 release,允许中途挂起
  terminal_states?: WorkUnitState[];  // spike: [concluded, discarded](覆盖默认 integrated)
}

interface Gate {
  // ... 原有字段(on_transition / require_checks / require_artifacts / require_traces)
  forbid?: ForbidInvariant[];      // 负向不变量:禁止某事发生(refactor/perf)
  fail_mode: 'block' | 'warn';     // 意图相对:feature/bugfix=block(fail-closed),spike=warn(fail-open)
}

// 负向不变量:与 require_* 相反,断言"这些变化不得发生"
type ForbidInvariant =
  | 'contract_version_bump'        // 任一 contract.version 变化(refactor/perf 禁止)
  | 'new_requirement'              // 新增 REQ/AC(refactor 禁止 — 否则就是 feature)
  | 'behavior_delta';              // 任一既有测试结果翻转(refactor 禁止)

// 限定 work-unit 可写范围,防止"顺手重构"
interface ScopePolicy {
  derive_from: ArtifactKind;       // 从哪个工件派生爆炸半径(bugfix: verification/root-cause)
  forbid_widen: boolean;           // 是否禁止超出该半径
}
```

### Compose 拼装(两轴交叉)

```
1. 领域轴:applies_when 命中 profile 的包 → 提供 artifacts / tracks(scope) / checks(同 §5)
2. 意图轴:applies_when_change 命中当前 change.type 的包 → 提供 pipeline_skeleton + 意图门
   - 无显式 change(初次 greenfield 全量构建)→ 默认 feature 骨架(foundation 提供)
3. 拼装:选中的意图 skeleton 包裹领域包的 track scope
   - 例:前端的一个 bugfix = bugfix.skeleton[diagnose→implement→review→test→accept]
          在 frontend.track 的 scope(frontend/)+ frontend 的 system/deployment check 上跑
4. gates = foundation.gates ∪ 领域包 provides.gates ∪ 意图包 provides.gates,再经 gate_patches 累加
5. diagnose 的产出(root-cause/inventory)→ 经 scope_policy 派生 work-unit.scope_write
```

**不变量补充**(在 §2 graph.yaml 不变量之上):
- 一个 graph 在某次变更中**恰好激活一个意图包**(change.type 唯一);greenfield 全量构建 = feature。
- 意图包的 `pipeline_skeleton` 覆盖 foundation 的默认 feature skeleton(同名 stage 以意图包为准)。
- `forbid` 与 `require_*` 可共存于同一门;求值时 forbid 命中即 block,优先于 require 通过。

---

## 8. 完整目录结构

```
spec-graph/
├── schemas.md                                   # 本文件:所有 schema 定义 + 发现记录
├── CLAUDE.md                                    # 架构总览 + 血缘 + 设计原则
├── packs/                                       # pack 库:领域包 × 意图包 = N × M 组合
│   ├── foundation.pack/                        # 常驻治理底盘
│   │   ├── pack.yaml
│   │   ├── templates/constitution.yaml
│   │   └── rules/
│   ├── requirement-analysis.pack/              # 需求分析层
│   │   ├── pack.yaml
│   │   └── templates/prd.md
│   ├── architecture.pack/                       # 架构设计层
│   │   ├── pack.yaml
│   │   └── templates/c4-architecture.md
│   ├── task-decomposition.pack/                # 任务分解层
│   │   ├── pack.yaml
│   │   └── templates/story.md
│   ├── api-design.pack/                        # API 契约层
│   │   ├── pack.yaml
│   │   └── templates/openapi.yaml
│   ├── data-design.pack/                        # 数据设计层
│   │   ├── pack.yaml
│   │   └── templates/data-model.md
│   ├── frontend.pack/                           # 前端实现层
│   │   ├── pack.yaml
│   │   └── templates/
│   ├── backend.pack/                            # 后端实现层
│   │   ├── pack.yaml
│   │   └── templates/
│   ├── embedded.pack/                          # 嵌入式/固件层
│   │   ├── pack.yaml
│   │   └── templates/
│   ├── feature.pack/                            # 意图:新功能开发(默认)
│   │   └── pack.yaml
│   ├── bugfix.pack/                             # 意图:缺陷修复
│   │   └── pack.yaml
│   ├── refactor.pack/                           # 意图:重构(行为零变更)
│   │   └── pack.yaml
│   ├── spike.pack/                             # 意图:探针探索
│   │   └── pack.yaml
│   ├── performance.pack/                        # 意图:性能优化
│   │   └── pack.yaml
│   ├── migration.pack/                          # 意图:大规模迁移
│   │   └── pack.yaml
│   └── deprecation.pack/                        # 意图:弃用与删除
│       └── pack.yaml
├── docs/                                        # 引擎设计文档
│   ├── sense-inference-rules.md              # 9 维度推断规则
│   ├── compose-algorithm.md                  # Compose 算法伪代码
│   ├── enforce-state-machine.md             # Enforce 状态机
│   └── change-dsl.md                         # 变更描述符 DSL(意图轴输入格式)
└── examples/
    └── fullstack-web/                          # 全栈 Web 项目完整示例
        ├── profile.yaml                       # 输入:9 维度 profile
        ├── graph.yaml                          # 输出:Compose 结果
        └── README.md
```

---

## 9. 内核三大原语总结

spec-graph 的核心是**三条正交选择轴**，每条轴都遵循"声明式选择、确定性合成"原则:

| 轴 | 选择输入 | 选择字段 | 贡献 | 数量级 |
|---|---|---|---|---|
| **领域形状轴** | `profile.yaml` 9 维度事实 | `applies_when` | artifacts / tracks / checks | ~10 个 packs |
| **变更意图轴** | `changes/*.yaml` 的 `type` (Change DSL) | `applies_when_change` | pipeline_skeleton / scope_policy / gates | ~7 个 packs |
| **联邦拓扑轴** | `profile.topology` | `federated_consume` | 跨 repo 契约绑定 / deferred 集成 | mono / federated / distributed |

**N × M 组合涌现性**:10 个领域包 × 7 个意图包 = **70 种不同的工作流组合**，无需写任何新代码，只需 Compose 引擎自动装配。

**内核最小性保证**:
- 只认 7 个 artifact 根类型(requirement/design/contract/plan/implementation/verification/change-record)
- 只认 13 个动作动词(propose/specify/design/contract/plan/**diagnose**/implement/review/test/accept/integrate/release/archive)
- 只认 4 层验收(unit/integration/system/deployment)
- 只认 3 种 fail_mode(block/warn/conclude)
- 只认 2 种 cardinality(every/exists)

所有领域复杂性都封装在 pack 里，内核永远不长胖。
- `fail_mode` 由意图包声明,不是全局常量——同一道 exit 门在 feature 下 block、在 spike 下 warn。
