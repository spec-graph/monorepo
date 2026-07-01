---
name: spec-graph-context-sharing
description: Guide the host agent to generate and distribute shared context to all sub-agents in a parallel wave. Ensures consistent understanding of project state and other sub-agents' work.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Share context across sub-agents in a parallel wave.

## When to use

- Before dispatching a parallel wave of sub-agents
- When a sub-agent needs awareness of other agents' work

## What gets shared

The shared context document includes:

1. **Project profile** (from sense module):
   - Language, framework, runtime
   - Test framework, build tool
   - Brownfield status
   - Existing features

2. **Project overview** (from plan):
   - High-level architecture
   - Key modules and their responsibilities
   - Recent changes context

3. **Other sub-agents' plans** (read-only):
   - Each sub-agent in the wave
   - Their task ID and description
   - Their planned file changes

4. **Shared methodology**:
   - Naming conventions
   - Code structure patterns
   - Comment style
   - Test patterns

## How to generate

```bash
# spec-graph generates the shared context internally
# Host agent reads the context from the spec-graph API
spec-graph status --json  # includes context info
```

Or use the spec-graph context-sharing module programmatically:

```typescript
import { generateSharedContext } from '@spec-graph/core/context-sharing';

const context = generateSharedContext(projectContext, taskPlans);
const contextText = context.markdown; // or context.json
```

## Distribute to sub-agents

Each sub-agent should receive the same context document:
- Either include in their initial prompt
- Or make available via a shared file

## Edge cases

- **Context too long** (>2000 words): split into core context and details
- **Sensitive information**: filter out secrets before sharing
- **Sub-agent needs more context**: can request additional context from spec-graph
- **Different sub-agents need different views**: provide filtered context per role

## Why context sharing matters

Without shared context:
- Sub-agent A uses camelCase, sub-agent B uses snake_case
- Sub-agent A creates `UserAuthService`, B creates `IAuthProvider`
- Sub-agent A modifies `src/auth/`, B also modifies `src/auth/`

With shared context:
- All sub-agents use the same conventions
- No naming conflicts
- No file modification conflicts (visible to conflict-analyzer)
