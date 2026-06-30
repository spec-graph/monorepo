---
name: spec-graph-distill
description: "Compress an artifact document into a minimal summary for context injection. Preserves headings, bullets, code blocks, and key sentences (must/shall/required/critical/warning/decision). Reduces token usage when injecting large artifacts into dispatch manifests."
---

# spec-graph distill

文档压缩工具 — 把大 artifact 压成最小摘要,减少 dispatch 注入的 token。

## Architecture Principle

**spec-graph distill 是文本压缩器 — 不解读语义,只按规则保留。**

- ❌ distill 不会判断「这段话重要不重要」(只按关键词和结构)
- ❌ distill 不会改写原文(原文件不动)
- ❌ distill 不会自动注入到 manifest(只生成摘要,注入由 pack / agent 决定)
- ✅ distill 按「结构 + 关键词」规则保留信息
- ✅ distill 报告压缩比(original → compressed chars)

**Agent 职责**:大文档注入前先 distill → 节省 token → 把 distilled 路径塞进 prompt。

## What this does

读 `.spec-graph/artifacts/<kind>/<file>.md`,按规则提取:

### 保留规则

| 类型 | 保留条件 |
|------|---------|
| **Headings** | `##` / `###` 等标题行全保留 |
| **Bullets / numbered lists** | `-` / `*` / `1.` 开头的行全保留 |
| **Code blocks** | ` ``` ` 包围的代码块全保留 |
| **Key sentences** | 含 `must` / `shall` / `required` / `critical` / `important` / `warning` / `caution` / `decision` / `conclusion` 的句子 |
| **Max length 截断** | 超 `--max-length` 时截断(默认 2000) |

### 删除规则

- 普通段落文字(无关键词)
- 空行(连续空行压成一个)
- 装饰性内容(hr、emoji-only 行)

### 输出

- terminal:打印 source / 压缩比 / 摘要内容
- `--save`:写到 `.spec-graph/distilled/<artifact-id>.md`
- `--json`:含 `original_length` / `compressed_length` / `compression_ratio` / `output` / `source`

## Usage

```bash
# 蒸馏并打印到 terminal
spec-graph distill --artifact plan/tasks

# 蒸馏并保存(供 dispatch / prompt 注入)
spec-graph distill --artifact plan/tasks --save

# 限制最大长度
spec-graph distill --artifact plan/tasks --max-length 500

# JSON 输出(含压缩统计)
spec-graph distill --artifact plan/tasks --json
```

### Options

| Option | Description |
|--------|-------------|
| `--artifact <id>` | 要蒸馏的 artifact ID(必填) |
| `--save` | 写到 `.spec-graph/distilled/<artifact-id>.md` |
| `--max-length <chars>` | 最大输出长度(默认 2000,必须 >0) |
| `--json` | JSON 输出(含压缩比) |

## Execution Rules

### ✅ 应该用 distill 的场景

| 场景 | 推荐操作 |
|------|---------|
| 大 artifact(>2k chars)要塞进 sub-agent prompt | 先 `--save` 再注入 distilled 路径 |
| 多 artifact 上下文累加超 token 预算 | 逐个 distill |
| 只想要关键决策 / must / NFR | distill 自动保留这些 |
| 审计 artifact 是否含关键约束 | `--json` 看压缩比,过低说明缺 must/decision |
| 给 PR 描述生成一句话摘要 | distill + `--max-length 200` |

### ❌ 不应该用 distill 的场景

| 场景 | 替代做法 |
|------|---------|
| 短文档(<500 chars) | 直接注入原文 |
| 需要完整上下文(法律 / 合规) | 不蒸馏,直接用原文 |
| 需要语义理解(不是关键词) | 用 LLM 总结,不用机械蒸馏 |
| 给最终读者看的文档 | 蒸馏版只适合机器消费 |

## Agent Workflow

```
1. dispatch manifest 引用某大 artifact(例:plan/tasks)
   ↓
2. agent 判断:文档很大?token 紧张?
   - 是 → 蒸馏
   - 否 → 直接用原文
   ↓
3. spec-graph distill --artifact plan/tasks --save
   ↓ (生成 .spec-graph/distilled/plan-tasks.md)
4. agent 读 distilled 文件,塞进 sub-agent prompt
   (或 pack context.md 引用 distilled 路径)
   ↓
5. sub-agent 完成任务,产出新 artifact
   ↓
6. 原 artifact 文件不动(distill 只生成新摘要)
```

### 关键纪律

- **原文件不动** — distill 只生成摘要,不修改 `.spec-graph/artifacts/`
- **关键词依赖** — 必须用 must/shall/required 等英文关键词;中文文档效果会打折(可用「必须」「关键」等中文,但规则以英文为主)
- **保存路径** — `--save` 写到 `.spec-graph/distilled/<id>.md`,id 中的 `/` 会变 `-`

## Usage Scenarios

### Scenario 1: 大 PRD 压缩后注入

```bash
# PRD 8432 chars
spec-graph distill --artifact requirement/prd --save
# Source: .spec-graph/artifacts/requirement/prd.md
# Original: 8432 chars → Compressed: 1247 chars (85% reduction)
# 写到: .spec-graph/distilled/requirement-prd.md

# agent prompt 里用 distilled 路径
# "Read .spec-graph/distilled/requirement-prd.md for context"
```

### Scenario 2: 限制摘要长度

```bash
spec-graph distill --artifact design/arch --max-length 500 --save
# 截到 500 chars,适合一句话塞进 commit / PR
```

### Scenario 3: 程序化检查压缩比

```bash
ratio=$(spec-graph distill --artifact plan/tasks --json | jq '.compression_ratio')
if [ "$ratio" -lt 30 ]; then
  echo "Warning: low compression — artifact may lack key sentences"
fi
```

### Scenario 4: 多 artifact 批量蒸馏

```bash
for art in requirement/prd design/arch plan/tasks; do
  spec-graph distill --artifact "$art" --save
done
# 全部生成 distilled 版本,供后续 dispatch 使用
```

### Scenario 5: 失败 — artifact 不存在

```bash
$ spec-graph distill --artifact plan/nonexistent
Error: Artifact file not found: .spec-graph/artifacts/plan/plan-nonexistent.md
# 修复:先 spec-graph artifact list 查实际 id
```

### Scenario 6: 失败 — max-length 无效

```bash
$ spec-graph distill --artifact plan/tasks --max-length abc
# 源码:parseInt 失败时静默忽略,用默认 2000
# 修复:传数字
spec-graph distill --artifact plan/tasks --max-length 500
```

### Scenario 7: 中文文档蒸馏效果差

```bash
# 原文用「需要」「重要」而非 must/critical
$ spec-graph distill --artifact requirement/cn-prd
# Original: 5000 → Compressed: 4500 (10% reduction)
# 压缩比低 → 几乎没删
# 修复(可选):
# 1. 改原文用英文关键词(must / required)
# 2. 或加中文关键词到 distillator 规则(改 src/engine/distillator)
```

## Error Handling

| 错误 | 原因 | 修复 |
|------|------|------|
| `Artifact file not found` | id 错或文件不存在 | `spec-graph artifact list` 查 id |
| `--max-length abc` 静默用默认 | parseInt 失败 | 传数字 |
| 压缩比极低 | 关键词少 / 中文为主 | 加英文关键词或改 distillator 规则 |
| `--save` 写入失败 | 父目录不存在 | 自动 mkdir,检查权限 |

## 衔接关系

- **前置**: artifact 必须已存在(`.spec-graph/artifacts/<kind>/<file>.md`)
- **产物**: `.spec-graph/distilled/<id>.md`(只 `--save` 时生成)
- **被消费方**: agent prompt / pack context.md / dispatch manifest(由 agent 或 pack 引用)
- **与 artifact 协同**: artifact 命令管生命周期,distill 管文本压缩
- **原文件不变**: distill 是只读 + 新写的单向操作
- **典型链路**: produce_artifact → artifact complete → distill --save → 后续 dispatch 注入 distilled 路径
