/**
 * Planning — transform user intent into a structured plan.
 *
 * The planning module runs as "Phase 0" before specify. It takes the user's
 * intent + project profile and produces a plan that:
 *   - decomposes the intent into capabilities
 *   - orders them by dependency
 *   - estimates complexity
 *   - identifies risks
 *
 * The plan is the scope contract for the entire workflow.
 *
 * ## Two modes:
 *
 * 1. **LLM mode** (default): generates a planning manifest for external
 *    coordinator to dispatch a planning agent. The agent returns JSON
 *    conforming to PlanJSON schema, which is validated.
 *
 * 2. **Fallback mode** (`--fallback` flag): uses local keyword matching
 *    to decompose intent. No LLM needed. Works offline.
 */

import type { PlanCapability, PlanJSON, ValidationResult, ValidationError } from './schema.js';
import { PLAN_JSON_SCHEMA } from './schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanInput {
  intent: string;
  profile?: Record<string, unknown>;
  openQuestions?: string[];
}

export interface PlanOutput {
  sessionId: string;
  intent: string;
  capabilities: PlanCapability[];
  order: string[];
  complexity: 'low' | 'medium' | 'high';
  risks: string[];
  openQuestions: string[];
}

export interface PlanningManifest {
  version: '1';
  type: 'planning';
  intent: string;
  profile: Record<string, unknown>;
  prompt: string;
  schema: typeof PLAN_JSON_SCHEMA;
  agent_config: {
    agent_id: 'planner';
    model_tier: 'capable';
  };
  next_step: string;
}

// ---------------------------------------------------------------------------
// Domain knowledge: keyword → capability templates
// ---------------------------------------------------------------------------

interface CapabilityTemplate {
  id: string;
  description: string;
  dependsOn?: string[];
}

const DOMAIN_TEMPLATES: Record<string, CapabilityTemplate[]> = {
  auth: [
    { id: 'user-model', description: 'User data model and storage' },
    { id: 'auth-endpoints', description: 'Registration, login, logout, token refresh endpoints', dependsOn: ['user-model'] },
    { id: 'auth-middleware', description: 'Request authentication and authorization middleware', dependsOn: ['user-model'] },
  ],
  api: [
    { id: 'api-endpoints', description: 'REST or GraphQL endpoint definitions' },
    { id: 'request-validation', description: 'Input validation and sanitization' },
    { id: 'error-handling', description: 'Consistent error response format and handling', dependsOn: ['api-endpoints'] },
    { id: 'api-docs', description: 'API documentation (OpenAPI, etc.)', dependsOn: ['api-endpoints'] },
  ],
  ui: [
    { id: 'ui-components', description: 'UI component implementation' },
    { id: 'state-management', description: 'Client-side state management' },
    { id: 'routing', description: 'Page routing and navigation', dependsOn: ['ui-components'] },
  ],
  db: [
    { id: 'data-model', description: 'Database schema design and migrations' },
    { id: 'query-layer', description: 'Data access layer (ORM, raw queries)' },
    { id: 'data-validation', description: 'Data integrity constraints and validation', dependsOn: ['data-model'] },
  ],
  test: [
    { id: 'unit-tests', description: 'Unit test coverage for core logic' },
    { id: 'integration-tests', description: 'Integration tests for API/DB interactions' },
    { id: 'e2e-tests', description: 'End-to-end test scenarios', dependsOn: ['integration-tests'] },
  ],
  cli: [
    { id: 'cli-commands', description: 'CLI command definitions and parsing' },
    { id: 'cli-output', description: 'Output formatting (text, JSON, table)', dependsOn: ['cli-commands'] },
  ],
  deploy: [
    { id: 'ci-pipeline', description: 'Continuous integration pipeline config' },
    { id: 'deployment-config', description: 'Deployment configuration and scripts', dependsOn: ['ci-pipeline'] },
  ],
  security: [
    { id: 'input-sanitization', description: 'Sanitize all user inputs' },
    { id: 'authz-checks', description: 'Authorization checks on sensitive operations' },
    { id: 'secret-management', description: 'Environment variable and secret handling' },
  ],
  perf: [
    { id: 'caching', description: 'Caching layer for frequently accessed data' },
    { id: 'query-optimization', description: 'Database query and index optimization' },
    { id: 'profiling', description: 'Performance profiling and benchmarks' },
  ],
  refactor: [
    { id: 'extract-module', description: 'Extract related code into a cohesive module' },
    { id: 'interface-definition', description: 'Define clear module interfaces' },
    { id: 'migration-path', description: 'Gradual migration path without breaking changes', dependsOn: ['interface-definition'] },
  ],
  knowledge: [
    { id: 'knowledge-structure', description: 'Directory tree structure for methodology storage' },
    { id: 'knowledge-loader', description: 'Load and parse knowledge-base entries' },
    { id: 'knowledge-integration', description: 'Wire knowledge-base into prompt construction', dependsOn: ['knowledge-loader'] },
  ],
  agent: [
    { id: 'agent-adapter-interface', description: 'Define the common agent adapter interface' },
    { id: 'agent-claude-code', description: 'Claude Code adapter implementation', dependsOn: ['agent-adapter-interface'] },
    { id: 'agent-codex', description: 'Codex adapter implementation', dependsOn: ['agent-adapter-interface'] },
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured plan from user intent (fallback/keyword matching).
 *
 * This is the offline-capable path. Uses keyword matching against
 * DOMAIN_TEMPLATES to decompose intent. No LLM required.
 *
 * @deprecated Use `generatePlanningManifest()` for LLM-based planning.
 *             This function is kept for backward compat and --fallback mode.
 */
export function generatePlan(input: PlanInput): PlanOutput {
  return generatePlanFallback(input);
}

/**
 * Generate a planning manifest for LLM-based planning.
 *
 * The manifest contains a prompt that instructs the planning agent to
 * decompose the intent into capabilities. The agent returns JSON conforming
 * to PlanJSON schema, which must be validated with `validatePlanOutput()`.
 *
 * @param input - user intent + project profile
 * @returns PlanningManifest for external coordinator to dispatch
 */
export function generatePlanningManifest(input: PlanInput): PlanningManifest {
  const prompt = buildPlanningPrompt(input);

  return {
    version: '1',
    type: 'planning',
    intent: input.intent,
    profile: input.profile || {},
    prompt,
    schema: PLAN_JSON_SCHEMA,
    agent_config: {
      agent_id: 'planner',
      model_tier: 'capable',
    },
    next_step: `spec-graph confirm ${intentToSessionId(input.intent)}`,
  };
}

/**
 * Validate a JSON plan output from an LLM agent.
 *
 * Checks:
 *   - Schema conformance (required fields, types, patterns)
 *   - Semantic validity (all ids unique, dependsOn references valid,
 *     order is a permutation of capabilities)
 *
 * @param json - raw JSON from agent
 * @returns ValidationResult with errors if invalid
 */
export function validatePlanOutput(json: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Must be an object
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { valid: false, errors: [{ field: '$root', message: 'Plan must be an object' }] };
  }

  const obj = json as Record<string, unknown>;

  // 2. Required fields
  if (!Array.isArray(obj.capabilities)) {
    errors.push({ field: 'capabilities', message: 'Must be an array' });
  }
  if (!Array.isArray(obj.order)) {
    errors.push({ field: 'order', message: 'Must be an array' });
  }
  if (!obj.complexity) {
    errors.push({ field: 'complexity', message: 'Required field' });
  }

  // 3. Capabilities validation
  if (Array.isArray(obj.capabilities)) {
    if (obj.capabilities.length === 0) {
      errors.push({ field: 'capabilities', message: 'Must have at least 1 capability' });
    }
    if (obj.capabilities.length > 15) {
      errors.push({ field: 'capabilities', message: 'Must have at most 15 capabilities' });
    }

    const ids = new Set<string>();
    for (let i = 0; i < obj.capabilities.length; i++) {
      const cap = obj.capabilities[i];
      if (!cap || typeof cap !== 'object') {
        errors.push({ field: `capabilities[${i}]`, message: 'Must be an object' });
        continue;
      }

      const c = cap as Record<string, unknown>;

      // id: required, kebab-case
      if (typeof c.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c.id)) {
        errors.push({
          field: `capabilities[${i}].id`,
          message: 'Must be kebab-case (e.g., "user-auth")',
          value: c.id,
        });
      } else if (ids.has(c.id)) {
        errors.push({ field: `capabilities[${i}].id`, message: 'Duplicate id', value: c.id });
      } else {
        ids.add(c.id);
      }

      // description: required, at least 10 chars
      if (typeof c.description !== 'string' || c.description.length < 10) {
        errors.push({
          field: `capabilities[${i}].description`,
          message: 'Must be at least 10 characters',
          value: c.description,
        });
      }

      // dependsOn: optional, array of strings
      if (c.dependsOn !== undefined) {
        if (!Array.isArray(c.dependsOn)) {
          errors.push({ field: `capabilities[${i}].dependsOn`, message: 'Must be an array' });
        } else {
          for (let j = 0; j < c.dependsOn.length; j++) {
            if (typeof c.dependsOn[j] !== 'string') {
              errors.push({
                field: `capabilities[${i}].dependsOn[${j}]`,
                message: 'Must be a string',
              });
            }
          }
        }
      }
    }

    // Check dependsOn references exist
    if (errors.length === 0) {
      for (let i = 0; i < obj.capabilities.length; i++) {
        const cap = obj.capabilities[i] as Record<string, unknown>;
        if (Array.isArray(cap.dependsOn)) {
          for (const dep of cap.dependsOn) {
            if (!ids.has(dep as string)) {
              errors.push({
                field: `capabilities[${i}].dependsOn`,
                message: `References non-existent capability: ${dep}`,
              });
            }
          }
        }
      }
    }
  }

  // 4. Complexity validation
  if (!['low', 'medium', 'high'].includes(obj.complexity as string)) {
    errors.push({
      field: 'complexity',
      message: 'Must be "low", "medium", or "high"',
      value: obj.complexity,
    });
  }

  // 5. Order validation (must be permutation of capability ids)
  if (Array.isArray(obj.capabilities) && Array.isArray(obj.order)) {
    const capIds = obj.capabilities.map((c: any) => c.id).filter(Boolean);
    const orderSet = new Set(obj.order);
    const capSet = new Set(capIds);

    if (orderSet.size !== capSet.size) {
      errors.push({
        field: 'order',
        message: 'Order length must match capabilities length',
      });
    } else {
      for (const id of obj.order) {
        if (!capSet.has(id)) {
          errors.push({ field: 'order', message: `References unknown capability: ${id}` });
        }
      }
      for (const id of capIds) {
        if (!orderSet.has(id)) {
          errors.push({ field: 'order', message: `Missing capability in order: ${id}` });
        }
      }
    }
  }

  // 6. Optional arrays (risks, openQuestions) — just validate types if present
  if (obj.risks !== undefined && !Array.isArray(obj.risks)) {
    errors.push({ field: 'risks', message: 'Must be an array' });
  }
  if (obj.openQuestions !== undefined && !Array.isArray(obj.openQuestions)) {
    errors.push({ field: 'openQuestions', message: 'Must be an array' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Fallback: keyword-matching intent decomposition.
 *
 * Matches domain keywords in intent against DOMAIN_TEMPLATES and returns
 * a structured plan. Used when no LLM is available.
 */
export function generatePlanFallback(input: PlanInput): PlanOutput {
  const intent = input.intent;
  const sessionId = intentToSessionId(intent);

  // 1. Match domain keywords in intent
  const lowerIntent = intent.toLowerCase();
  const matchedKeywords: string[] = [];
  const capabilities: PlanCapability[] = [];
  const seenIds = new Set<string>();

  for (const [keyword, templates] of Object.entries(DOMAIN_TEMPLATES)) {
    if (lowerIntent.includes(keyword)) {
      matchedKeywords.push(keyword);
      for (const tmpl of templates) {
        if (!seenIds.has(tmpl.id)) {
          capabilities.push({
            id: tmpl.id,
            description: tmpl.description,
            dependsOn: tmpl.dependsOn || [],
          });
          seenIds.add(tmpl.id);
        }
      }
    }
  }

  // Fallback: if no keywords matched, create a single generic capability
  if (capabilities.length === 0) {
    const genericId = intent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    capabilities.push({
      id: genericId || 'implementation',
      description: intent,
      dependsOn: [],
    });
  }

  // 2. Topological sort (Kahn's algorithm)
  const order = topologicalSort(capabilities);

  // 3. Estimate complexity
  const complexity = estimateComplexity(capabilities, input.profile);

  // 4. Identify risks
  const risks = identifyRisks(capabilities, matchedKeywords, intent);

  return {
    sessionId,
    intent,
    capabilities,
    order,
    complexity,
    risks,
    openQuestions: input.openQuestions || [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intentToSessionId(intent: string): string {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function topologicalSort(capabilities: PlanCapability[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const cap of capabilities) {
    inDegree.set(cap.id, 0);
    adjacency.set(cap.id, []);
  }

  for (const cap of capabilities) {
    for (const dep of cap.dependsOn) {
      if (inDegree.has(dep)) {
        adjacency.get(dep)!.push(cap.id);
        inDegree.set(cap.id, (inDegree.get(cap.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  for (const cap of capabilities) {
    if (!sorted.includes(cap.id)) sorted.push(cap.id);
  }

  return sorted;
}

function estimateComplexity(
  capabilities: PlanCapability[],
  profile?: Record<string, unknown>,
): 'low' | 'medium' | 'high' {
  const count = capabilities.length;
  const depCount = capabilities.flatMap((c) => c.dependsOn).length;
  const isBrownfield = profile?.type === 'brownfield' || profile?.brownfield === true;

  if (count <= 2 && depCount <= 1) return 'low';
  if (count <= 5 && depCount <= 4) return isBrownfield ? 'medium' : 'low';
  if (count <= 8 && depCount <= 6) return 'medium';
  return 'high';
}

function identifyRisks(
  capabilities: PlanCapability[],
  keywords: string[],
  intent: string,
): string[] {
  const risks: string[] = [];

  const totalDeps = capabilities.flatMap((c) => c.dependsOn).length;
  if (totalDeps >= 5) {
    risks.push('High dependency count — integration complexity risk');
  }

  if (capabilities.length >= 8) {
    risks.push(
      'Large number of capabilities — scope creep risk. Consider splitting into multiple changes',
    );
  }

  if (keywords.includes('auth') || keywords.includes('security')) {
    risks.push('Security-sensitive change — requires explicit security review');
  }

  if (keywords.includes('db') || intent.toLowerCase().includes('database')) {
    risks.push(
      'Database schema change — requires migration plan and backward compatibility check',
    );
  }

  if (keywords.includes('refactor')) {
    risks.push('Refactoring — ensure existing behavior is preserved (regression test suite)');
  }

  if (
    keywords.some((k) => ['auth', 'api', 'db'].includes(k)) &&
    capabilities.length > 2
  ) {
    risks.push('Brownfield integration — verify compatibility with existing codebase patterns');
  }

  if (risks.length === 0) {
    risks.push('Low-risk change — standard development workflow applies');
  }

  return risks;
}

/**
 * Build the planning prompt for the LLM agent.
 */
function buildPlanningPrompt(input: PlanInput): string {
  const lines: string[] = [];

  lines.push('# Planning Agent');
  lines.push('');
  lines.push('You are a **planning agent** — your job is to decompose a user intent');
  lines.push('into structured capabilities that can be implemented independently.');
  lines.push('');
  lines.push('## User Intent');
  lines.push('');
  lines.push('```');
  lines.push(input.intent);
  lines.push('```');
  lines.push('');

  if (input.profile && Object.keys(input.profile).length > 0) {
    lines.push('## Project Profile');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(input.profile, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Task');
  lines.push('');
  lines.push('Decompose the user intent into **capabilities**. Each capability is an');
  lines.push('independent unit of work that can be implemented by a sub-agent.');
  lines.push('');
  lines.push('For each capability, provide:');
  lines.push('- `id`: kebab-case identifier (e.g., "user-auth", "data-model")');
  lines.push('- `description`: what this capability does (at least 10 characters)');
  lines.push('- `dependsOn`: list of capability ids this depends on (empty if none)');
  lines.push('');
  lines.push('Also provide:');
  lines.push('- `order`: array of capability ids in implementation order');
  lines.push('- `complexity`: "low" | "medium" | "high"');
  lines.push('- `risks`: array of risk descriptions');
  lines.push('- `openQuestions`: array of unresolved questions (optional)');
  lines.push('');
  lines.push('## Output Format');
  lines.push('');
  lines.push('Return a JSON object conforming to this schema:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(PLAN_JSON_SCHEMA, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Example');
  lines.push('');
  lines.push('Given intent: "Build JWT authentication system"');
  lines.push('');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        capabilities: [
          { id: 'user-model', description: 'User data model with email and password hash', dependsOn: [] },
          { id: 'auth-endpoints', description: 'Registration, login, logout, token refresh endpoints', dependsOn: ['user-model'] },
          { id: 'auth-middleware', description: 'JWT verification middleware for protected routes', dependsOn: ['user-model'] },
        ],
        order: ['user-model', 'auth-endpoints', 'auth-middleware'],
        complexity: 'medium',
        risks: ['Security-sensitive — requires explicit security review'],
        openQuestions: [],
      },
      null,
      2,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push('Return ONLY the JSON object. No explanation, no markdown fences.');

  return lines.join('\n');
}

