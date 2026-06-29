# spec-graph 系统架构概览

## 核心原则

**spec-graph 是状态追踪和调度引擎，不存储文档内容。**

- ✅ spec-graph 负责：状态机、dispatch 决策、质量检查、链接追踪
- ❌ spec-graph 不负责：文档生成、内容存储、文件管理
- ✅ AI Agent 负责：读取指导、生成内容、写入文件、执行命令

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      spec-graph                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ State Machine│  │   Dispatch   │  │    Gates     │      │
│  │  (machine-   │  │   Engine     │  │  (validate)  │      │
│  │   state.yaml)│  │  (next.ts)   │  │  (enforce)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Artifacts   │  │    Checks    │  │   Traces     │      │
│  │   (status)   │  │   (status)   │  │  (metadata)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Analysis   │  │  Checklists  │  │ Constitution │      │
│  │  (metadata)  │  │  (validation)│  │   (rules)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    Dispatch Manifest
                    (template_ref, doc_path, guidance)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (Claude)                       │
│                                                             │
│  1. 读取 manifest                                           │
│  2. 读取模板 (packs/foundation.pack/templates/*.md)         │
│  3. 生成文档内容                                             │
│  4. 写入项目文件系统 (docs/**/*.md)                         │
│  5. 运行质量检查 (spec-graph checklist)                     │
│  6. 追踪链接 (spec-graph analysis)                          │
│  7. 标记完成 (spec-graph artifact complete)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Project Filesystem                         │
│                                                             │
│  docs/                                                      │
│  ├── requirements/PRD-001.md  ← AI Agent 生成              │
│  ├── design/ARCH-001.md       ← AI Agent 生成              │
│  ├── stories/S-001.md         ← AI Agent 生成              │
│  └── analysis/propose.md      ← AI Agent 生成              │
│                                                             │
│  .spec-graph/                                               │
│  ├── graph.yaml               ← spec-graph 管理            │
│  ├── machine-state.yaml       ← spec-graph 管理            │
│  ├── analysis/propose.yaml    ← spec-graph 管理(元数据)    │
│  └── checklists/*.md          ← spec-graph 生成            │
└─────────────────────────────────────────────────────────────┘
```

## 核心命令速查

### 工作流控制

```bash
# 初始化项目
spec-graph init

# 生成工作流图
spec-graph compose

# 获取下一步动作
spec-graph dispatch --json

# 查看状态
spec-graph status
spec-graph next
```

### Artifact 管理

```bash
# 列出所有 artifact
spec-graph artifact list

# 查看 artifact 详情
spec-graph artifact show <artifact-id>

# 标记 artifact 完成
spec-graph artifact complete <artifact-id>

# 设置 artifact 状态
spec-graph artifact ready <artifact-id>
spec-graph artifact block <artifact-id>
```

### 文档系统

```bash
# 生成文档质量检查清单
spec-graph checklist <artifact-id>

# 记录阶段分析
spec-graph analysis --phase <phase> \
  --content "分析内容" \
  --tasks "T-001,T-002" \
  --artifacts "artifact-id" \
  --docs "docs/path/to/doc.md" \
  --templates "prd"

# 查看分析记录
spec-graph analysis --phase <phase>
```

### 变更管理

```bash
# 创建变更
spec-graph change create --title "功能名称" --type feature

# 应用变更
spec-graph change apply <change-id>

# 完成变更
spec-graph change complete <change-id>

# 归档变更
spec-graph change archive <change-id>
```

### 质量管理

```bash
# Constitution 管理
spec-graph constitution show
spec-graph constitution bump --type minor
spec-graph constitution diff

# 验证项目健康
spec-graph doctor
```

## 数据流

```
用户输入
  ↓
spec-graph compose (生成 graph.yaml)
  ↓
spec-graph dispatch (返回 manifest)
  ↓
AI Agent 读取 manifest
  ↓
AI Agent 读取模板 + guidance
  ↓
AI Agent 生成文档 → 写入 .spec-graph/artifacts/<type>/*.md
  ↓
AI Agent 运行 spec-graph checklist (质量检查)
  ↓
AI Agent 运行 spec-graph analysis (追踪链接)
  ↓
AI Agent 运行 spec-graph artifact complete (标记完成)
  ↓
spec-graph 更新 machine-state.yaml
  ↓
spec-graph dispatch (返回下一个动作)
  ↓
...循环直到工作流完成
```

## 关键文件

### spec-graph 管理

- `.spec-graph/graph.yaml` - 工作流定义(artifact、check、gate)
- `.spec-graph/machine-state.yaml` - 状态机(artifact 状态、check 状态)
- `.spec-graph/analysis/*.yaml` - 阶段分析元数据
- `.spec-graph/checklists/*.md` - 文档质量检查清单

### AI Agent 管理

- `.spec-graph/artifacts/prd/*.md` - 产品需求文档
- `.spec-graph/artifacts/architecture/*.md` - 架构设计文档
- `.spec-graph/artifacts/story/*.md` - 用户故事
- `.spec-graph/artifacts/epics/*.md` - Epic 文档
- `.spec-graph/artifacts/task/*.md` - 实施任务
- `.spec-graph/artifacts/adr/*.md` - 架构决策记录
- `packs/foundation.pack/templates/*.md` - 文档模板(参考框架)

### 配置文件

- `.spec-graph/constitution.yaml` - 质量标准和规则
- `.spec-graph/permissions.yaml` - 权限配置
- `CLAUDE.md` - AI Agent 行为指南

## 扩展点

### 添加新模板

1. 在 `packs/foundation.pack/templates/` 创建新模板文件
2. 使用 frontmatter 定义元数据变量(`{{variable}}`)
3. 模板名称会自动映射到 artifact kind

### 添加新 artifact 类型

1. 在 `packs/foundation.pack/pack.yaml` 声明 artifact
2. 创建对应的检查(check)
3. 更新 gate 定义

### 自定义质量规则

1. 编辑 `.spec-graph/constitution.yaml`
2. 添加新的 article 或 threshold
3. 运行 `spec-graph constitution validate` 验证

## 设计哲学

### 为什么 spec-graph 不存储文档内容？

1. **关注点分离**: spec-graph 专注状态追踪和流程控制，不处理内容生成
2. **灵活性**: AI Agent 可以自由调整文档结构和内容
3. **可追溯性**: 通过显式链接追踪文档关系，而不是隐式存储
4. **Git 友好**: 文档是普通 markdown 文件，可以正常版本控制
5. **工具中立**: 不依赖特定 AI 工具或格式

### 为什么需要模板？

1. **一致性**: 提供统一的文档结构框架
2. **指导性**: 告诉 AI Agent 应该包含哪些内容
3. **可维护性**: 模板可以迭代改进
4. **可复用性**: 多个项目可以共享同一套模板

### 为什么需要 analysis 命令？

1. **决策记录**: 持久化每个阶段的关键分析和决策
2. **可追溯性**: 链接分析 → 任务 → 文档 → 模板
3. **知识积累**: 团队可以回顾历史决策
4. **上下文传递**: 新成员可以快速了解项目背景

## 下一步

- 阅读 `docs/agent-document-workflow.md` 了解实战示例
- 阅读 `packs/foundation.pack/agents/coordinator-protocol.md` 了解 coordinator 协议
- 阅读 `CLAUDE.md` 了解 AI Agent 行为指南
