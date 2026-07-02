/**
 * @spec-graph/core v3
 *
 * The spec-graph engine. A TypeScript library that provides:
 *
 *   - automator: the main state-machine loop
 *   - planning: intent → structured plan (Phase 0)
 *   - gate-enforcement: entry/exit criteria evaluation + progressive retry
 *   - knowledge-base: built-in library of methodologies
 *   - recovery: diagnosis-driven recovery strategy
 *   - sense: project feature detection
 *   - dispatch: manifest generation for sub-agent execution
 *   - composer: pack composition into graph.yaml
 *   - machine-state: artifact state tracking
 *
 * spec-graph is a "brain, not hands" — it generates dispatch manifests
 * and evaluates outputs, but never executes directly. All execution is
 * delegated to external coordinators (Claude Code hooks, CI/CD systems,
 * custom orchestrators).
 *
 * Consumed by:
 *   - packages/cli (the human-facing CLI)
 *   - packages/skills (SKILL.md files that orchestrate the CLI for AI agents)
 */

export * as automator from './automator/index.js';
export * as planning from './planning/index.js';
export * as gateEnforcement from './gate-enforcement/index.js';
export * as knowledgeBase from './knowledge-base/index.js';
export * as recovery from './recovery/index.js';
export * as sense from './sense/index.js';
export * as dispatch from './dispatch/index.js';
export * as composer from './composer/index.js';
export * as machineState from './machine-state/index.js';

// Re-export key types for convenience
export type {
  Stage,
  Plan,
  AgentResult,
  AdvanceResult,
  Diagnosis,
  Status,
} from './automator/index.js';

export type { Skill, KnowledgeBase } from './knowledge-base/index.js';
export type { RecoveryAction } from './recovery/index.js';
export type { DispatchAction, DispatchManifest, DispatchMeeting } from './types/index.js';

export const VERSION = '3.0.0';
