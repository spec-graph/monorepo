# Enforce 状态机引擎

> 版本: v1.0
> 作用:执行 graph.yaml → 驱动 WorkUnit 状态流转 → 门控检查 → 产出最终结果

---

## 0. 核心概念

**Enforce 是确定性执行引擎**。输入是 Compose 产出的 graph.yaml,输出是各 WorkUnit 的最终状态。整个过程无 LLM 参与,完全按 graph 中定义的 gates/checks/actions 顺序执行。

```
graph.yaml → WorkUnit 初始化 → ⬜ pending → ➡️ in_progress → ⬇️ Gate Evaluation →
                               → ✅ accepted / ❌ blocked / ⚠️ warned
                                         ↓
                                  产出产物 + 审计日志
```

---

## 1. WorkUnit 状态枚举

```typescript
enum WorkUnitState {
  // --- 待处理 ---
  PENDING = "pending",              // 等待进入下一阶段
  READY = "ready",                  // 前置条件满足,可开始

  // --- 处理中 ---
  IN_PROGRESS = "in_progress",      // 正在执行(如 coding/reviewing/testing...)
  WAITING = "waiting",              // 等待外部依赖(跨团队/federated)
  SUSPENDED = "suspended",          // 跨版本挂起(如 deprecation 宽限期)

  // --- 终态(集成流) ---
  ACCEPTED = "accepted",            // 验收通过
  BLOCKED = "blocked",              // 门控阻断
  ESCALATED = "escalated",          // 重试耗尽,需人工介入
  INTEGRATED = "integrated",        // 已合并到主线
  RELEASED = "released",            // 已发布

  // --- 终态(非集成流,spike 专用) ---
  CONCLUDED = "concluded",          // 探针完成,有结论(不集成代码)
  DISCARDED = "discarded",          // 探针终止,不继续
}
```

**终态集**: { ACCEPTED, BLOCKED, ESCALATED, INTEGRATED, RELEASED, CONCLUDED, DISCARDED }

---

## 2. 状态转换图

```
                      ┌─────────────┐
                      │   PENDING   │
                      └──────┬──────┘
                             │ 前置条件满足
                             ▼
                      ┌─────────────┐
                      │    READY    │
                      └──────┬──────┘
                             │ 开始执行
                             ▼
                      ┌─────────────┐
                      │ IN_PROGRESS │
                      └──────┬──────┘
                             │
           ┌─────────────────┼─────────────────┐
           │ 完成            │ 外部依赖        │ 跨版本
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ Gate Eval   │   │   WAITING   │   │  SUSPENDED  │
    └──────┬──────┘   └─────────────┘   └─────────────┘
           │
   ┌───────┴───────┬──────────┬──────────┐
   │               │          │          │
   ▼               ▼          ▼          ▼
✅ ACCEPTED    ⚠️ WARNED  ❌ BLOCKED  🔄 RETRY
   │               │          │          │
   │               │          │     max_retries
   │               │          │          ▼
   │               │          │     ⚠️ ESCALATED
   │               │          │
   └───────────────┴──────────┘
               │
               ▼ (intent 决定终态分支)
     ┌─────────┴─────────┐
     │  集成流终态      │  非集成流终态
     │                   │
     ▼                   ▼
 INTEGRATED         CONCLUDED / DISCARDED
     │
     ▼
  RELEASED (若有 release 动作)
```

---

## 3. Gate 求值引擎

```typescript
interface GateEvaluationResult {
  gateId: string;
  passed: boolean;
  failMode: "block" | "warn";   // block = 阻断 / warn = 警告但继续
  artifacts: { [artifactId: string]: boolean };  // 每个 artifact 是否存在
  checks: { [checkId: string]: CheckResult };     // 每个 check 结果
  traces: { [traceName: string]: TraceResult };    // 每条追溯边结果
  forbidden: ForbiddenResult;           // 负不变量结果
  message: string;
}

function evaluateGate(
  gate: Gate,
  graph: Graph,
  projectRoot: string,
): GateEvaluationResult {
  const result: GateEvaluationResult = {
    gateId: gate.id,
    passed: true,
    failMode: gate.fail_mode,
    artifacts: {},
    checks: {},
    traces: {},
    forbidden: { violated: false, violations: [] },
    message: "",
  };

  // ===== 3.1 正向不变量: require_artifacts =====
  for (const artifactId of gate.require_artifacts ?? []) {
    const artifact = graph.artifacts.find(a => a.id === artifactId);
    const exists = checkArtifactExists(projectRoot, artifact);
    result.artifacts[artifactId] = exists;
    if (!exists && artifact?.optional !== true) {
      result.passed = false;
      result.message += `Missing required artifact: ${artifactId}\n`;
    }
  }

  // ===== 3.2 正向不变量: require_checks =====
  for (const checkId of gate.require_checks ?? []) {
    const check = graph.checks.find(c => c.id === checkId);
    const checkResult = runCheck(projectRoot, check);
    result.checks[checkId] = checkResult;
    if (!checkResult.passed) {
      result.passed = false;
      result.message += `Check failed: ${checkId} — ${checkResult.message}\n`;
    }
  }

  // ===== 3.3 正向不变量: require_traces =====
  for (const traceDef of gate.require_traces ?? []) {
    const traceResult = evaluateTrace(projectRoot, traceDef, graph);
    result.traces[traceDef.name] = traceResult;
    if (!traceResult.satisfied) {
      result.passed = false;
      result.message += `Trace '${traceDef.name}' not satisfied: ${traceResult.message}\n`;
    }
  }

  // ===== 3.4 负向不变量: forbid (refactor/performance 专用) =====
  if (gate.forbid && gate.forbid.length > 0) {
    result.forbidden = evaluateForbiddenInvariants(gate.forbid, projectRoot, graph);
    if (result.forbidden.violated) {
      result.passed = false;
      result.message += `Forbidden invariants violated:\n${result.forbidden.violations.join("\n")}\n`;
    }
  }

  return result;
}
```

---

## 4. 追溯边求值 (Trace Evaluation)

```typescript
interface TraceResult {
  satisfied: boolean;
  foundEdges: number;
  expectedCardinality: "exists" | "every" | "single";
  message: string;
}

function evaluateTrace(
  projectRoot: string,
  traceDef: TraceDefinition,
  graph: Graph,
): TraceResult {
  // 扫描所有 WorkUnit 产物,寻找 via 类型的边
  const allNodes = scanAllWorkUnitOutputs(projectRoot);

  const fromNodes = allNodes.filter(n => n.kind === traceDef.from_kind);
  const toNodes = allNodes.filter(n => n.kind === traceDef.to_kind);

  // 寻找符合 via 类型的边
  const edges = findEdges(fromNodes, toNodes, traceDef.via);

  // 按 cardinality 求值
  switch (traceDef.cardinality) {
    case "exists":
      // 至少一条边存在即可
      return {
        satisfied: edges.length > 0,
        foundEdges: edges.length,
        expectedCardinality: "exists",
        message: `Found ${edges.length} edges, expected at least 1`,
      };

    case "single":
      // 必须恰好一条边
      return {
        satisfied: edges.length === 1,
        foundEdges: edges.length,
        expectedCardinality: "single",
        message: `Found ${edges.length} edges, expected exactly 1`,
      };

    case "every":
      // 每个 from node 必须有一条到 to node 的边
      const everyFromHasEdge = fromNodes.every(fromNode =>
        edges.some(e => e.from === fromNode.id)
      );
      return {
        satisfied: everyFromHasEdge,
        foundEdges: edges.length,
        expectedCardinality: "every",
        message: `Expected every ${traceDef.from_kind} to have edge to ${traceDef.to_kind}, found ${edges.length} edges for ${fromNodes.length} source nodes`,
      };

    default:
      return {
        satisfied: false,
        foundEdges: edges.length,
        expectedCardinality: traceDef.cardinality as any,
        message: `Unknown cardinality: ${traceDef.cardinality}`,
      };
  }
}
```

---

## 5. 负向不变量求值 (Forbidden Invariants)

```typescript
interface ForbiddenResult {
  violated: boolean;
  violations: string[];
}

function evaluateForbiddenInvariants(
  forbidden: string[],
  projectRoot: string,
  graph: Graph,
): ForbiddenResult {
  const violations: string[] = [];

  for (const invariant of forbidden) {
    switch (invariant) {
      // 5.1 禁止契约版本变更
      case "contract_version_bump": {
        const contracts = graph.artifacts.filter(a => a.id.startsWith("contract/"));
        for (const contract of contracts) {
          const oldVersion = getContractBaselineVersion(projectRoot, contract.id);
          const newVersion = getContractCurrentVersion(projectRoot, contract.id);
          if (oldVersion !== newVersion) {
            violations.push(`Contract ${contract.id} version changed: ${oldVersion} → ${newVersion}`);
          }
        }
        break;
      }

      // 5.2 禁止新增需求/AC
      case "new_requirement": {
        const oldStories = getBaselineStories(projectRoot);
        const newStories = getCurrentStories(projectRoot);
        if (newStories.length > oldStories.length) {
          violations.push(`${newStories.length - oldStories.length} new stories added (should be 0)`);
        }
        break;
      }

      // 5.3 禁止行为变化(测试结果逐条一致)
      case "behavior_delta": {
        const oldTestResults = getBaselineTestResults(projectRoot);
        const newTestResults = getCurrentTestResults(projectRoot);
        const changedTests = findChangedTestResults(oldTestResults, newTestResults);
        if (changedTests.length > 0) {
          violations.push(`${changedTests.length} test results changed (should be 0):\n${changedTests.join("\n")}`);
        }
        break;
      }

      default:
        violations.push(`Unknown forbidden invariant: ${invariant}`);
    }
  }

  return {
    violated: violations.length > 0,
    violations,
  };
}
```

---

## 6. Pipeline 执行循环

```typescript
interface PipelineExecutionResult {
  finalState: WorkUnitState;
  retriesUsed: number;
  gateResults: GateEvaluationResult[];
  artifactsProduced: string[];
}

function executePipeline(
  workUnit: WorkUnit,
  graph: Graph,
  projectRoot: string,
): PipelineExecutionResult {
  const pipeline = graph.pipelineSkeleton;
  let retriesUsed = 0;
  const gateResults: GateEvaluationResult[] = [];
  const artifactsProduced: string[] = [];

  for (const stage of pipeline.stages) {
    let stageComplete = false;

    while (!stageComplete && retriesUsed < pipeline.max_retries) {
      // 6.1 执行 stage 动作(由 Agent 实际执行代码/写产物)
      const stageResult = executeStageAction(workUnit, stage, graph, projectRoot);
      artifactsProduced.push(...stageResult.artifactsProduced);

      // 6.2 寻找该 stage →下一 stage 的 gate
      const gate = findGateForTransition(gates, stage, nextStage);

      if (gate && gate.enabled) {
        const gateResult = evaluateGate(gate, graph, projectRoot);
        gateResults.push(gateResult);

        if (gateResult.passed) {
          // ✅ Gate 通过 → 进入下一 stage
          stageComplete = true;
        } else {
          // ❌ Gate 未通过
          if (gate.fail_mode === "block") {
            // block: 重试或升级
            retriesUsed++;
            if (retriesUsed >= pipeline.max_retries) {
              // 重试耗尽 → 按 on_exhausted 处理
              if (pipeline.on_exhausted === "escalate") {
                return {
                  finalState: WorkUnitState.ESCALATED,
                  retriesUsed,
                  gateResults,
                  artifactsProduced,
                };
              } else if (pipeline.on_exhausted === "conclude") {
                // spike 专用:时间到直接出结论,不升级
                return {
                  finalState: WorkUnitState.CONCLUDED,
                  retriesUsed,
                  gateResults,
                  artifactsProduced,
                };
              }
            }
            // 否则继续重试循环
          } else {
            // warn: 警告但继续
            stageComplete = true;
          }
        }
      } else {
        // 无 Gate → 直接进入下一 stage
        stageComplete = true;
      }
    }

    if (!stageComplete) {
      // 重试耗尽仍未完成
      return {
        finalState: WorkUnitState.BLOCKED,
        retriesUsed,
        gateResults,
        artifactsProduced,
      };
    }
  }

  // 所有 stages 完成 → 进入 accept 后的终态
  const terminalState = determineTerminalState(workUnit, graph);

  return {
    finalState: terminalState,
    retriesUsed,
    gateResults,
    artifactsProduced,
  };
}
```

---

## 7. 终态判定

```typescript
function determineTerminalState(workUnit: WorkUnit, graph: Graph): WorkUnitState {
  // 7.1 非集成流(spike):终态是 CONCLUDED/DISCARDED,不进 INTEGRATED
  const changeType = graph.meta.changeType;
  const intentPack = graph.meta.packsUsed.find(p => p.kind === "change-intent");

  if (intentPack?.terminal_states?.length > 0) {
    // 意图包自定义了终态集 → 检查是否在其中
    // spike 的 terminal_states = ["concluded", "discarded"]
    const acceptedTerminalState = workUnit.spikeConclusion === "discard"
      ? WorkUnitState.DISCARDED
      : WorkUnitState.CONCLUDED;
    return acceptedTerminalState;
  }

  // 7.2 集成流(默认):进 INTEGRATED
  return WorkUnitState.ACCEPTED;
}
```

---

## 8. Scope Policy 执行

```typescript
// 某些意图包限定可写文件范围(如 bugfix)
function enforceScopePolicy(
  workUnit: WorkUnit,
  scopePolicy: ScopePolicy,
  changedFiles: string[],
): { allowed: boolean; violations: string[] } {
  if (!scopePolicy) return { allowed: true, violations: [] };

  const violations: string[] = [];

  // 8.1 derive_from: scope 范围从某个 artifact 派生
  if (scopePolicy.derive_from) {
    const scopeArtifact = loadArtifact(scopePolicy.derive_from);
    const allowedFiles = scopeArtifact.affectedFiles; // 根因分析产出的受影响文件列表

    for (const file of changedFiles) {
      if (!allowedFiles.includes(file)) {
        violations.push(`File '${file}' is outside root-cause scope; forbidden by scope_policy.forbid_widen`);
      }
    }
  }

  // 8.2 forbid_widen:禁止扩大变更范围(bugfix 不能顺手重构
  if (scopePolicy.forbid_widen && violations.length > 0) {
    return { allowed: false, violations };
  }

  return { allowed: violations.length === 0, violations };
}
```

---

## 9. 迭代与跨版本挂起

```typescript
// migration.pack spans_releases = true → 允许跨 release 挂起
function handleSuspendedWorkUnit(workUnit: WorkUnit): {
  // 保存当前状态到 .spec-graph/suspended/
  saveSuspendedState(workUnit);

  // 记录当前 release 的 checkpoint
  recordReleaseCheckpoint(workUnit);

  // 下一 release 自动唤醒继续
  scheduleResumeOnNextRelease(workUnit);
}
```

---

## 10. 审计与可追溯

每次 Enforce 运行产出审计日志:

```yaml
# .spec-graph/audit/2026-06-25T10:30:00Z.yaml
work_unit_id: S-001
change_type: bugfix
started_at: "2026-06-25T10:30:00Z"
completed_at: "2026-06-25T10:45:00Z"
final_state: accepted
retries_used: 2
gates_evaluated:
  - gate_id: bugfix-entry
    passed: true
  - gate_id: bugfix-exit
    passed: true
artifacts_produced:
  - change-record/defect-report.md
  - verification/root-cause.md
  - verification/regression-test.spec.ts
checks_run:
  - reproduction-failing: passed
  - regression-green: passed
scope_violations: []
forbidden_violations: []
```

---

## 11. 失败闭合原则

> **任何未知情况 = FAIL,不是 PASS**

| 场景 | 处理方式 |
|------|----------|
| Gate 引用不存在的 artifact | 报错 + 阻断 |
| Gate 引用不存在的 check | 报错 + 阻断 |
| Check 命令执行失败(非零退出) | Check 结果 = fail |
| Trace 边未定义 | 视为 not satisfied |
| Forbidden invariant 无法求值 | 视为 violated |
| 未定义 fail_mode | 默认 = block(保守) |
| max_retries 未定义 | 默认 = 5 |
| on_exhausted 未定义 | 默认 = escalate |
| terminal_states 未定义 | 默认 = 集成流终态 |
