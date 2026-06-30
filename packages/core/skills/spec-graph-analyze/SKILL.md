---
name: spec-graph-analyze
description: "Cross-artifact consistency analysis. Scans all artifacts in .spec-graph/artifacts/ to detect 5 issue types: duplication, coverage gaps, terminology drift, vague language, AC gaps. Plus per-artifact rule violations from config.yaml. Categorizes findings by severity (critical/high/medium/low). spec-graph is a neutral scanner — does NOT fix issues or decide priorities, only flags them. Use to catch quality issues across the whole artifact set, before merges or releases."
---

# spec-graph analyze

跨 artifact 一致性分析(扫描所有 artifact 检测问题)。

## Architecture Principle

**spec-graph 不修问题 — 只扫描并报告。**

- ❌ spec-graph 不会替你消除重复内容
- ❌ spec-graph 不会替你补缺失的 design/story
- ❌ spec-graph 不会替你统一术语
- ❌ spec-graph 不会替你消除模糊形容词
- ❌ spec-graph 不会替你补 AC 对应的 task
- ✅ spec-graph 扫描 `.spec-graph/artifacts/` 下所有文档
- ✅ spec-graph 跑 5 类检测 + config.yaml 中的自定义规则
- ✅ spec-graph 按 severity (critical / high / medium / low) 排序
- ✅ spec-graph 报告每个 finding 涉及的 artifacts 列表

**Agent 的职责**:跑 analyze → 读 findings → 按优先级修(critical 先)→ 重跑 analyze 直到无 critical/high。

## What this does

扫描所有 artifact 文档,跑 6 类检测:

### 1. Duplication(重复内容)

**检测**:同一内容在多个 artifact 中重复出现。

**示例 finding**:
```
[high] duplication: Requirement "user-login" appears in 3 artifacts
  Artifacts: requirement/prd/auth, design/c4/auth, plan/story/login
```

### 2. Coverage Gaps(覆盖缺失)

**检测**:requirement 没有 design / story / task 对应。

**示例 finding**:
```
[critical] coverage_gap: Requirement "payment-refund" has no design artifact
  Artifacts: requirement/prd/payment
  Detail: Add a design artifact that derives from this requirement
```

### 3. Terminology Drift(术语漂移)

**检测**:同一概念在不同文档中用了不同名字。

**示例 finding**:
```
[medium] terminology_drift: "User Account" vs "User Profile" vs "Account"
  Artifacts: requirement/prd/auth, design/c4/auth, plan/story/profile
  Detail: Pick one canonical term and update all artifacts
```

### 4. Vague Language(模糊语言)

**检测**:跨所有 artifact 检测模糊形容词(与 checklist 的单文档检测不同,这是全局扫描)。

**示例 finding**:
```
[medium] vague_language: "fast" used in 2 artifacts without measurable target
  Artifacts: requirement/prd/api, plan/story/optimization
```

### 5. AC Gaps(AC 缺对应 task)

**检测**:story 的 AC 没有对应的 task 实现。

**示例 finding**:
```
[high] ac_gap: AC-3 in plan/story/login has no corresponding task
  Artifacts: plan/story/login
  Detail: Create a task that implements this AC
```

### 6. Rule Violations(自定义规则)

**检测**:违反 `config.yaml` 中 `artifact_rules` 声明的规则(每个 artifact kind 可声明自己的规则)。

**示例 config.yaml**:
```yaml
artifact_rules:
  - kind: requirement/prd
    min_length: 500
    required_sections: [Background, Stakeholders, AC]
  - kind: design/c4
    required_sections: [Context, Containers, Components]
```

**示例 finding**:
```
[high] rule_violation: requirement/prd/auth missing section "Stakeholders"
  Artifacts: requirement/prd/auth
```

## Severity 含义

| Severity | 含义 | 典型问题 |
|----------|------|---------|
| `critical` | 必须修(阻塞发布) | coverage gap、rule violation 关键字段缺失 |
| `high` | 应该修(影响质量) | duplication、AC gap |
| `medium` | 建议修 | terminology drift、vague language |
| `low` | 可选修 | 小问题、提示性 |

## Usage

```bash
# 跑全量分析
spec-graph analyze

# JSON 输出(供脚本消费)
spec-graph analyze --json
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | 输出 JSON:`{findings, stats}` |

## Output 解读

```
Analyzing artifacts for consistency issues...

📊 Analysis Results

Critical (2):
  ❌ [coverage_gap] Requirement "payment-refund" has no design artifact
     Artifacts: requirement/prd/payment
     Detail: Add a design artifact that derives from this requirement

  ❌ [rule_violation] requirement/prd/auth missing section "Stakeholders"
     Artifacts: requirement/prd/auth

High (3):
  ⚠ [duplication] Requirement "user-login" appears in 3 artifacts
     Artifacts: requirement/prd/auth, design/c4/auth, plan/story/login

  ⚠ [ac_gap] AC-3 in plan/story/login has no corresponding task
     Artifacts: plan/story/login

Medium (5):
  ...

Low (1):
  ...

Stats: 12 artifacts analyzed, 2 critical, 3 high, 5 medium, 1 low

❌ 2 critical issue(s) must be fixed
```

## analyze vs checklist 的区别

| 维度 | `spec-graph analyze` | `spec-graph checklist <story>` |
|------|---------------------|-------------------------------|
| 范围 | 所有 artifacts | 单个 story |
| 模糊词检测 | 跨文档扫描 | 单文档扫描 |
| 时机 | 整体审计 | story 实现前 |
| 输出 | findings 列表 | checklist .md 文件 |
| 关注点 | 跨文档一致性 | 单 story 质量 |

## 何时使用 — 判断标准

### ✅ 应该使用 analyze

| 场景 | 时机 |
|------|------|
| 发布前审计 | release 前跑一次,确认无 critical |
| merge 大 change 前 | 验证没引入跨文档不一致 |
| 定期质量审计 | 每周/每 sprint 跑一次 |
| 怀疑文档漂移 | 多人协作后术语/重复变多 |
| change complete 前 | 作为质量门槛(可选) |
| CI 集成 | 作为 PR check(critical 阻止合并) |
| sub-agent 写完一批文档后 | 验证整体一致性 |

### ❌ 不应该使用 analyze

| 场景 | 替代做法 |
|------|---------|
| 单 story 质量检查 | `spec-graph checklist <story>` |
| 跑测试 | `spec-graph check` |
| 评估 gate | `spec-graph gate` |
| 项目健康诊断 | `spec-graph doctor` |
| 查进度 | `spec-graph status` |
| 查 trace 链接 | `spec-graph trace` |

## Agent Workflow

```
1. spec-graph analyze
   ↓
2. 读输出,识别 critical / high findings
   ↓
3. 对每个 critical:
   ├── coverage_gap → 让 sub-agent 创建缺失的 design/story artifact
   ├── rule_violation → 让 sub-agent 修文档补 section
   └── ...
   ↓
4. 对每个 high:
   ├── duplication → 决定保留哪个,删除其他(或合并)
   ├── ac_gap → 让 sub-agent 创建对应 task
   └── ...
   ↓
5. 对 medium / low(可选):
   ├── terminology_drift → 选定 canonical 术语,全局替换
   └── vague_language → 替换为可测量标准
   ↓
6. 修复后重跑 spec-graph analyze
   ↓
7. 重复 3-6 直到 stats.critical === 0
   ↓
8. 继续工作流(change complete / merge)
```

## 与 Agent 的协作关系

- **主 agent**:跑 analyze,按 severity 排序,分派修复
- **sub-agent (writer)**:接收 "fix finding X" 任务,改文档或创建缺失 artifact
- **sub-agent (reviewer)**:可选 — review terminology 选 canonical 术语
- **coordinator**:在 change complete / merge 前可强制要求 analyze 无 critical
- **CI**:可作为 PR check(critical 阻止合并)

## 自定义规则(config.yaml)

在 `.spec-graph/config.yaml` 中声明 `artifact_rules`,analyze 会自动检测:

```yaml
artifact_rules:
  - kind: requirement/prd
    min_length: 500                          # 最少 500 字符
    required_sections: [Background, Stakeholders, AC]
    forbidden_terms: ["TBD", "TODO"]         # 禁止出现

  - kind: design/c4
    required_sections: [Context, Containers, Components]

  - kind: plan/story
    min_ac_count: 2                          # 至少 2 个 AC
    required_sections: [AC, References]
```

规则类型:
- `min_length` — 最少字符数
- `required_sections` — 必须有的 section
- `forbidden_terms` — 禁止出现的词
- `min_ac_count` — AC 最少数量(story 专用)

## Usage Scenarios

### Scenario 1: 发布前审计(成功)

```bash
$ spec-graph analyze
Analyzing artifacts for consistency issues...

📊 Analysis Results

Stats: 15 artifacts analyzed, 0 critical, 0 high, 2 medium, 1 low

Medium (2):
  ⚠ [terminology_drift] "User Account" vs "Account"
  ⚠ [vague_language] "fast" in plan/story/api

Low (1):
  ...

✓ No critical issues found

# 可以发布
```

### Scenario 2: 失败 — critical coverage gap

```bash
$ spec-graph analyze
Critical (1):
  ❌ [coverage_gap] Requirement "payment-refund" has no design artifact
     Artifacts: requirement/prd/payment

❌ 1 critical issue(s) must be fixed
```

**修复**:
```bash
# 让 sub-agent 创建 design artifact
spec-graph dispatch --json
# dispatch manifest 会指示创建 design/c4/payment
# sub-agent 写完后:
spec-graph artifact complete design/c4/payment

# 重跑
spec-graph analyze
# 0 critical
```

### Scenario 3: 失败 — duplication

```bash
$ spec-graph analyze
High (1):
  ⚠ [duplication] "User login flow" content duplicated in:
     Artifacts: requirement/prd/auth, design/c4/auth
```

**修复**:
- 决定哪个是 source of truth(通常是 requirement)
- 在 design 中引用 requirement,而不是复制内容
- 让 sub-agent 改 design/c4/auth.md,删除重复段落,改为 "See requirement/prd/auth#login-flow"

### Scenario 4: 失败 — terminology drift

```bash
$ spec-graph analyze
Medium (1):
  ⚠ [terminology_drift] Same concept named differently:
     "User Account" (in requirement/prd/auth)
     "User Profile" (in design/c4/auth)
     "Account" (in plan/story/profile)
```

**修复**:
- 主 agent 决定 canonical 术语(如统一用 "User Account")
- 分派 sub-agent 全局替换

### Scenario 5: 失败 — rule violation

```bash
$ spec-graph analyze
High (2):
  ⚠ [rule_violation] requirement/prd/auth missing section "Stakeholders"
  ⚠ [rule_violation] design/c4/payment length 200 < min_length 500
```

**修复**:
- 让 sub-agent 补 section / 扩展内容

### Scenario 6: 失败 — AC gap

```bash
$ spec-graph analyze
High (1):
  ⚠ [ac_gap] AC-3 in plan/story/login has no corresponding task
     Artifacts: plan/story/login
```

**修复**:
- 让 sub-agent 在 plan/tasks/login.md 中加实现 AC-3 的 task

### Scenario 7: JSON 输出(供 CI 消费)

```bash
$ spec-graph analyze --json
{
  "findings": [
    {
      "severity": "critical",
      "category": "coverage_gap",
      "message": "Requirement \"payment-refund\" has no design artifact",
      "artifacts": ["requirement/prd/payment"],
      "detail": "Add a design artifact..."
    }
  ],
  "stats": {
    "artifacts_analyzed": 12,
    "critical": 1,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
```

CI 脚本:
```bash
RESULT=$(spec-graph analyze --json)
CRITICAL=$(echo "$RESULT" | jq '.stats.critical')
if [ "$CRITICAL" -gt 0 ]; then
  echo "Blocking merge: $CRITICAL critical issues"
  exit 1
fi
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Graph not found. Run spec-graph compose first.` | 没有 graph.yaml | 先 `spec-graph compose` |
| `artifacts_analyzed: 0` | `.spec-graph/artifacts/` 为空 | 先跑工作流生成 artifact |
| findings 全是 low | 文档质量已经不错 | 可选修,或调整 config.yaml 加严规则 |
| 自定义规则不生效 | config.yaml 中 artifact_rules 格式错 | 检查 YAML 格式,kind 字段匹配 graph 中声明的 artifact kind |
| 检测不到模糊词 | 文档内容在代码块中 | analyze 跳过代码块,确保模糊词在正文 |

## 衔接关系

- **前置**:
  - `spec-graph compose`(必须有 graph.yaml)
  - 至少有一些 artifact 已生成(否则 `artifacts_analyzed: 0`)
- **数据来源**:
  - `.spec-graph/artifacts/**/*.md`(所有 artifact 文档内容)
  - `.spec-graph/graph.yaml`(artifact 类型定义)
  - `.spec-graph/config.yaml`(可选,自定义规则)
- **输出**:终端报告(或 JSON)
- **被引用**:
  - CI/CD 质量门禁
  - release 前审计
  - code review 参考
- **配合**:
  - `spec-graph checklist`(单 story 质量检查)
  - `spec-graph gate`(transition 门槛)
  - `spec-graph doctor`(项目健康)
  - `spec-graph trace`(查 trace 链接,用于排查 coverage gap)
