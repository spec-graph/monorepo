---
id: design/data-model
kind: design/data-model
status: completed
created_at: 2026-06-28T13:50:00Z
author: AI Agent
---

# Data Model Design

## 核心数据实体

### 1. Profile (项目配置)
```yaml
profile:
  version: string
  meta:
    created_at: timestamp
    source:
      repo_scan: boolean
      llm_classified: boolean
      reviewed_at: timestamp
  facts:
    has_ui: 'none' | 'cli' | 'gui' | 'web' | 'native'
    boundary: 'internal' | 'published-api' | 'published-lib' | 'hardware-iface'
    topology: 'mono' | 'federated'
    deployment: 'process' | 'package' | 'binary' | 'firmware' | 'hosted-service'
    consumers: 'self' | 'internal-team' | 'external-public'
    field: 'greenfield' | 'brownfield'
    criticality: 'prototype' | 'standard' | 'compliance'
    team: 'solo' | 'small' | 'multi'
    persistence: 'none' | 'embedded-store' | 'database'
  repo_signals: object
  overrides: object
```

### 2. Graph (工作流图)
```yaml
graph:
  version: string
  meta:
    composed_at: timestamp
    profile_hash: string
    change_type: string
    packs_used: array
  artifacts: ArtifactDecl[]
  actions: string[]
  checks: CheckDecl[]
  gates: Gate[]
  tracks: TrackContribution[]
  pipeline_skeleton: PipelineSkeleton
  acceptance_layers: object
  scope_policy: ScopePolicy
  agents: AgentDecl[]
  agent_bindings: AgentBinding[]
  meetings: MeetingDecl[]
  project_config: ProjectConfig
```

### 3. Artifact (工件声明)
```yaml
artifact:
  id: string                    # 例如: requirement/prd/PRD-001
  kind: string                  # 例如: requirement/prd
  status: 'pending' | 'in_progress' | 'ready' | 'completed' | 'failed' | 'blocked'
  optional: boolean
  schema_ref: string
  default_producer: string
  default_consumers: string[]
  produced_by: string
  consumed_by: string[]
```

### 4. Check (检查声明)
```yaml
check:
  id: string                    # 例如: lint-check
  kind: string                  # 例如: lint
  command: string               # 例如: npm run lint
  layer: 'unit' | 'integration' | 'system' | 'deployment'
  threshold: object
  status: 'pending' | 'passed' | 'failed'
```

### 5. Gate (门控声明)
```yaml
gate:
  id: string                    # 例如: propose-exit-gate
  on_transition: string[]       # 例如: ['propose→specify']
  require_artifacts: string[]
  require_checks: string[]
  require_traces: TraceQuery[]
  require_contracts_current: boolean
  forbid: string[]
  fail_mode: 'block' | 'warn'
  enabled: boolean
  provided_by: string
```

### 6. Trace (追溯关系)
```yaml
trace:
  from: string                  # 源 artifact ID
  from_kind: string             # 源 artifact kind
  to: string                    # 目标 artifact ID
  to_kind: string               # 目标 artifact kind
  relation: string              # 关系类型: derives, implements, satisfies, verifies
```

### 7. Agent (代理声明)
```yaml
agent:
  id: string                    # 例如: pm, architect, developer
  description: string
  prompt_ref: string            # 系统提示模板路径
  model_tier: 'fast' | 'standard' | 'capable'
  input_artifact_kinds: string[]
  output_artifact_kinds: string[]
  actions: string[]
  checks: string[]
```

### 8. Meeting (会议声明)
```yaml
meeting:
  id: string                    # 例如: requirements-meeting
  description: string
  purpose: string
  participants: MeetingParticipant[]
  rounds: MeetingRound[]
  output_artifacts: string[]
  on_actions: string[]
  expert_invite_protocol: string
  min_rounds: number
  max_rounds: number
```

### 9. Change (变更描述符)
```yaml
change:
  id: string                    # 例如: change-1782554927671
  title: string
  description: string
  created_at: timestamp
  type: 'feature' | 'bugfix' | 'refactor' | 'spike' | 'performance' | 'migration' | 'deprecation'
  priority: 'low' | 'medium' | 'high' | 'critical'
  scope:
    tracks: string[]
    files:
      include: string[]
      exclude: string[]
    contracts: string[]
  impact:
    risk_level: 'low' | 'medium' | 'high' | 'critical'
    acceptance_layers: object
    flags: object
  status: 'proposed' | 'in_progress' | 'suspended' | 'completed' | 'discarded' | 'escalated'
  applied_at: timestamp
  completed_at: timestamp
  discarded_at: timestamp
  discard_reason: string
  audit_log: AuditEntry[]
```

### 10. MachineState (状态机状态)
```yaml
machine_state:
  current_stage: string
  stage_history: StageTransition[]
  artifacts: Record<string, ArtifactStatus>
  checks: Record<string, CheckStatus>
  metadata: object
```

## 数据存储策略

### 文件系统存储
```
.spec-graph/
├── profile.yaml              # 项目配置
├── graph.yaml                # 工作流图
├── machine-state.yaml        # 状态机状态
├── constitution.yaml         # 项目宪法
├── permissions.yaml          # 权限配置
├── artifacts/                # 文档内容
│   ├── prd/
│   ├── architecture/
│   ├── epics/
│   ├── story/
│   ├── task/
│   ├── adr/
│   ├── design/
│   ├── requirement/
│   ├── verification/
│   ├── change-record/
│   └── meta/
├── analysis/                 # 阶段分析
│   └── propose.yaml
├── traces/                   # 追溯关系
│   ├── plan_to_requirement.yaml
│   └── design_to_story.yaml
├── checklists/               # 质量检查清单
│   └── plan_story_S-001.md
└── changes/                  # 变更描述符
    ├── change-xxx.json
    └── archived/
```

### 数据关系
```
Profile ──1:1──→ Graph
Graph ──1:N──→ Artifact
Graph ──1:N──→ Check
Graph ──1:N──→ Gate
Graph ──1:N──→ Trace
Graph ──1:N──→ Agent
Graph ──1:N──→ Meeting
Graph ──1:N──→ Change
Graph ──1:1──→ MachineState
```

### 索引策略
- **Artifact 索引**: 按 id 和 kind 索引
- **Trace 索引**: 按 from/to 索引
- **Gate 索引**: 按 on_transition 索引
- **Change 索引**: 按 status 和 created_at 索引

## 数据完整性约束

### 唯一性约束
- Artifact ID 必须唯一
- Check ID 必须唯一
- Gate ID 必须唯一
- Change ID 必须唯一

### 引用完整性
- Trace.from 必须引用存在的 Artifact
- Trace.to 必须引用存在的 Artifact
- Gate.require_artifacts 必须引用存在的 Artifact
- Gate.require_checks 必须引用存在的 Check

### 状态约束
- Artifact 状态只能按 pending → in_progress → ready/completed/failed/blocked 转移
- Check 状态只能按 pending → passed/failed 转移
- Change 状态只能按 proposed → in_progress → completed/discarded 转移

## 性能优化

### 缓存策略
- Graph 缓存在内存中（启动时加载）
- MachineState 缓存在内存中（每次更新时持久化）
- Trace 索引缓存在内存中（按需重建）

### 查询优化
- 使用 Map 数据结构存储 Artifacts
- 使用索引加速 Trace 查询
- 使用批量操作更新多个 Artifacts

### 持久化优化
- 使用 YAML 格式存储（人类可读）
- 增量更新（只更新变化的部分）
- 异步持久化（不阻塞主流程）
