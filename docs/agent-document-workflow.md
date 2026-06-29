# AI Agent 文档生成实战示例

## 场景:从 dispatch 到完整文档

假设 `spec-graph dispatch --json` 返回:

```json
{
  "current_stage": "propose",
  "next_stage": "specify",
  "actions": [
    {
      "type": "produce_artifact",
      "id": "requirement/prd/PRD-001",
      "requires_sub_agent": true,
      "template_ref": "prd",
      "suggested_doc_path": ".spec-graph/artifacts/prd/PRD-001.md",
      "document_guidance": "Product Requirements Document: problem statement, user stories, acceptance criteria...",
      "next_step": "spec-graph artifact complete requirement/prd/PRD-001"
    }
  ]
}
```

## AI Agent 执行步骤

### 步骤 1: 读取模板

```bash
cat packs/foundation.pack/templates/prd.md
```

模板内容:

```markdown
---
id: {{id}}
kind: {{kind}}
status: pending
created_at: {{created_at}}
author: {{author}}
---

# PRD: {{title}}

## Problem Statement
...

## User Stories
...

## Acceptance Criteria
...
```

### 步骤 2: 生成文档内容

AI Agent 根据 `document_guidance` 和上下文生成完整文档:

```markdown
---
id: requirement/prd/PRD-001
kind: requirement/prd
status: completed
created_at: 2026-06-27T14:00:00Z
author: AI Agent
---

# PRD: User Authentication System

## Problem Statement
Users need a secure way to authenticate and manage their accounts. Current system lacks modern authentication features.

## User Stories

### US-1: Email/Password Registration
**As a** new user,
**I want** to register with email and password,
**So that** I can create an account and access the system.

**Acceptance Criteria:**
- Given I'm on the registration page, when I enter valid email and password (8+ chars), then account is created
- Given I enter an existing email, when I submit, then I see "Email already registered" error
- Given I enter a weak password, when I submit, then I see password requirements

### US-2: Login
**As a** registered user,
**I want** to login with email and password,
**So that** I can access my account.

**Acceptance Criteria:**
- Given valid credentials, when I submit, then I'm redirected to dashboard
- Given invalid credentials, when I submit, then I see "Invalid email or password"

## Non-Functional Requirements
- Passwords must be hashed with bcrypt (cost factor 12)
- Session tokens expire after 24 hours
- Rate limiting: 5 failed attempts per IP per 15 minutes
```

### 步骤 3: 写入文件

使用 Write 工具将文档写入:

```
.spec-graph/artifacts/prd/PRD-001.md
```

### 步骤 4: 运行质量检查

```bash
spec-graph checklist requirement/prd/PRD-001
```

输出:

```
Mechanical Checks:
  ✓ Story references at least one requirement
  ✓ Scope is atomic
  ✓ Has at least 2 acceptance criteria
  ✓ All referenced requirements are resolved
  ✓ No file paths outside project scope

Soft Checks (review manually):
  ○ No ambiguous adjectives
  ○ Each AC is verifiable by test
  ○ Edge cases considered
  ○ Dependencies declared
  ○ Out-of-scope items listed
```

### 步骤 5: 追踪链接

```bash
spec-graph analysis --phase propose \
  --tasks "T-001" \
  --artifacts "requirement/prd/PRD-001" \
  --docs ".spec-graph/artifacts/prd/PRD-001.md" \
  --templates "prd" \
  --content "## 关键决策\n- 选择 email/password 认证而非 OAuth\n- 使用 bcrypt 作为密码哈希算法\n\n## 范围定义\n- 包含:注册、登录、密码重置\n- 不包含:社交登录、MFA"
```

### 步骤 6: 标记 artifact 完成

```bash
spec-graph artifact complete requirement/prd/PRD-001
```

### 步骤 7: 重新 dispatch

```bash
spec-graph dispatch --json
```

现在 manifest 会返回下一个动作(如 `perform_stage specify` 或 `transition propose→specify`)。

## 完整流程总结

```
dispatch → 读 manifest → 读模板 → 生成文档 → 写入文件 → checklist → analysis → artifact complete → dispatch
```

每个环节都有明确的数据流和职责:
- **spec-graph**: 状态追踪、dispatch 决策、质量检查、链接记录
- **AI Agent**: 读取指导、生成内容、写入文件、执行命令
- **模板**: 提供结构框架,不包含具体内容
- **文档**: AI Agent 生成的完整内容,持久化在 `.spec-graph/artifacts/<type>/` 目录

## 关键原则

1. **spec-graph 不存储文档内容** - 只追踪元数据和链接
2. **AI Agent 负责生成和写入** - 根据 manifest 指导生成文档
3. **文档存储在 .spec-graph/artifacts/** - 按类型组织(prd/, architecture/, story/ 等)
4. **模板是框架,不是约束** - AI Agent 可以调整结构
5. **链接必须显式声明** - 使用 `spec-graph analysis` 记录所有链接
6. **质量检查在标记完成前** - 使用 `spec-graph checklist` 验证
