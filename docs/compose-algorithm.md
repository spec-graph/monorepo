# Compose 引擎算法伪代码

> 版本: v1.0
> 作用:将 profile.yaml + packs/*.pack.yaml → graph.yaml

---

## 0. 输入输出定义

### 输入

```typescript
interface ComposeInput {
  profilePath: string;           // profile.yaml
  packsDir: string;          // packs/ 目录
  changeType?: string;   // 变更类型(如 bugfix/refactor... 默认 feature
}
```

### 输出

```typescript
interface ComposeOutput {
  graph: Graph;           // graph.yaml 完整对象
  packsUsed: PackMatch[];  // 命中的 pack 列表
  warnings: string[];    // 警告信息
  errors: string[];     // 错误信息(如冲突)
}
```

---

## 1. 主流程

```typescript
function compose(input: ComposeInput): ComposeOutput {
  // ===== 阶段 1: 加载与解析
  const profile = loadProfile(input.profilePath);
  const allPacks = loadAllPacks(input.packsDir);

  // ===== 阶段 2: 领域轴匹配(applies_when)
  const domainPacks = matchDomainPacks(profile, allPacks);

  // ===== 阶段 3: 变更意图轴匹配(applies_when_change)
  const changeType = input.changeType ?? profile.defaultChangeType ?? "feature";
  const intentPack = matchIntentPack(changeType, allPacks);

  // ===== 阶段 4: 检查并集
  const activePacks = [...domainPacks, intentPack];

  // ===== 阶段 5: 合并各 pack provides
  const mergedArtifacts = mergeArtifacts(activePacks);
  const mergedActions = mergeActions(activePacks);
  const mergedChecks = mergeChecks(activePacks);

  // ===== 阶段 6: 组装 Gates
  const gates = assembleGates(activePacks, profile);

  // ===== 阶段 7: 组装 Tracks
  const tracks = assembleTracks(activePacks, profile, mergedArtifacts);

  // ===== 阶段 8: 选择 Pipeline 骨架
  const pipelineSkeleton = selectPipelineSkeleton(intentPack, activePacks);

  // ===== 阶段 9: 合并 Acceptance Layers
  const acceptanceLayers = mergeAcceptanceLayers(activePacks);

  // ===== 阶段 10: 生成追溯边推导
  const traces = deriveTraces(mergedArtifacts, gates, tracks);

  // ===== 阶段 11: 冲突检测与解决
  const { conflicts, resolutions } = detectAndResolveConflicts(mergedArtifacts, mergedChecks, gates, tracks);

  // ===== 阶段 12: 输出 graph.yaml
  return {
    graph: {
      version: "1",
      meta: {
        composedAt: new Date().toISOString(),
        profileHash: sha256(JSON.stringify(profile)),
        changeType: changeType,
        packsUsed: activePacks.map(p => ({ name: p.name, matched: p.matchedCondition }),
      },
      artifacts: mergedArtifacts,
      actions: mergedActions,
      checks: mergedChecks,
      gates: gates,
      tracks: tracks,
      pipelineSkeleton: pipelineSkeleton,
      acceptanceLayers: acceptanceLayers,
      traces: traces,
    },
    packsUsed: activePacks,
    warnings: [],
    errors: conflicts,
  };
}
```

---

## 2. 阶段 2 & 3: Pack 匹配算法

### 2.1 applies_when 求值器

```typescript
function evaluateAppliesWhen(
  appliesWhen: AppliesWhenCondition, profile: Profile): boolean {
  // 特殊值: always → 永远命中
  if (appliesWhen === "always") return true;

  // 对每个条件求值
  for (const [dimension of Object.entries(appliesWhen)) {
    if (key === "$or") {
      // 逻辑 OR:任一子条件为真即为真
      return value.some(subCondition => evaluateAppliesWhen(subCondition, profile));
    }

    if (key === "$and") {
      // 逻辑 AND:所有子条件为真即为真
      return value.every(subCondition => evaluateAppliesWhen(subCondition, profile));
    }

    const profileValue = profile.facts[key]?.value;

    // 值为数组:任一匹配即命中
    if (Array.isArray(value)) {
      if (!value.includes(profileValue)) return false;
      continue;
    }

    // 否定前缀 "!"
    if (value.startsWith("!")) {
      const forbiddenValue = value.slice(1);
      if (profileValue === forbiddenValue) return false;
      continue;
    }

    // $exists:维度存在即为真
    if (value === "$exists") {
      if (profileValue === undefined) return false;
      continue;
    }

    // 等值匹配
    if (profileValue !== value) return false;
  }

  return true;
}
```

### 2.2 领域 pack 选择

```typescript
function matchDomainPacks(profile: Profile, allPacks: Pack[]): Pack[] {
  const domainPacks = allPacks.filter(p => p.kind !== "change-intent");

  const matched: Pack[] = [];

  for (const pack of domainPacks) {
    if (evaluateAppliesWhen(pack.applies_when, profile)) {
      matched.push({
        ...pack,
        matchedCondition: pack.applies_when,
      });
    }
  }

  // 按 priority 降序排序(高 priority 先处理,低 priority 后处理
  return matched.sort((a, b) => b.priority - a.priority);
}
```

### 2.3 变更意图 pack 选择

```typescript
function matchIntentPack(changeType: string, allPacks: Pack[]): Pack {
  const intentPacks = allPacks.filter(p => p.kind === "change-intent");

  // 按 change.type 精确匹配
  const matched = intentPacks.find(p => {
    const applies = p.applies_when_change.type;
    return Array.isArray(applies) ? applies.includes(changeType) : applies === changeType;
  });

  if (matched) return { ...matched, matchedCondition: matched.applies_when_change };

  // fallback: feature.pack 是默认意图
  const defaultPack = intentPacks.find(p => p.name === "feature");
  if (!defaultPack) throw new Error("No default feature pack found");

  return { ...defaultPack, matchedCondition: "default fallback" };
}
```

---

## 3. 阶段 5: Artifacts 合并

```typescript
function mergeArtifacts(packs: Pack[]): Artifact[] {
  const artifactMap = new Map<string, Artifact>();

  for (const pack of packs) {
    for (const artifact of pack.provides?.artifacts ?? []) {
      const existing = artifactMap.get(artifact.id);

      if (!existing) {
        // 新 artifact:直接加入
        artifactMap.set(artifact.id, {
          ...artifact,
          providedBy: pack.name,
        });
        continue;
      }

      // 已存在同名 artifact:检查 schema 冲突
      if (existing.schema_ref !== artifact.schema_ref) {
        if (pack.priority > existing.priority) {
          // 高 priority 覆盖低 priority
          artifactMap.set(artifact.id, {
            ...artifact,
            providedBy: pack.name,
            overriddenFrom: existing.providedBy,
          });
        } else if (pack.priority === existing.priority) {
          // 同 priority:记录冲突
          artifactMap.set(artifact.id, {
            ...existing,
            conflict: true,
            conflictWith: pack.name,
          });
        }
        // 低 priority:忽略,保留已有
      }
    }
  }

  return Array.from(artifactMap.values());
}
```

---

## 4. 阶段 6: Gates 组装

```typescript
function assembleGates(packs: Pack[], profile: Profile): Gate[] {
  // 第一步:收集所有 pack 自带的 gate 骨架
  const gateMap = new Map<string, Gate>();

  // foundation 提供的门骨架先加入
  for (const pack of packs) {
    for (const gate of pack.provides?.gates ?? []) {
      gateMap.set(gate.id, {
        ...gate,
        providedBy: pack.name,
      });
    }
  }

  // 第二步:应用所有 pack 的 gate_patches 累加
  for (const pack of packs) {
    const patches = pack.provides?.gate_patches ?? {};
    for (const [gateId, patch] of Object.entries(patches)) {
      const gate = gateMap.get(gateId);
      if (!gate) {
        console.warn(`Gate patch for gate ${gateId} not found, from pack ${pack.name}`);
        continue;
      }

      // add_checks 累加
      if (patch.add_checks) {
        gate.require_checks = [...(gate.require_checks ?? []), ...patch.add_checks];
      }

      // add_artifacts 累加
      if (patch.add_artifacts) {
        gate.require_artifacts = [...(gate.require_artifacts ?? []), ...patch.add_artifacts];
      }

      // add_traces 累加
      if (patch.add_traces) {
        gate.require_traces = [...(gate.require_traces ?? []), ...patch.add_traces];
      }
    }
  }

  return Array.from(gateMap.values());
}
```

---

## 5. 阶段 7: Tracks 组装 + Contract 边连接

```typescript
function assembleTracks(packs: Pack[], profile: Profile, artifacts: Artifact[]): Track[] {
  const tracks: Track[] = [];

  // 第一步:收集所有 contributes_track
  for (const pack of packs) {
    if (pack.contributes_track) {
      tracks.push({
        ...pack.contributes_track,
        providedBy: pack.name,
      });
    }
  }

  // 第二步:连接 Contract 边 (producer ↔ consumers
  const contracts = artifacts.filter(a => a.id.startsWith("contract/"));

  for (const contract of contracts) {
    const producerTrack = tracks.find(t => t.id === contract.default_producer);
    if (producerTrack) {
      producerTrack.produces = [...(producerTrack.produces ?? []), contract.id];
    }

    for (const consumerId of contract.default_consumers ?? []) {
      const consumerTrack = tracks.find(t => t.id === consumerId);
      if (consumerTrack && consumerTrack.id !== producerTrack?.id) {
        consumerTrack.consumes = [...(consumerTrack.consumes ?? []), contract.id];
      }
    }
  }

  // 第三步:federated 跨 repo 绑定 (仅 topology=federated
  if (profile.facts.topology?.value === "federated") {
    for (const track of tracks) {
      if (track.federated_consume) {
      // 保留 federated_consume:契约来自外部 repo,按版本 mock 独立开发
      // 不自动连边,留待集成阶段验证
        track.binding_status = "mock";
        track.integration = "deferred";
      }
    }
  }

  return tracks;
}
```

---

## 6. 阶段 8: Pipeline 骨架选择

```typescript
function selectPipelineSkeleton(intentPack: Pack, domainPacks: Pack[]): Pipeline {
  // 变更意图包优先提供 pipeline_skeleton
  if (intentPack.provides?.pipeline_skeleton) {
    return intentPack.provides.pipeline_skeleton;
  }

  // fallback:foundation 提供默认
  const foundation = domainPacks.find(p => p.name === "foundation");
  if (foundation?.provides?.pipeline_skeleton) {
    return foundation.provides.pipeline_skeleton;
  }

  // 终极 fallback:通用骨架
  return {
    stages: ["implement", "review", "test", "accept"],
    max_retries: 5,
    on_exhausted: "escalate",
  };
}
```

---

## 7. 阶段 9: Acceptance Layers 合并

```typescript
function mergeAcceptanceLayers(packs: Pack[]): AcceptanceLayers {
  const layers: AcceptanceLayers = {
    unit: { required: false, checks: [] },
    integration: { required: false, checks: [] },
    system: { required: false, checks: [] },
    deployment: { required: false, checks: [] },
  };

  for (const pack of packs) {
    const packLayers = pack.provides?.acceptance_layers ?? {};

    for (const [layerName, layerDef] of Object.entries(packLayers)) {
      // required 取 OR:只要有一个 pack 要求 required=true
      layers[layerName].required ||= layerDef.required;

      // checks 取并集
      const existingChecks = new Set(layers[layerName].checks);
      for (const check of layerDef.checks ?? []) {
        existingChecks.add(check);
      }
      layers[layerName].checks = Array.from(existingChecks);
    }
  }

  return layers;
}
```

---

## 8. 阶段 10: 追溯边自动推导

```typescript
function deriveTraces(
  artifacts: Artifact[], gates: Gate[], tracks: Track[]): Trace[] {
  const traces: Trace[] = [];

  // 8.1 从 gates.require_traces 直接加入
  for (const gate of gates) {
    for (const traceDef of gate.require_traces ?? []) {
      traces.push({
        ...traceDef,
        requiredBy: gate.id,
      });
    }
  }

  // 8.2 Contract 消费边自动推导 (producer → contract → consumers
  const contracts = artifacts.filter(a => a.id.startsWith("contract/"));
  for (const contract of contracts) {
    //  const producerTrack = tracks.find(t => (t.produces ?? []).includes(contract.id);
    if (producerTrack) {
      traces.push({
        name: `${contract.id}_producer`,
        from_kind: producerTrack.id,
        to_kind: contract.id,
        via: ["produces"],
        cardinality: "single",
        autoDerived: true,
      });
    }

    for (const consumerTrack of tracks.filter(t => (t.consumes ?? []).includes(contract.id))) {
      traces.push({
        name: `${contract.id}_consumer_${consumerTrack.id}",
        from_kind: contract.id,
        to_kind: consumerTrack.id,
        via: ["consumes"],
        cardinality: "single",
        autoDerived: true,
      });
    }
  }

  // 8.3 Story → 测试绑定边 (ac-test-binding check 存在时)
  const hasAcBinding = checks.some(c => c.id === "ac-test-binding");
  if (hasAcBinding) {
    traces.push({
      name: "story_to_test",
      from_kind: "plan/story",
      to_kind: "verification/test-report",
      via: ["verifies"],
      cardinality: "every",
      autoDerived: true,
    });
  }

  return traces;
}
```

---

## 9. 阶段 11: 冲突检测与解决

```typescript
function detectAndResolveConflicts(
  artifacts: Artifact[],
  checks: Check[],
  gates: Gate[],
  tracks: Track[],
): { conflicts: string[]; resolutions: string[] } {
  const conflicts: string[] = [];
  const resolutions: string[] = [];

  // 9.1 Artifact schema 冲突
  for (const artifact of artifacts.filter(a => a.conflict)) {
    conflicts.push(
    `Artifact ${artifact.id} provided by both ${artifact.providedBy} and ${artifact.conflictWith}; same priority.`
    );
    resolutions.push(
      `User must explicitly choose one in profile.overrides, or increase one pack's priority.`
    );
  }

  // 9.2 多个 track scope 冲突 (同一 scope 有多个 tracks
  const scopeCounts = new Map<string, number>();
  for (const track of tracks) {
    const count = scopeCounts.get(track.scope) ?? 0;
    scopeCounts.set(track.scope, count + 1);
    if (count > 0) {
      conflicts.push(`Multiple tracks share scope '${track.scope}' (track.scope}'; scope must be unique per track.`);
    }
  }

  // 9.3 Gate 引用不存在 artifact
  for (const gate of gates) {
    for (const artifactId of gate.require_artifacts ?? []) {
      if (!artifacts.some(a => a.id === artifactId)) {
        conflicts.push(`Gate ${gate.id} requires artifact '${artifactId}' but no pack provides it.`);
      }
    }
  }

  // 9.4 Gate 引用不存在 check
  for (const gate of gates) {
    for (const checkId of gate.require_checks ?? []) {
      if (!checks.some(c => c.id === checkId)) {
        conflicts.push(`Gate ${gate.id} requires check '${checkId}' but no pack provides it.`);
      }
    }
  }

  return { conflicts, resolutions };
}
```

---

## 10. compose 输出 graph.yaml 示例验证清单

输出的最终输出结构:

| 字段 | 来源 |
|------|------|
| `meta.composedAt` | 当前时间 |
| `meta.profileHash` | profile.yaml sha256 |
| `meta.changeType` | 变更类型 |
| `meta.packsUsed` | 命中的 packs 列表 + 各自命中条件 |
| `artifacts[]` | 所有 active packs provides.artifacts 合并去重 |
| `actions[]` | 所有 active packs provides.actions 合并去重 |
| `checks[]` | 所有 active packs provides.checks 合并去重 |
| `gates[]` | foundation gates + gate_patches 累加 |
| `tracks[]` | contributes_track 收集 + contract 边连接 |
| `pipelineSkeleton` | intent pack provides.pipeline_skeleton |
| `acceptanceLayers` | 各 pack acceptance_layers checks 按层并集 |
| `traces[]` | gates.require_traces + contract 边自动推导 |

---

## 11. 特殊情况处理

### 11.1 无 UI 项目 (has_ui=none)
- frontend.pack 不命中
- tracks 无 fe track
- 无 lighthouse/a11y/e2e-browser checks
- 无 system/deployment 层 UI 相关验收

### 11.2 无持久化项目 (persistence 不存在)
- data-design.pack 不命中
- 无 contract/db-schema artifact
- 无 schema-drift check
- backend track 不 consumes db-schema

### 11.3 原型项目 (criticality=prototype)
- architecture.pack 不命中
- 无 C4/ADR/readiness artifacts
- entry-phase4 gate 不追加 architecture 相关 artifacts

### 11.4 bugfix 变更流
- 不执行 propose/specify/design/plan 阶段
- diagnose 阶段前置
- scope_policy 限定写范围
- bugfix-entry/bugfix-exit 门生效
