# Gate 系统统一 — Capability Spec

## MODIFIED Requirements

### Requirement: Unified Gate Evaluation

`gate-enforcement` 模块 SHALL 统一 knowledge gate.yaml 和 graph.yaml gates 的评估，knowledge 为 primary source，graph 为 supplementary source。

#### Scenario: Gate merge on advance

WHEN `automator.submitResult()` 执行 gate 评估
THEN SHALL 从 `knowledge/stages/<stage>/gate.yaml` 加载 entry/exit criteria（primary）
AND SHALL 从 `graph.yaml` 查找 `on_transition` 匹配当前 stage transition 的 gates（supplementary）
AND SHALL 合并：knowledge criteria + graph 追加的 checks/artifacts/traces
AND 合并后的 criteria SHALL 一起传给 `evaluateGate()`

#### Scenario: Knowledge-only evaluation

WHEN graph.yaml 不包含匹配当前 transition 的 gates
THEN evaluation SHALL 只使用 knowledge gate.yaml 的 criteria
AND 行为 SHALL 和 v3.0 完全一致（向后兼容）

#### Scenario: Graph supplementary checks

WHEN graph.yaml gates 定义 `require_checks: ["lint", "typecheck"]`
THEN 合并后的 exit criteria SHALL 包含这些 checks
AND 每个 check SHALL 转换为 rule 类型的 criterion
AND criterion id SHALL 前缀 `graph-`（如 `graph-lint`）
AND graph 追加的 criteria SHALL 不影响 knowledge 定义的 criteria

#### Scenario: No override from graph

WHEN graph.yaml 包含和 knowledge gate.yaml 相同 id 的 criterion
THEN knowledge 的 criterion SHALL 保持
AND graph 的同 id criterion SHALL 被忽略
AND 系统 SHALL 输出 warning: "graph gate X duplicates knowledge gate, using knowledge version"

## ADDED Requirements

### Requirement: Graph Gate Reference Format

compose 模块 SHALL 以引用方式输出 graph.yaml gates，不再复制完整的 criteria 定义。

#### Scenario: Compose output format

WHEN compose 生成 graph.yaml
THEN gates 段 SHALL 使用引用格式：
```yaml
gates:
  - id: specify-exit
    source: knowledge/stages/specify/gate.yaml
    on_transition: [specify, design]
    add_checks: []              # pack 可追加
    add_artifacts: []           # pack 可追加
```
AND `source` SHALL 指向 knowledge base 的 gate.yaml 路径
AND `add_checks/add_artifacts/add_traces` 为 pack 追加内容（可选）

#### Scenario: Backward compat with old graph.yaml

WHEN 读取 v3.0 格式的 graph.yaml（包含完整 criteria 定义）
THEN gate-enforcement SHALL 兼容旧格式
AND 旧格式的 gate SHALL 正常工作（作为 supplementary）
AND 系统 SHALL 输出 deprecation warning

### Requirement: Gate Merge Algorithm

gate-enforcement 模块 SHALL 实现明确的 gate 合并算法，保证确定性。

#### Scenario: Deterministic merge

WHEN 多次 evaluateGate 对同一 stage
THEN 合并后的 criteria 列表 SHALL 顺序一致（knowledge 在前，graph 追加在后）
AND 同一 graph gate 的 add_checks SHALL 按声明顺序追加
AND 不同 pack 的 add_checks SHALL 按 pack priority 排序追加

#### Scenario: Empty graph gates

WHEN graph.yaml 不存在或 gates 为空
THEN gate evaluation SHALL 只使用 knowledge gate.yaml
AND 不报错
AND 行为 SHALL 和 v3.0 完全一致
