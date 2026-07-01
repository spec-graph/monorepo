/**
 * @spec-graph/core v2
 *
 * The spec-graph engine. A TypeScript library that provides:
 *
 *   - automator: the main state-machine loop (auto / stateless / hook APIs)
 *   - prompt-construction: layered prompt generation with methodology weaving
 *   - planning: intent → structured plan (Phase 0)
 *   - gate-enforcement: entry/exit criteria evaluation + progressive retry
 *   - external-coordination: delegate execution to external AI agents
 *   - knowledge-base: built-in library of methodologies
 *   - recovery: diagnosis-driven recovery strategy
 *
 * spec-graph is a "brain, not hands" — it generates prompts and evaluates
 * outputs, but never executes directly. All execution is delegated to
 * external AI agents via the external-coordination module.
 *
 * Consumed by:
 *   - packages/cli (the human-facing CLI)
 *   - packages/skills (SKILL.md files that orchestrate the CLI for AI agents)
 */

export * as automator from './automator/index.js';
export * as promptConstruction from './prompt-construction/index.js';
export * as planning from './planning/index.js';
export * as gateEnforcement from './gate-enforcement/index.js';
export * as externalCoordination from './external-coordination/index.js';
export * as knowledgeBase from './knowledge-base/index.js';
export * as recovery from './recovery/index.js';

// Re-export key types for convenience
export type {
  Stage,
  Plan,
  LayeredPrompt,
  AgentResult,
  AdvanceResult,
  Diagnosis,
  Status,
} from './automator/index.js';

export type {
  AgentAdapter,
  AgentConfig,
  AgentResponse,
} from './external-coordination/index.js';
export type { Skill, KnowledgeBase } from './knowledge-base/index.js';
export type { RecoveryAction } from './recovery/index.js';

export const VERSION = '2.0.0-alpha.0';
