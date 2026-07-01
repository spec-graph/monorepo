/**
 * Recovery — diagnosis-driven recovery strategy.
 *
 * When a gate fails, the gate-enforcement module produces a diagnosis.
 * The recovery module uses this diagnosis to drive a 4-level progressive
 * retry strategy:
 *
 *   Level 1: Lightweight fix (re-prompt with diagnosis woven in)
 *   Level 2: Swap methodology (use a different skill from knowledge-base)
 *   Level 3: Decompose task (split into smaller subtasks)
 *   Level 4: Escalate to user (pause and request human intervention)
 *
 * Includes similarity detection to avoid retrying the same failing approach.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Diagnosis {
  gateId: string;
  failedCriteria: Array<{
    id: string;
    reason: string;
    evidence?: string;
    suggestedFix?: string;
  }>;
  retryLevel: 1 | 2 | 3 | 4;
  similarToPrevious: boolean;
}

export type RecoveryAction =
  | { type: 'lightweight-fix'; updatedPromptHint: string }
  | { type: 'swap-methodology'; newSkillId: string }
  | { type: 'decompose-task'; subtasks: string[] }
  | { type: 'escalate-to-user'; reason: string };

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function planRecovery(
  diagnosis: Diagnosis,
  availableSkills: string[]
): RecoveryAction {
  // TODO: based on diagnosis.retryLevel, produce the appropriate action
  throw new Error('recovery.planRecovery not yet implemented');
}

export function detectSimilarity(
  diagnosis: Diagnosis,
  previousDiagnoses: Diagnosis[]
): boolean {
  // TODO: compare current diagnosis with previous, detect same root cause
  throw new Error('recovery.detectSimilarity not yet implemented');
}
