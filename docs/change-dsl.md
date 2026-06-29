# 变更描述符 DSL (Change DSL)

> 版本: v1.0
> 作用: 描述一次变更的意图、范围、影响面 → Compose 选择对应的 intent pack
> 位置: `.spec-graph/changes/<YYYYMMDD>-<change-id>.yaml`

---

## 0. 核心设计原则

变更描述符是 **意图轴的唯一输入**。Compose 引擎读取它来选择对应的 intent pack，决定流水线形状、门控规则、scope 限制。

```
用户描述变更 → Sense 阶段生成变更描述符 → Compose 选择 intent pack → Enforce 执行
```

---

## 1. 完整格式定义

```yaml
# .spec-graph/changes/20260625-S-001-fix-login-bug.yaml
---
# ===== 元数据 =====
id: S-001
title: "修复登录页面 500 错误"
description: |
  用户输入错误密码时，后端返回 500 而非 401 Unauthorized。
  根因: auth_service 未捕获 InvalidPassword 异常。
created_at: "2026-06-25T10:30:00Z"
author: "wang@example.com"
linked_stories: ["S-001"]
linked_prs: ["#123"]

# ===== 意图类型 (决定选择哪个 intent pack) =====
type: bugfix              # feature / bugfix / refactor / spike / performance / migration / deprecation
priority: medium          # low / medium / high / critical (影响重试策略 + 升级阈值)

# ===== 范围定义 (决定哪些 domain packs 参与 + scope write 限制) =====
scope:
  # 受影响的 tracks (空 = 所有 active tracks)
  tracks: [be]            # fe / be / firmware / ...

  # 受影响的文件 glob (Enforce 阶段限制可写范围)
  files:
    include: ["src/auth/**/*.ts"]
    exclude: ["src/auth/test/**/*.ts"]

  # 受影响的 contracts (用于涟漪计算)
  contracts:
    - contract/openapi#POST-/api/v1/auth/login

# ===== 影响分析 (用于 gate 阈值调整) =====
impact:
  # 风险等级:影响 scope policy + 门严格度
  risk_level: medium       # low / medium / high / critical

  # 受影响的验收层 (可跳过某些层)
  acceptance_layers:
    unit: true
    integration: true
    system: false           # 无需跑全量 e2e
    deployment: false

  # 特殊影响标记
  flags:
    schema_change: false    # 是否有 DB schema 变更
    contract_breaking: false # 是否有破坏性契约变更
    security_sensitive: true # 是否涉及安全
    data_migration: false   # 是否需要数据迁移

# ===== 涟漪传播规则 (跨 track / 跨 repo 影响) =====
ripple:
  # 是否自动通知消费者
  notify_consumers: true

  # 消费者需要做什么
  consumer_actions:
    - re_test              # 消费者需要重跑测试
    # - re_implement       # 消费者需要改代码(破坏性变更)

  # 跨 repo 联邦影响
  federated:
    - repo: frontend-app
      action: validate_contract

# ===== 执行策略 (影响 pipeline 行为) =====
execution:
  # 重试策略
  max_retries: 5            # 覆盖 intent pack 默认值
  backoff: "exponential"   # linear / exponential / fixed

  # 时间盒限制 (spike 专用)
  timebox_hours: 8

  # 跨 release 挂起配置 (deprecation 专用)
  spans_releases: false
  suspend_after_release: null

  # 分批执行配置 (migration 专用)
  batch_mode: false
  batches: []

# ===== 基线与参考 =====
baseline:
  # 基线 git commit (用于 diff / 回归对比)
  commit: "abc123def"

  # 基线版本 (用于 schema drift 检测)
  contract_versions:
    contract/openapi: "1.2.3"
    contract/db-schema: "0.8.0"

  # 基线测试结果 (用于 refactor behavior_delta 检测)
  test_results_hash: "sha256:xyz789"

# ===== 状态追踪 =====
status: in_progress        # proposed / in_progress / suspended / completed / discarded / escalated
started_at: "2026-06-25T10:35:00Z"
completed_at: null
retries_used: 0
last_gate_passed: "bugfix-entry"

# ===== 审计日志 =====
audit_log:
  - timestamp: "2026-06-25T10:30:00Z"
    action: created
    author: "wang@example.com"
    message: "Initial change created"
  - timestamp: "2026-06-25T10:35:00Z"
    action: gate_passed
    gate: "bugfix-entry"
    message: "Reproduction test confirmed failing"
```

---

## 2. `type` 字段枚举与对应 intent pack

| type 值 | 对应 intent pack | 典型场景 | 必备字段 |
|---------|------------------|---------|---------|
| `feature` | feature.pack | 新功能开发、需求增强 | scope.tracks, impact.risk_level |
| `bugfix` | bugfix.pack | 缺陷修复、生产问题回滚 | scope.files, baseline.commit, root_cause |
| `refactor` | refactor.pack | 代码重构、架构调整、技术债偿还 | scope.files, baseline.test_results_hash |
| `spike` | spike.pack | 技术调研、原型验证、可行性分析 | execution.timebox_hours |
| `performance` | performance.pack | 性能优化、基准测试、瓶颈修复 | baseline.commit, perf_targets |
| `migration` | migration.pack | 框架升级、API 迁移、大规模代码变动 | execution.batch_mode, batches |
| `deprecation` | deprecation.pack | 功能弃用、API 下线、版本淘汰 | execution.spans_releases, deprecation_schedule |

---

## 3. 各类型变更的字段扩展

### 3.1 Bugfix 扩展

```yaml
type: bugfix

# bugfix 专用字段
bugfix:
  # 根因分类
  root_cause_category: exception_handling  # logic / race_condition / config / dependency

  # 重现条件
  reproduction:
    deterministic: true
    steps: ["输入错误密码", "点击登录"]

  # 受影响的版本
  affected_versions: ["v1.2.0", "v1.2.1"]

  # 回归验证要求
  regression_requirements:
    add_unit_test: true
    add_integration_test: true
    add_e2e_test: false
```

### 3.2 Refactor 扩展

```yaml
type: refactor

# refactor 专用字段
refactor:
  # 重构类型
  refactor_type: extract_method   # rename / extract / inline / move_files

  # 等价性验证要求
  equivalence_requirements:
    test_results_must_match: true    # 逐条测试结果必须一致
    no_new_requirements: true        # 禁止新增 AC
    no_contract_change: true         # 禁止契约变更

  # 技术债清理目标
  tech_debt_target:
    complexity_reduction: 15%        # 圈复杂度降低目标
    coverage_maintenance: true       # 覆盖率不降低
```

### 3.3 Spike 扩展

```yaml
type: spike

# spike 专用字段
spike:
  # 要回答的问题
  questions:
    - "Redis 能否支撑 10k QPS 的会话存储？"
    - "GraphQL 能否替代 REST 减少请求次数？"

  # 成功标准(回答完这些问题就结束,不要求产出可合并代码)
  success_criteria:
    - "输出性能基准报告"
    - "给出技术选型建议"
    - "列出风险与替代方案"

  # 输出产物
  expected_artifacts:
    - verification/spike-findings
    - verification/perf-report

  # 时间盒(小时)
  timebox_hours: 8
```

### 3.4 Performance 扩展

```yaml
type: performance

# performance 专用字段
performance:
  # 优化目标
  targets:
    - metric: p95_latency_ms
      current: 500
      target: 200
    - metric: throughput_qps
      current: 1000
      target: 5000
    - metric: memory_usage_mb
      current: 500
      target: 300

  # 基线环境
  baseline_environment: staging

  # 禁止副作用
  constraints:
    no_contract_change: true
    no_behavior_change: true
    no_functional_regression: true
```

### 3.5 Migration 扩展

```yaml
type: migration

# migration 专用字段
migration:
  # 迁移类型
  migration_type: api_version_bump   # framework_upgrade / schema_migration / language_migration

  # 从什么版本迁移到什么版本
  from_version: "v1"
  to_version: "v2"

  # 分批执行
  batches:
    - id: batch-1
      name: "认证模块"
      files: ["src/auth/**/*"]
      status: pending
    - id: batch-2
      name: "用户模块"
      files: ["src/user/**/*"]
      status: pending

  # 双跑验证(新旧实现并行跑,结果对比)
  dual_run_validation:
    enabled: true
    sample_rate: 0.1  # 10% 流量对比
    max_diff_threshold: 0.001  # 千分之一差异报警
```

### 3.6 Deprecation 扩展

```yaml
type: deprecation

# deprecation 专用字段
deprecation:
  # 弃用的功能/API
  feature: "/api/v1/legacy-auth"

  # 弃用时间表
  schedule:
    announce_at: "2026-06-01"
    deprecate_at: "2026-09-01"    # 标记弃用,警告
    remove_at: "2026-12-01"        # 彻底删除

  # 消费者通知
  consumer_notification:
    required: true
    channels: ["changelog", "email", "in_app_banner"]
    lead_time_months: 3

  # 迁移路径
  migration_path:
    from: "/api/v1/legacy-auth"
    to: "/api/v2/oauth-login"
    guide: "docs/migration/legacy-auth-to-oauth.md"

  # 零消费者验证(删除前必须通过)
  zero_consumer_validation:
    required: true
    scan_scope: all_repos
```

---

## 4. 状态流转

```
proposed → in_progress → ┬→ completed (正常结束)
                          ├→ discarded (放弃, spike 专用)
                          ├→ escalated (重试耗尽)
                          └→ suspended (跨 release 挂起, deprecation 专用)
```

### 状态转换规则

| 状态 | 允许的下一状态 | 触发条件 |
|------|---------------|---------|
| `proposed` | `in_progress` | 通过 entry gate |
| `in_progress` | `completed` | 通过 exit gate,所有 checks pass |
| `in_progress` | `discarded` | spike 结论是"别做",或用户主动取消 |
| `in_progress` | `escalated` | max_retries 耗尽 |
| `in_progress` | `suspended` | spans_releases=true 且当前 release 结束 |
| `suspended` | `in_progress` | 下一 release 开始,自动唤醒 |

---

## 5. Gate 阈值动态调整

变更描述符的 `impact.risk_level` 会动态调整 gate 严格度：

| risk_level | 调整 |
|------------|------|
| `critical` | max_retries=10, coverage≥95%,所有层全跑,无 skip |
| `high` | max_retries=7, coverage≥90% |
| `medium` | max_retries=5, coverage≥80%(默认) |
| `low` | max_retries=3, coverage≥70%,可 skip e2e |

---

## 6. Scope Policy 联动

变更描述符的 `scope.files` 会与 intent pack 的 `scope_policy` 联动：

**例 bugfix**:
```yaml
# bugfix.pack 的 scope_policy
scope_policy:
  derive_from: verification/root-cause
  forbid_widen: true
```

Enforce 时：
1. diagnose 阶段产出 `verification/root-cause`，其中包含 `affected_files` 列表
2. 实际变更的文件范围必须 ⊆ `affected_files` ∩ `change.scope.files.include`
3. 超出范围的文件变更 → gate 阻断,防止"顺手修了另一个 bug"

---

## 7. CLI 交互

```bash
# 创建新变更(交互式)
spec-graph change create --type bugfix --title "修复登录 500"

# 查看当前变更状态
spec-graph change status S-001

# 列出所有活跃变更
spec-graph change list --status in_progress

# 暂停变更(跨 release 挂起)
spec-graph change suspend S-001

# 恢复变更
spec-graph change resume S-001

# 放弃变更
spec-graph change discard S-001 --reason "不再需要"
```

---

## 8. 与现有机制的集成

### 8.1 与 Compose 集成

Compose 引擎读取 `change.type` → 匹配 `applies_when_change` → 选中 intent pack → 用 intent pack 的 `pipeline_skeleton` 覆盖默认流水线。

```typescript
// compose.ts
const changeDescriptor = loadChangeDescriptor(currentChangeId);
const intentPack = allPacks.find(p =>
  p.kind === "change-intent" &&
  matchesAppliesWhenChange(p.applies_when_change, changeDescriptor.type)
);

// 用 intent pack 的 skeleton 替换默认
graph.pipelineSkeleton = intentPack.provides.pipeline_skeleton;

// 合并 scope_policy
if (intentPack.provides.scope_policy) {
  graph.scopePolicy = mergePolicy(
    intentPack.provides.scope_policy,
    changeDescriptor.scope
  );
}
```

### 8.2 与 Enforce 集成

Enforce 每阶段执行前检查 `change.scope.files` → 限制可写文件范围 → 超出范围写入直接 fail。

### 8.3 与 Trace 追溯集成

每个 WorkUnit 关联 `change.id` → 追溯链上可查询"这次变更碰了哪些需求/契约/测试/代码"。

---

## 9. 变更涟漪图可视化

```
变更 S-001 (bugfix, be track)
  ↓
  改了 contract/openapi#POST-/api/v1/auth/login (version 1.2.3 → 1.2.4)
    ↓
    消费者 fe track 依赖此契约 → 自动触发 contract-test
    ↓
    消费者 mobile-app repo 依赖此契约 → 自动通知 + 触发联邦验证
      ↓
      mobile-app CI 验证通过 → ripple.propagated = true
```
