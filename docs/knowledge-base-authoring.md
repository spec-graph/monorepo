# Knowledge-Base Authoring Guide

This guide explains how to add, modify, or extend methodology entries in spec-graph's knowledge-base.

## Overview

The knowledge-base is a directory tree that contains methodology guidance for each of the 8 stages. spec-graph uses these entries to construct rich XML prompts that guide AI agents.

```
knowledge/
├── stages/
│   └── <stage>/
│       ├── gate.yaml           # Entry/exit criteria for this stage
│       └── skills/
│           └── <skill>/
│               ├── instruction.md   # Methodology guidance
│               └── templates/
│                   └── *.md         # Format templates
└── shared/
    ├── prompt-schema.md
    ├── project-context.md
    └── verification-format.md
```

## Adding a New Skill

To add a new skill (e.g., `security-review` for the `review` stage):

### 1. Create the directory structure

```bash
mkdir -p knowledge/stages/review/skills/security-review/templates
```

### 2. Write the instruction.md

This is the methodology guidance. It gets woven into the `<methodology level="SHOULD">` layer of the prompt.

```markdown
# Security Review — review stage methodology

## Purpose

Review the implementation for security vulnerabilities and compliance.

## Stance

- Think like an attacker. What can go wrong?
- Be specific about findings. Vague "could be insecure" is not a finding.
- Prioritize: blocker > major > minor > nitpick.

## Required checks

### Input validation
- All user input is validated
- SQL/NoSQL queries are parameterized
- File paths are sanitized

### Authentication / Authorization
- Credentials are not hardcoded
- Session tokens expire
- Privilege escalation is impossible

### Secrets management
- Secrets come from environment variables
- No secrets in logs or error messages
- Key rotation strategy documented

## Common pitfalls

- **Pitfall: Focusing only on OWASP Top 10.** Consider domain-specific threats too.
- **Pitfall: Missing threat model.** If there's no threat model, ask the agent to produce one.

## Self-check questions

- Did I review every changed file?
- Did I check for injection vulnerabilities?
- Are credentials handled properly?
```

### 3. (Optional) Add format templates

```bash
# knowledge/stages/review/skills/security-review/templates/security-report.md
```

### 4. Test the skill

Load the knowledge-base and verify:

```typescript
const core = require('@spec-graph/core');
const kb = core.knowledgeBase.loadKnowledgeBase();
console.log(kb.skills.has('security-review')); // true
```

## Adding a New Stage

To add a new stage (advanced — modifies the FSM):

1. Add the stage ID to `STAGES` array in `packages/core/src/automator/index.ts`
2. Add output mapping to `STAGE_OUTPUTS`
3. Create `knowledge/stages/<new-stage>/gate.yaml`
4. Add skills for the new stage
5. Update documentation

Note: Adding a stage changes the workflow — existing sessions may break.

## Writing Good gate.yaml

Gate criteria are evaluated by the `gate-enforcement` module. Each criterion has:

```yaml
- id: unique-identifier
  description: Human-readable description shown in prompts
  verification: rule | traceability | llm-judge | downstream-executability | human
```

### Tips

- **Keep descriptions actionable** — "proposal.md has all sections" is better than "proposal is valid"
- **Include format hints** — for rule-based checks, describe the expected format in the description
- **Balance strictness** — too strict = auto-retry loops; too loose = low quality

### Example gate.yaml

```yaml
entry:
  - id: previous-stage-passed
    description: The previous stage's exit gate passed
    verification: rule

exit:
  - id: artifact-exists
    description: design.md has been created
    verification: rule

  - id: artifact-structure
    description: design.md contains Context / Goals / Decisions / Risks sections
    verification: rule

  - id: covers-specs
    description: Every spec requirement is covered in design.md
    verification: traceability
```

## Writing Good instruction.md

A good instruction.md:

### ✓ Has explicit stance
- "Be specific about findings, not vague"
- "Focus on why, not how"

### ✓ Lists required structure
- "Include these sections: ..."
- "Use this format: - `name`: desc"

### ✓ Has common pitfalls
- "Pitfall: Vague requirements"
- "Pitfall: Missing scenarios"

### ✓ Has self-check questions
- "Did I cover all spec requirements?"
- "Are all capability identifiers kebab-case?"

### ✓ Has a "why this matters" section
- "The design document is the contract between specs and implementation"
- "Bad design = bad implementation = rework"

## Using Local Overrides

Users can extend or override the built-in knowledge-base by placing files in `.spec-graph/knowledge/` within their project:

```bash
# Your project
your-project/
└── .spec-graph/
    └── knowledge/
        └── stages/
            └── review/
                └── skills/
                    └── security-review/        # User-defined skill
                        └── instruction.md
```

The `loadKnowledgeBase(knowledgeBasePath, localOverridePath)` function merges overrides into the base, replacing existing skills with the same id.

## Source Classification

The knowledge-base loader classifies skills by source:

| Source | Meaning |
|--------|---------|
| `openspec` | Ported from OpenSpec-style instructions |
| `bmad` | BMAD-style expert skill |
| `native` | spec-graph's own methodology |
| `user` | User-provided via .spec-graph/knowledge/ |

Classification is heuristic-based. Override by explicitly setting `metadata.source` when constructing a Skill programmatically.
