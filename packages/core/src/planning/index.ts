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
 */

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
  capabilities: Array<{
    id: string;
    description: string;
    dependsOn: string[];
  }>;
  order: string[];
  complexity: 'low' | 'medium' | 'high';
  risks: string[];
  openQuestions: string[];
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
// Planning logic
// ---------------------------------------------------------------------------

/**
 * Generate a structured plan from user intent.
 *
 * The plan decomposes the intent into capabilities, detects dependencies,
 * orders them topologically, estimates complexity, and identifies risks.
 */
export function generatePlan(input: PlanInput): PlanOutput {
  const intent = input.intent;
  const sessionId = intentToSessionId(intent);

  // 1. Match domain keywords in intent
  const lowerIntent = intent.toLowerCase();
  const matchedKeywords: string[] = [];
  const capabilities: PlanOutput['capabilities'] = [];
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

function topologicalSort(
  capabilities: PlanOutput['capabilities']
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const cap of capabilities) {
    inDegree.set(cap.id, 0);
    adjacency.set(cap.id, []);
  }

  for (const cap of capabilities) {
    for (const dep of cap.dependsOn) {
      // Only add edge if both nodes exist
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

  // Any remaining nodes are in a cycle — append them
  for (const cap of capabilities) {
    if (!sorted.includes(cap.id)) sorted.push(cap.id);
  }

  return sorted;
}

function estimateComplexity(
  capabilities: PlanOutput['capabilities'],
  profile?: Record<string, unknown>
): 'low' | 'medium' | 'high' {
  const count = capabilities.length;
  const depCount = capabilities.flatMap((c) => c.dependsOn).length;
  const isBrownfield = profile?.type === 'brownfield' || profile?.brownfield === true;

  // Simple heuristic
  if (count <= 2 && depCount <= 1) return 'low';
  if (count <= 5 && depCount <= 4) return isBrownfield ? 'medium' : 'low';
  if (count <= 8 && depCount <= 6) return 'medium';
  return 'high';
}

function identifyRisks(
  capabilities: PlanOutput['capabilities'],
  keywords: string[],
  intent: string
): string[] {
  const risks: string[] = [];

  // High dependency count → integration risk
  const totalDeps = capabilities.flatMap((c) => c.dependsOn).length;
  if (totalDeps >= 5) {
    risks.push('High dependency count — integration complexity risk');
  }

  // Many capabilities → scope creep risk
  if (capabilities.length >= 8) {
    risks.push('Large number of capabilities — scope creep risk. Consider splitting into multiple changes');
  }

  // Security-related → security review needed
  if (keywords.includes('auth') || keywords.includes('security')) {
    risks.push('Security-sensitive change — requires explicit security review');
  }

  // Database changes → data migration risk
  if (keywords.includes('db') || intent.toLowerCase().includes('database')) {
    risks.push('Database schema change — requires migration plan and backward compatibility check');
  }

  // Refactoring → regression risk
  if (keywords.includes('refactor')) {
    risks.push('Refactoring — ensure existing behavior is preserved (regression test suite)');
  }

  // Brownfield integration risk
  if (keywords.some((k) => ['auth', 'api', 'db'].includes(k)) && capabilities.length > 2) {
    risks.push('Brownfield integration — verify compatibility with existing codebase patterns');
  }

  if (risks.length === 0) {
    risks.push('Low-risk change — standard development workflow applies');
  }

  return risks;
}
