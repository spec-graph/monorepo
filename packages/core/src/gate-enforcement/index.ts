/**
 * Gate Enforcement — entry/exit criteria evaluation + progressive retry.
 *
 * Each stage has (from knowledge/stages/<stage>/gate.yaml):
 *   - entry criteria: what must be true to ENTER the stage
 *   - exit criteria: what must be true to LEAVE the stage
 *
 * On failure, the gate produces a structured diagnosis. The recovery module
 * uses this diagnosis to drive a 4-level progressive retry strategy.
 *
 * Verification methods:
 *   - rule: deterministic check (file exists, content matches pattern, etc.)
 *   - traceability: check that artifacts reference each other correctly
 *   - llm-judge: defer to an LLM with a rubric (not yet implemented)
 *   - downstream-executability: can the next stage be executed? (not yet implemented)
 *   - human: requires manual confirmation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationMethod =
  | 'rule'
  | 'traceability'
  | 'llm-judge'
  | 'downstream-executability'
  | 'human';

export interface GateCriterion {
  id: string;
  description: string;
  verification: VerificationMethod;
}

export interface GateConfig {
  entry: GateCriterion[];
  exit: GateCriterion[];
}

export interface Criterion {
  id: string;
  description: string;
  verificationMethod: VerificationMethod;
}

export interface EvaluatedCriterion {
  criterion: Criterion;
  passed: boolean;
  reason?: string;
  evidence?: string;
}

export interface GateResult {
  passed: boolean;
  evaluatedCriteria: EvaluatedCriterion[];
}

export interface DiagnosedCriterion {
  id: string;
  reason: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface Diagnosis {
  gateId: string;
  failedCriteria: DiagnosedCriterion[];
  retryLevel: 1 | 2 | 3 | 4;
  similarToPrevious: boolean;
}

/**
 * Context passed to the evaluator.
 * Contains everything needed to verify criteria.
 */
export interface EvaluationContext {
  projectRoot: string;
  stage: string;
  /** Map of artifact id to file path on disk (relative to projectRoot) */
  artifactFiles: Record<string, string>;
  /** Map of artifact id to file content (if available) */
  artifactContents: Record<string, string>;
  /** Upstream trace data: artifact -> upstream artifact ids */
  traceEdges: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Gate config loading
// ---------------------------------------------------------------------------

/**
 * Load the gate configuration for a stage.
 *
 * Looks in knowledge/stages/<stage>/gate.yaml relative to the knowledge-base root.
 * Falls back to a built-in minimal gate if no gate.yaml exists.
 */
export function loadGateConfig(
  stage: string,
  knowledgeBasePath?: string
): GateConfig {
  if (knowledgeBasePath) {
    const yamlPath = path.join(knowledgeBasePath, 'stages', stage, 'gate.yaml');
    if (fs.existsSync(yamlPath)) {
      return parseGateYaml(fs.readFileSync(yamlPath, 'utf-8'));
    }
  }
  // Built-in fallback: generic gate for any stage
  return getBuiltinGate(stage);
}

/**
 * Parse a gate.yaml string into a GateConfig.
 *
 * Simple YAML parser for our specific gate format. Avoids dependency on js-yaml
 * for the common case of flat lists with id/description/verification fields.
 */
function parseGateYaml(yaml: string): GateConfig {
  const config: GateConfig = { entry: [], exit: [] };
  let section: 'entry' | 'exit' | null = null;
  let currentCriterion: Partial<GateCriterion> | null = null;

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    const topLevel = line.match(/^(\w+):\s*$/);
    if (topLevel) {
      if (topLevel[1] === 'entry' || topLevel[1] === 'exit') {
        // Push the previous section's last criterion before switching
        if (section && currentCriterion && currentCriterion.id) {
          config[section].push(currentCriterion as GateCriterion);
        }
        section = topLevel[1];
        currentCriterion = null;
      }
      continue;
    }

    if (section && line.match(/^\s{2}-\s+id:\s*(.+)/)) {
      const match = line.match(/^\s{2}-\s+id:\s*(.+)/);
      if (match && match[1]) {
        if (currentCriterion && currentCriterion.id) {
          config[section].push(currentCriterion as GateCriterion);
        }
        currentCriterion = { id: match[1].trim() };
      }
    } else if (section && currentCriterion && line.match(/^\s{4}description:\s*(.+)/)) {
      const match = line.match(/^\s{4}description:\s*(.+)/);
      if (match && match[1]) currentCriterion.description = match[1].trim();
    } else if (section && currentCriterion && line.match(/^\s{4}verification:\s*(.+)/)) {
      const match = line.match(/^\s{4}verification:\s*(.+)/);
      if (match && match[1]) {
        const v = match[1].trim() as VerificationMethod;
        currentCriterion.verification = v;
      }
    }
  }
  // Push last criterion
  if (section && currentCriterion && currentCriterion.id) {
    config[section].push(currentCriterion as GateCriterion);
  }

  return config;
}

function getBuiltinGate(stage: string): GateConfig {
  return {
    entry: [
      {
        id: 'previous-stage-passed',
        description: `The previous stage has passed its exit gate`,
        verification: 'rule',
      },
    ],
    exit: [
      {
        id: 'artifacts-exist',
        description: 'All required artifacts have been created',
        verification: 'rule',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Gate merging — combine knowledge + graph gates
// ---------------------------------------------------------------------------

/**
 * Supplementary criteria from graph.yaml gates.
 *
 * When graph.yaml defines gates with `on_transition` matching the current
 * stage transition, their `require_checks` and `require_artifacts` are
 * converted into supplementary criteria and merged with the knowledge gate.
 */
export interface SupplementaryCriteria {
  checks: GateCriterion[];
  artifacts: GateCriterion[];
}

/**
 * Build merged gate criteria from knowledge (primary) + graph (supplementary).
 *
 * @param stage - current stage name
 * @param knowledgeBasePath - path to knowledge-base
 * @param graphGates - gates from graph.yaml (optional)
 * @param currentTransition - e.g. ['specify', 'design'] (optional, for graph matching)
 */
export function buildMergedCriteria(
  stage: string,
  knowledgeBasePath?: string,
  graphGates?: GraphGate[],
  currentTransition?: [string, string],
): GateConfig {
  // 1. Load knowledge gate (primary source)
  const knowledgeGate = loadGateConfig(stage, knowledgeBasePath);

  // 2. Find graph gates matching current transition
  if (!graphGates || !currentTransition) {
    return knowledgeGate;
  }

  const matchingGates = graphGates.filter((g) => {
    if (g.enabled === false) return false;
    const [from, to] = currentTransition;
    return g.on_transition.includes(from) && g.on_transition.includes(to);
  });

  if (matchingGates.length === 0) {
    return knowledgeGate;
  }

  // 3. Collect supplementary criteria from matching graph gates
  const supplementary: SupplementaryCriteria = { checks: [], artifacts: [] };
  const knowledgeIds = new Set([
    ...knowledgeGate.entry.map((c) => c.id),
    ...knowledgeGate.exit.map((c) => c.id),
  ]);

  for (const gate of matchingGates) {
    // Convert require_checks to rule criteria
    for (const checkId of gate.require_checks || []) {
      const id = `graph-${checkId}`;
      if (knowledgeIds.has(id)) {
        console.warn(`[gate-enforcement] graph gate "${gate.id}" duplicates knowledge criterion "${id}", using knowledge version`);
        continue;
      }
      supplementary.checks.push({
        id,
        description: `Graph-required check: ${checkId}`,
        verification: 'rule',
      });
    }

    // Convert require_artifacts to rule criteria
    for (const artId of gate.require_artifacts || []) {
      const id = `graph-${artId}-exists`;
      if (knowledgeIds.has(id)) {
        console.warn(`[gate-enforcement] graph gate "${gate.id}" duplicates knowledge criterion "${id}", using knowledge version`);
        continue;
      }
      supplementary.artifacts.push({
        id,
        description: `Graph-required artifact: ${artId}`,
        verification: 'rule',
      });
    }
  }

  // 4. Merge: knowledge + supplementary
  return {
    entry: knowledgeGate.entry,
    exit: [...knowledgeGate.exit, ...supplementary.checks, ...supplementary.artifacts],
  };
}

/**
 * Graph gate structure (simplified from types/index.ts for decoupling).
 */
export interface GraphGate {
  id: string;
  on_transition: string[];
  require_artifacts?: string[];
  require_checks?: string[];
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate entry or exit criteria for a stage.
 *
 * @param stage - stage name (specify, design, plan, ...)
 * @param criteriaType - 'entry' or 'exit'
 * @param context - evaluation context (artifact paths, contents, traces)
 * @param knowledgeBasePath - optional path to knowledge-base for gate config
 * @param graphGates - optional gates from graph.yaml (merged with knowledge)
 * @param currentTransition - optional transition pair for graph matching
 */
export function evaluateGate(
  stage: string,
  criteriaType: 'entry' | 'exit',
  context: EvaluationContext,
  knowledgeBasePath?: string,
  graphGates?: GraphGate[],
  currentTransition?: [string, string],
): GateResult {
  const config = buildMergedCriteria(stage, knowledgeBasePath, graphGates, currentTransition);
  const criteria = criteriaType === 'entry' ? config.entry : config.exit;

  const evaluatedCriteria: EvaluatedCriterion[] = [];

  for (const criterion of criteria) {
    const result = evaluateCriterion(criterion, criteriaType, context);
    evaluatedCriteria.push(result);
  }

  const passed = evaluatedCriteria.every((ec) => ec.passed);

  return { passed, evaluatedCriteria };
}

function evaluateCriterion(
  criterion: GateCriterion,
  phase: 'entry' | 'exit',
  context: EvaluationContext
): EvaluatedCriterion {
  const c: Criterion = {
    id: criterion.id,
    description: criterion.description || criterion.id,
    verificationMethod: criterion.verification || 'rule',
  };

  switch (c.verificationMethod) {
    case 'rule':
      return evaluateRuleCriterion(c, context);

    case 'traceability':
      return evaluateTraceabilityCriterion(c, context);

    case 'human':
      // Human verification always passes — the caller must handle the prompt
      return {
        criterion: c,
        passed: true,
        reason: 'Requires human confirmation (deferred to caller)',
      };

    case 'llm-judge':
    case 'downstream-executability':
      // Not yet implemented: pass with a warning
      return {
        criterion: c,
        passed: true,
        reason: `Verification method '${c.verificationMethod}' not yet implemented — skipped`,
      };

    default:
      return {
        criterion: c,
        passed: true,
        reason: `Unknown verification method — skipped`,
      };
  }
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

const KNOWN_RULES: Record<
  string,
  (c: Criterion, ctx: EvaluationContext) => EvaluatedCriterion
> = {
  /**
   * Check that a specific file exists at the expected path.
   * Maps criterion ids like "proposal-exists", "design-exists-if-needed", "tasks-exists" etc.
   */
  'proposal-exists': () => {
    return {
      criterion: {
        id: 'proposal-exists',
        description: 'proposal.md exists',
        verificationMethod: 'rule',
      },
      passed: true,
      reason: 'Checked via artifact state (manual evaluation for initial implement)',
    };
  },

  'proposal-structure': (c, ctx) => checkContentContains(c, ctx, 'proposal', [
    '## Why',
    '## What Changes',
    '## Capabilities',
    '## Impact',
  ]),

  'capabilities-enumerated': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    // Capture the Capabilities section content up to the next H2 (## ) that
    // isn't an H3 (###).
    const capSection = content.match(/## Capabilities([\s\S]*?)(?:\n## [^#]|$)/);
    if (!capSection) {
      return { criterion: c, passed: false, reason: 'Capabilities section not found' };
    }
    // Accept both backtick (`name`: desc) and bold (**name**: desc) formats
    const backtickCount = (capSection[1]?.match(/- `[\w-]+`:/g) || []).length;
    const boldCount = (capSection[1]?.match(/- \*\*[\w-]+\*\*:/g) || []).length;
    const count = backtickCount + boldCount;
    return {
      criterion: c,
      passed: count >= 1,
      reason: count >= 1
        ? `Found ${count} capabilities (${backtickCount} backtick, ${boldCount} bold)`
        : 'No capabilities found. Expected format: - `name`: desc or - **name**: desc',
    };
  },

  'capabilities-kebab-case': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const caps = content.match(/- `([\w-]+)`: /g) || [];
    const nonKebab = caps.filter((cap) => {
      const name = cap.match(/- `([\w-]+)`: /)?.[1] || '';
      return !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
    });
    return {
      criterion: c,
      passed: nonKebab.length === 0,
      reason:
        nonKebab.length === 0
          ? 'All capability identifiers are kebab-case'
          : `Non-kebab-case identifiers found: ${nonKebab.join(', ')}`,
    };
  },

  // ─── Layer 3 Quality: specify stage ───────────────────────────────────────
  'proposal-length': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const words = content.trim().split(/\s+/).filter((w) => w.length > 0).length;
    return {
      criterion: c,
      passed: words >= 200 && words <= 1500,
      reason: `${words} words (expected 200-1500)`,
    };
  },

  'focuses-on-why': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const whyIdx = content.indexOf('## Why');
    const whatIdx = content.indexOf('## What Changes');
    if (whyIdx < 0) {
      return { criterion: c, passed: false, reason: '## Why section not found' };
    }
    if (whatIdx < 0) {
      return { criterion: c, passed: false, reason: '## What Changes section not found' };
    }
    return {
      criterion: c,
      passed: whyIdx < whatIdx,
      reason: whyIdx < whatIdx
        ? '"Why" section comes before "What Changes"'
        : '"Why" section should come before "What Changes"',
    };
  },

  'scope-defined': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    return checkContentContains(c, ctx, 'proposal', ['## Out of Scope']);
  },

  'risks-identified': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const hasRisks = /## (Risks|Impact)/i.test(content);
    return {
      criterion: c,
      passed: hasRisks,
      reason: hasRisks
        ? 'Risks or Impact section found'
        : 'No Risks or Impact section found',
    };
  },

  // ─── Layer 1 User Perspective: specify stage ──────────────────────────────
  'user-personas-defined': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const hasPersonas = /## (User Personas?|Personas?)/i.test(content);
    return {
      criterion: c,
      passed: hasPersonas,
      reason: hasPersonas ? 'User Personas section found' : 'No User Personas section',
    };
  },

  'user-stories-present': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    const hasStories = /## (User Stories?|Stories?)/i.test(content) ||
                       /As a .+, I want .+,? so that/i.test(content);
    return {
      criterion: c,
      passed: hasStories,
      reason: hasStories ? 'User Stories found' : 'No User Stories found',
    };
  },

  'capabilities-map-to-stories': (c, ctx) => {
    const content = ctx.artifactContents['proposal'] || '';
    // Look for capabilities section and check if it contains US-xxx references
    const capSection = content.match(/## Capabilities([\s\S]*?)(?:\n## [^#]|$)/);
    if (!capSection) {
      return { criterion: c, passed: false, reason: 'Capabilities section not found' };
    }
    const hasRefs = /US-\d+/i.test(capSection[1] || '');
    return {
      criterion: c,
      passed: hasRefs,
      reason: hasRefs
        ? 'Capabilities reference User Stories'
        : 'No User Story references (US-xxx) in Capabilities section',
    };
  },

  // ─── Layer 3 Quality: design stage ────────────────────────────────────────
  'alternatives-considered': (c, ctx) => {
    const content = ctx.artifactContents['design'] || '';
    const hasAlternatives = /Alternatives [Cc]onsidered/i.test(content) ||
                           /Alternative/i.test(content);
    return {
      criterion: c,
      passed: hasAlternatives,
      reason: hasAlternatives
        ? 'Alternatives considered section found'
        : 'No "Alternatives Considered" section in design.md',
    };
  },

  'design-risks': (c, ctx) => {
    const content = ctx.artifactContents['design'] || '';
    const hasRisks = /## (Risks|Trade-offs|Tradeoffs)/i.test(content);
    return {
      criterion: c,
      passed: hasRisks,
      reason: hasRisks
        ? 'Risks or Trade-offs section found'
        : 'No Risks or Trade-offs section in design.md',
    };
  },

  'design-length': (c, ctx) => {
    const content = ctx.artifactContents['design'] || '';
    const words = content.trim().split(/\s+/).filter((w) => w.length > 0).length;
    return {
      criterion: c,
      passed: words >= 300 && words <= 3000,
      reason: `${words} words (expected 300-3000)`,
    };
  },

  // ─── Layer 1 + 3: plan stage ──────────────────────────────────────────────
  'user-story-traceability': (c, ctx) => {
    const content = ctx.artifactContents['tasks'] || '';
    const hasTrace = /US-\d+/i.test(content) ||
                     /user story/i.test(content) ||
                     /\(US-\d+\)/i.test(content);
    return {
      criterion: c,
      passed: hasTrace,
      reason: hasTrace
        ? 'User Story references found in tasks'
        : 'No User Story references (US-xxx) in tasks.md',
    };
  },

  'tasks-sized-appropriately': (c, ctx) => {
    const content = ctx.artifactContents['tasks'] || '';
    const taskLines = content.match(/- \[[ x]\]\s+\d+\.\d+\s+(.+)/g) || [];
    const oversized = taskLines.filter((line) => {
      const desc = line.replace(/- \[[ x]\]\s+\d+\.\d+\s+/, '');
      return desc.length > 200;
    });
    return {
      criterion: c,
      passed: oversized.length === 0,
      reason: oversized.length === 0
        ? `All ${taskLines.length} tasks are appropriately sized`
        : `${oversized.length}/${taskLines.length} tasks exceed 200 characters`,
    };
  },

  'tasks-verifiable': (c, ctx) => {
    const content = ctx.artifactContents['tasks'] || '';
    const taskLines = content.match(/- \[[ x]\]\s+\d+\.\d+\s+(.+)/g) || [];
    // Heuristic: tasks with specific action verbs are more verifiable
    const actionVerbs = /^(Implement|Add|Create|Update|Delete|Write|Test|Refactor|Fix|Remove|Build|Configure|Setup|Wire|Integrate)/i;
    const verifiable = taskLines.filter((line) => {
      const desc = line.replace(/- \[[ x]\]\s+\d+\.\d+\s+/, '');
      return actionVerbs.test(desc);
    });
    const ratio = taskLines.length > 0 ? verifiable.length / taskLines.length : 1;
    return {
      criterion: c,
      passed: ratio >= 0.8,
      reason: `${verifiable.length}/${taskLines.length} tasks use action verbs (${Math.round(ratio * 100)}%)`,
    };
  },

  // ─── Layer 3 Quality: test stage ──────────────────────────────────────────
  'edge-cases-covered': (c, ctx) => {
    const content = ctx.artifactContents['test'] || '';
    const hasEdgeCases = /edge[- ]?case|error|boundary|invalid|null|undefined/i.test(content);
    return {
      criterion: c,
      passed: hasEdgeCases,
      reason: hasEdgeCases
        ? 'Edge case / error / boundary scenarios found'
        : 'No edge case or error scenario keywords found in tests',
    };
  },

  'all-tasks-implemented': (c, ctx) => {
    const content = ctx.artifactContents['tasks'] || '';
    const allTasks = (content.match(/- \[[ x]\]/g) || []).length;
    const completed = (content.match(/- \[x\]/g) || []).length;
    return {
      criterion: c,
      passed: allTasks > 0 && allTasks === completed,
      reason:
        allTasks === 0
          ? 'No tasks found. Check tasks.md format.'
          : `${completed}/${allTasks} tasks complete`,
    };
  },

  'specs-requirement-format': (c, ctx) => {
    const content = ctx.artifactContents['specs'] || '';
    const hasRequirement = /### Requirement:/.test(content);
    return {
      criterion: c,
      passed: hasRequirement,
      reason: hasRequirement
        ? 'Requirements use correct format'
        : 'No requirements with "### Requirement:" format found',
    };
  },

  'specs-scenarios-present': (c, ctx) => {
    const content = ctx.artifactContents['specs'] || '';
    const requirements = content.match(/### Requirement:/g) || [];
    const scenarios = content.match(/#### Scenario:/g) || [];
    return {
      criterion: c,
      passed: scenarios.length >= requirements.length,
      reason: `${scenarios.length} scenarios for ${requirements.length} requirements`,
    };
  },

  'specs-exists': (c, ctx) => {
    const content = ctx.artifactContents['specs'] || '';
    return {
      criterion: c,
      passed: content.length > 0,
      reason: content.length > 0 ? 'specs.md exists' : 'specs.md not found',
    };
  },

  'specs-shall-must': (c, ctx) => {
    const content = ctx.artifactContents['specs'] || '';
    const hasShallMust = /\b(SHALL|MUST)\b/.test(content);
    return {
      criterion: c,
      passed: hasShallMust,
      reason: hasShallMust ? 'SHALL/MUST keywords found' : 'No SHALL/MUST keywords',
    };
  },

  'specs-length': (c, ctx) => {
    const content = ctx.artifactContents['specs'] || '';
    const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
    const passed = wordCount >= 200 && wordCount <= 3000;
    return {
      criterion: c,
      passed,
      reason: `${wordCount} words (expected 200-3000)`,
    };
  },

  'implement-source-exists': (c, ctx) => {
    // Check that the implement directory contains at least one source file
    const implementPath = ctx.artifactFiles['implement'];
    if (!implementPath) {
      return {
        criterion: c,
        passed: false,
        reason: 'No implement artifact path found in context',
      };
    }

    const fullPath = path.isAbsolute(implementPath)
      ? implementPath
      : path.join(ctx.projectRoot, implementPath);

    if (!fs.existsSync(fullPath)) {
      return {
        criterion: c,
        passed: false,
        reason: `Implement directory does not exist: ${implementPath}`,
      };
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      return {
        criterion: c,
        passed: false,
        reason: `Implement path is not a directory: ${implementPath}`,
      };
    }

    const files = fs.readdirSync(fullPath, { recursive: true, withFileTypes: false }) as string[];
    const sourceFiles = files.filter(f => !f.endsWith('.md') && !f.endsWith('.yaml') && !f.endsWith('.yml') && !f.endsWith('.json'));

    return {
      criterion: c,
      passed: sourceFiles.length > 0,
      reason: sourceFiles.length > 0
        ? `Found ${sourceFiles.length} source file(s) in implement directory`
        : 'No source files found in implement directory (only .md/.yaml/.json files)',
    };
  },

  'implement-validation-passed': (c, ctx) => {
    // Check that sub-agent produced a validation-report.json showing validation passed
    const implementPath = ctx.artifactFiles['implement'];
    if (!implementPath) {
      return {
        criterion: c,
        passed: false,
        reason: 'No implement artifact path found in context',
      };
    }

    const fullPath = path.isAbsolute(implementPath)
      ? implementPath
      : path.join(ctx.projectRoot, implementPath);
    const reportPath = path.join(fullPath, 'validation-report.json');

    if (!fs.existsSync(reportPath)) {
      return {
        criterion: c,
        passed: false,
        reason: 'validation-report.json not found. Sub-agent must run validation and report results.',
      };
    }

    let report: {
      validation_passed?: boolean;
      commands_run?: string[];
      output?: string;
      errors?: string[];
    };
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      return {
        criterion: c,
        passed: false,
        reason: `validation-report.json is not valid JSON: ${err}`,
      };
    }

    if (typeof report.validation_passed !== 'boolean') {
      return {
        criterion: c,
        passed: false,
        reason: 'validation-report.json missing validation_passed field',
      };
    }

    if (!report.validation_passed) {
      const errors = report.errors?.slice(0, 5).join('; ') || 'no error details';
      return {
        criterion: c,
        passed: false,
        reason: `Validation failed: ${errors}`,
      };
    }

    const commands = report.commands_run?.length
      ? `Commands run: ${report.commands_run.slice(0, 3).join(', ')}${report.commands_run.length > 3 ? '...' : ''}`
      : 'No commands reported';

    return {
      criterion: c,
      passed: true,
      reason: `Validation passed. ${commands}`,
    };
  },
};

function evaluateRuleCriterion(
  c: Criterion,
  ctx: EvaluationContext
): EvaluatedCriterion {
  const handler = KNOWN_RULES[c.id];
  if (handler) return handler(c, ctx);

  // Graph-prefixed criteria: from graph.yaml supplementary requirements
  if (c.id.startsWith('graph-')) {
    // Strip prefix and check for artifact existence
    const stripped = c.id.replace(/^graph-/, '').replace(/-exists$/, '');
    if (ctx.artifactFiles[stripped]) {
      return {
        criterion: c,
        passed: true,
        reason: `Graph-required artifact '${stripped}' exists at ${ctx.artifactFiles[stripped]}`,
      };
    }
    // Graph check criteria pass with note (coordinator handles actual check execution)
    return {
      criterion: c,
      passed: true,
      reason: `Graph-required check: coordinator should verify (${c.id})`,
    };
  }

  // Generic rule: check if a file with matching name exists
  const key = c.id.replace(/-exists$/, '');
  if (ctx.artifactFiles[key]) {
    return {
      criterion: c,
      passed: true,
      reason: `Artifact '${key}' exists at ${ctx.artifactFiles[key]}`,
    };
  }

  // Unknown rule: pass with reason
  return {
    criterion: c,
    passed: true,
    reason: `No evaluator registered for rule '${c.id}' — skipped`,
  };
}

// ---------------------------------------------------------------------------
// Traceability evaluator
// ---------------------------------------------------------------------------

function evaluateTraceabilityCriterion(
  c: Criterion,
  ctx: EvaluationContext
): EvaluatedCriterion {
  const edges = ctx.traceEdges;

  switch (c.id) {
    case 'tasks-cover-design': {
      const tasks = edges['tasks'] || [];
      const missing = edges['design']
        ? edges['design'].filter((d) => !tasks.includes(d))
        : [];
      return {
        criterion: c,
        passed: missing.length === 0,
        reason:
          missing.length === 0
            ? 'Tasks cover all design components'
            : `Tasks missing for design components: ${missing.join(', ')}`,
      };
    }

    case 'design-covers-specs': {
      const design = edges['design'] || [];
      const missing = edges['specs']
        ? edges['specs'].filter((s) => !design.includes(s))
        : [];
      return {
        criterion: c,
        passed: missing.length === 0,
        reason:
          missing.length === 0
            ? 'Design covers all spec requirements'
            : `Design missing for spec requirements: ${missing.join(', ')}`,
      };
    }

    case 'trace-complete': {
      // Check the full chain: plan → proposal → specs → design → tasks → code → tests
      const chain = ['plan', 'proposal', 'specs', 'design', 'tasks', 'code', 'tests'];
      const breaks: string[] = [];
      for (let i = 0; i < chain.length - 1; i++) {
        const upstream = edges[chain[i]] || [];
        if (!upstream.includes(chain[i + 1])) {
          breaks.push(`${chain[i]} → ${chain[i + 1]}`);
        }
      }
      return {
        criterion: c,
        passed: breaks.length === 0,
        reason: breaks.length === 0 ? 'Trace complete' : `Broken edges: ${breaks.join(', ')}`,
      };
    }

    default:
      return {
        criterion: c,
        passed: true,
        reason: `No traceability evaluator for '${c.id}' — skipped`,
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkContentContains(
  c: Criterion,
  ctx: EvaluationContext,
  artifactId: string,
  requiredSections: string[]
): EvaluatedCriterion {
  const content = ctx.artifactContents[artifactId] || '';
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      missing.push(section);
    }
  }
  return {
    criterion: c,
    passed: missing.length === 0,
    reason:
      missing.length === 0
        ? 'All required sections present'
        : `Missing sections: ${missing.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export function diagnoseFailure(
  gateResult: GateResult,
  previousDiagnoses: Diagnosis[]
): Diagnosis {
  const failedCriteria: DiagnosedCriterion[] = gateResult.evaluatedCriteria
    .filter((ec) => !ec.passed)
    .map((ec) => ({
      id: ec.criterion.id,
      reason: ec.reason || 'No reason provided',
      evidence: ec.evidence,
      suggestedFix: suggestFix(ec.criterion),
    }));

  // Detect similarity: are the same criteria failing with the same reasons?
  const previousFailedIds = new Set(
    previousDiagnoses.flatMap((d) => d.failedCriteria.map((fc) => fc.id))
  );
  const allSame = failedCriteria.every((fc) => previousFailedIds.has(fc.id));

  // Determine retry level based on previous diagnoses count
  const retryLevel = Math.min(
    (previousDiagnoses.length + 1) as 1 | 2 | 3 | 4,
    4
  ) as 1 | 2 | 3 | 4;

  return {
    gateId: gateResult.evaluatedCriteria[0]?.criterion.id || 'unknown',
    failedCriteria,
    retryLevel,
    similarToPrevious: allSame && previousDiagnoses.length > 0,
  };
}

function suggestFix(criterion: Criterion): string {
  const suggestions: Record<string, string> = {
    'proposal-exists': 'Create proposal.md at the expected path',
    'proposal-structure': 'Add the missing sections to proposal.md',
    'capabilities-enumerated':
      'List your capabilities in the format: - `kebab-case-name`: brief description',
    'capabilities-kebab-case': 'Rename capabilities to kebab-case (e.g., user-auth, data-export)',
    'all-tasks-implemented': 'Complete remaining tasks and mark them with - [x]',
    'specs-requirement-format': 'Use "### Requirement:" format for each requirement',
    'specs-scenarios-present':
      'Add at least one "#### Scenario:" per requirement with WHEN/THEN',
    'tasks-cover-design':
      'Add tasks that cover every design component',
    'design-covers-specs':
      'Add design sections that cover every spec requirement',
    'trace-complete': 'Ensure traceability edges exist for the full chain',
    // Layer 1 (user perspective)
    'user-personas-defined': 'Add a "User Personas" section to proposal.md',
    'user-stories-present':
      'Add "User Stories" section with "As a [type], I want [goal], So that [benefit]" format',
    'capabilities-map-to-stories': 'Reference User Stories (US-xxx) from each capability',
    'user-story-traceability': 'Add User Story references (US-xxx) to each task in tasks.md',
    // Layer 3 (quality)
    'proposal-length': 'Proposal should be 200-1500 words (~1-2 pages)',
    'focuses-on-why': 'Place "## Why" section before "## What Changes" in proposal.md',
    'scope-defined': 'Add an "## Out of Scope" section to proposal.md',
    'risks-identified': 'Add a "## Risks" or "## Impact" section to proposal.md',
    'alternatives-considered': 'Add "Alternatives Considered" subsection for each design decision',
    'design-risks': 'Add a "## Risks" or "## Trade-offs" section to design.md',
    'design-length': 'design.md should be 300-3000 words (~1-6 pages)',
    'tasks-sized-appropriately': 'Keep task descriptions under 200 characters',
    'tasks-verifiable': 'Start task descriptions with action verbs (Implement, Add, Create, etc.)',
    'edge-cases-covered': 'Add test cases for edge cases, errors, and boundary conditions',
    // Implement stage
    'implement-source-exists': 'Create source files in the implement/ directory',
    'implement-validation-passed': 'Run validation (typecheck, lint, tests) and write validation-report.json with validation_passed: true',
    'no-broken-contracts': 'Ensure all existing APIs/interfaces remain compatible or provide migration paths',
  };
  return suggestions[criterion.id] || `Fix the issue with '${criterion.id}'`;
}

export function nextRetryLevel(
  currentLevel: 1 | 2 | 3 | 4
): 1 | 2 | 3 | 4 | null {
  const next = currentLevel + 1;
  return next > 4 ? null : (next as 1 | 2 | 3 | 4);
}
