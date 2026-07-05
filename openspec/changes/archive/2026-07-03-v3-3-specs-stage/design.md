# v3.3 Design: Specs Stage Implementation

## 1. FSM Extension

### STAGES array change

```typescript
// automator/index.ts
export const STAGES: Stage[] = [
  'specify', 'specs', 'design', 'tasks', 'implement',
  'review', 'test', 'accept', 'integrate',
];

export type Stage =
  | 'specify' | 'specs' | 'design' | 'tasks' | 'implement'
  | 'review' | 'test' | 'accept' | 'integrate';

export const STAGE_OUTPUTS: Record<Stage, { artifact: string; dir: string }> = {
  specify: { artifact: 'proposal.md', dir: 'specify' },
  specs: { artifact: 'specs.md', dir: 'specs' },          // NEW
  design: { artifact: 'design.md', dir: 'design' },
  tasks: { artifact: 'tasks.md', dir: 'tasks' },
  implement: { artifact: 'code', dir: 'implement' },
  review: { artifact: 'review.md', dir: 'review' },
  test: { artifact: 'test.md', dir: 'test' },
  accept: { artifact: 'verification.md', dir: 'accept' },
  integrate: { artifact: 'pr.md', dir: 'integrate' },
};
```

### Backward compat for 8-stage sessions

```typescript
// In loadSession(), detect old sessions and skip specs
function loadSession(sessionId: string, projectRoot?: string): SessionData | null {
  // ...existing code...
  if (data) {
    // Old sessions (created before v3.3) don't have specs stage
    if (!data.stagesVersion || data.stagesVersion < 2) {
      // Insert specs as a virtual "completed" stage
      data.completedArtifacts.push('specs/specs.md');
      data.stagesVersion = 2;
      // Don't change data.stage — it's already at the right stage
    }
  }
  return data;
}
```

Sessions created before v3.3 will have `stagesVersion` undefined (or 1).
We mark specs as "completed" to skip it without disrupting the stage index.

## 2. Specs Stage Gate

### New file: knowledge/stages/specs/gate.yaml

```yaml
# Gate configuration for the specs stage.
entry:
  - id: proposal-exists
    description: proposal.md has been created by the specify stage
    verification: rule

exit:
  - id: specs-exists
    description: specs.md has been created
    verification: rule

  - id: specs-one-per-capability
    description: At least one Requirement section per capability in proposal
    verification: rule

  - id: specs-requirement-format
    description: Requirements use "### Requirement:" format
    verification: rule

  - id: specs-shall-must
    description: Requirements use SHALL/MUST for mandatory behavior
    verification: rule

  - id: specs-scenarios-present
    description: At least one "#### Scenario:" per Requirement
    verification: rule

  - id: specs-length
    description: specs.md is between 200-3000 words
    verification: rule
```

### Design gate cleanup

Remove specs-* criteria from `knowledge/stages/design/gate.yaml`:
- Remove: specs-one-per-capability
- Remove: specs-requirement-format
- Remove: specs-shall-must
- Remove: specs-scenarios-present
- Remove: specs-delta-operations
- Remove: design-covers-specs

Design gate exit becomes:
```yaml
exit:
  - id: specs-passed-gate
    description: The specs stage has passed its exit gate
    verification: rule
  - id: design-exists-if-needed
    description: design.md has been created
    verification: rule
  - id: design-rationale
    description: Design decisions have rationale
    verification: rule
  - id: alternatives-considered
    description: Alternatives considered section present
    verification: rule
  - id: design-risks
    description: Risks or trade-offs section present
    verification: rule
  - id: design-length
    description: design.md is 300-3000 words
    verification: rule
```

## 3. Knowledge Skill Migration

Move specs-authoring from design/skills/ to specs/skills/:

```
knowledge/stages/
  specs/
    gate.yaml                              (new)
    skills/
      specs-authoring/
        instruction.md                     (moved from design/skills/)
        templates/
          spec.md                          (moved from design/skills/)
```

## 4. Gate-Enforcement Rules

### New rules to add

```typescript
// gate-enforcement/index.ts KNOWN_RULES

'specs-exists': (c, ctx) => {
  const content = ctx.artifactContents['specs'] || '';
  return {
    criterion: c,
    passed: content.length > 0,
    reason: content.length > 0 ? 'specs.md exists' : 'specs.md not found',
  };
},

'specs-one-per-capability': (c, ctx) => {
  const content = ctx.artifactContents['specs'] || '';
  const requirements = content.match(/### Requirement:/g) || [];
  return {
    criterion: c,
    passed: requirements.length >= 1,
    reason: `${requirements.length} requirements found`,
  };
},

'specs-shall-must': (c, ctx) => {
  const content = ctx.artifactContents['specs'] || '';
  const hasShallMust = /\b(SHALL|MUST|SHALL NOT|MUST NOT)\b/.test(content);
  return {
    criterion: c,
    passed: hasShallMust,
    reason: hasShallMust ? 'SHALL/MUST keywords found' : 'No SHALL/MUST keywords',
  };
},

'specs-length': (c, ctx) => {
  const content = ctx.artifactContents['specs'] || '';
  const words = content.trim().split(/\s+/).filter(w => w.length > 0).length;
  return {
    criterion: c,
    passed: words >= 200 && words <= 3000,
    reason: `${words} words (expected 200-3000)`,
  };
},
```

### Existing rules to keep

- `specs-requirement-format` — already exists, checks `### Requirement:` format
- `specs-scenarios-present` — already exists, checks scenario count

## 5. Dispatch Update

### STAGE_OUTPUT_MAP

```typescript
// dispatch/index.ts

const STAGE_OUTPUT_MAP: Record<string, StageOutput> = {
  // ...existing...
  specs: {
    dir: 'specs',
    file: 'specs.md',
    template: 'templates/spec.md',
    format: 'Markdown with "### Requirement:" and "#### Scenario:" sections',
    checks: {},
  },
};
```

### Optional specs metadata

```typescript
// New field in DispatchManifest
interface DispatchManifest {
  // ...existing...
  specs?: {
    available: boolean;
    recommended: boolean;
    reason: string;
  };
}

// Recommendation logic
function shouldRecommendSpecs(plan: automator.Plan | null): { recommended: boolean; reason: string } {
  if (!plan) return { recommended: false, reason: '' };
  if (plan.complexity === 'high') return { recommended: true, reason: 'High complexity' };
  if (plan.capabilities?.length > 3) return { recommended: true, reason: 'Many capabilities' };
  if (plan.openQuestions?.length > 0) return { recommended: true, reason: 'Open questions need formal resolution' };
  if (plan.risks?.some(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('brownfield')))
    return { recommended: true, reason: 'Security or brownfield risks require formal requirements' };
  return { recommended: false, reason: '' };
}
```

### Skip path logic

When the coordinator decides to skip specs for a simple change, it
dispatches directly to design stage. The `spec-graph advance` call for
specify produces specs as a completed artifact in machine-state.

This requires a new CLI command or a flag:

```bash
# Skip specs stage (coordinator decision)
spec-graph skip-specs --session <id>

# Or: advance specify marks specs as completed automatically for low-complexity plans
# (handled in automator.submitResult when stage=specify and plan is simple)
```

## 6. Foundation Pack Update

```yaml
# foundation.pack pack.yaml

provides:
  actions:
    - propose
    - specify
    - specs              # NEW
    - design
    - plan
    - tasks
    - implement
    - review
    - test
    - accept
    - integrate
    - archive

  agent_bindings:
    propose: pm
    specify: pm
    specs: architect     # NEW
    design: architect
    contract: architect
    plan: developer
    tasks: developer
    implement: developer
    review: reviewer
    test: qa
    accept: qa
    diagnose: developer
    integrate: developer
    release: developer
    archive: pm
```

## 7. Hook Update

dispatch-watcher.mjs surfaces specs availability:

```javascript
// In the system-reminder
const specsHint = manifest.specs?.available
  ? `\n   Specs stage: ${manifest.specs.recommended ? 'RECOMMENDED' : 'available'}${manifest.specs.reason ? ' — ' + manifest.specs.reason : ''}\n   Use: spec-graph advance with specs artifact, or skip to design`
  : '';
```

## 8. Implementation Order

1. FSM extension (STAGES, STAGE_OUTPUTS, Stage type) — breaks nothing
2. Gate cleanup (remove specs-* from design, add specs/gate.yaml) — fixes design gate
3. Knowledge migration (specs-authoring skill) — no behavior change
4. Gate-enforcement rules (new rules, update existing) — enables specs evaluation
5. Dispatch update (STAGE_OUTPUT_MAP, manifest.specs, skip path) — enables dispatch
6. Foundation pack update (actions, bindings) — enables compose
7. Hook update (system-reminder) — enables coordinator awareness
8. Backward compat (stagesVersion) — preserves existing sessions
9. Tests (specs stage, gate cleanup, skip path, backward compat)
10. E2E validation (9-stage path, 8-stage skip)
11. Docs (CLAUDE.md, SKILL.md)
