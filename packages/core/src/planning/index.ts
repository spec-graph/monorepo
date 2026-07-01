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
  profile: Record<string, unknown>;
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
// API
// ---------------------------------------------------------------------------

export function generatePlan(input: PlanInput): PlanOutput {
  // TODO: invoke planning skill from knowledge-base with intent + profile
  throw new Error('planning.generatePlan not yet implemented');
}
