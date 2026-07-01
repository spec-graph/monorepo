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

/**
 * Plan a recovery action based on the diagnosis and available resources.
 *
 * The retry level determines the strategy:
 *   Level 1: Weave the diagnosis into a new prompt (lightweight fix).
 *   Level 2: Switch to an alternative methodology from the knowledge-base.
 *   Level 3: Break the current task into smaller subtasks.
 *   Level 4: Escalate — request human intervention.
 */
export function planRecovery(
  diagnosis: Diagnosis,
  availableSkills: string[]
): RecoveryAction {
  switch (diagnosis.retryLevel) {
    case 1: {
      // Lightweight fix: re-prompt with the suggested fixes
      const hints = diagnosis.failedCriteria
        .map((c) => c.suggestedFix || `${c.id}: ${c.reason}`)
        .join('; ');
      return {
        type: 'lightweight-fix',
        updatedPromptHint: `Previous attempt failed. Please address these issues:\n${hints}`,
      };
    }

    case 2: {
      // Swap methodology: pick a different skill if available
      if (availableSkills.length > 1) {
        const currentSkillHint = diagnosis.gateId;
        const alternatives = availableSkills.filter(
          (s) => !s.includes(currentSkillHint)
        );
        const newSkill = alternatives.length > 0 ? alternatives[0] : availableSkills[0];
        return {
          type: 'swap-methodology',
          newSkillId: newSkill,
        };
      }
      // Fall through to escalate if only one skill
      return {
        type: 'escalate-to-user',
        reason: 'No alternative methodology available for this stage',
      };
    }

    case 3: {
      // Decompose task: suggest breaking the failed artifact into sub-steps
      const subtasks = diagnosis.failedCriteria.map(
        (c) => `Fix: ${c.reason}`
      );
      return {
        type: 'decompose-task',
        subtasks:
          subtasks.length > 0
            ? subtasks
            : ['Break the current task into smaller, verifiable sub-steps'],
      };
    }

    case 4:
    default: {
      // Escalate to user
      const reasons = diagnosis.failedCriteria
        .map((c) => `${c.id}: ${c.reason}`)
        .join('\n');
      return {
        type: 'escalate-to-user',
        reason: `Automatic recovery failed after ${diagnosis.retryLevel} attempts.\nFailed criteria:\n${reasons}`,
      };
    }
  }
}

/**
 * Detect whether a new diagnosis is substantially similar to a previous one.
 *
 * Two diagnoses are "similar" if they share the same set of failed criterion
 * IDs. This prevents wasting retries on the same failing approach.
 */
export function detectSimilarity(
  diagnosis: Diagnosis,
  previousDiagnoses: Diagnosis[]
): boolean {
  if (previousDiagnoses.length === 0) return false;

  const currentIds = new Set(diagnosis.failedCriteria.map((c) => c.id));

  for (const prev of previousDiagnoses) {
    const prevIds = new Set(prev.failedCriteria.map((c) => c.id));

    // Check Jaccard similarity: intersection size / union size >= 0.8
    const intersection = new Set([...currentIds].filter((id) => prevIds.has(id)));
    const union = new Set([...currentIds, ...prevIds]);
    const similarity = intersection.size / union.size;

    if (similarity >= 0.8) return true;
  }

  return false;
}

/**
 * Build a prompt hint string from a recovery action.
 * Used by the automator to construct the re-prompt.
 */
export function buildRecoveryHint(action: RecoveryAction): string {
  switch (action.type) {
    case 'lightweight-fix':
      return action.updatedPromptHint;
    case 'swap-methodology':
      return `Try using a different approach. Suggested methodology: ${action.newSkillId}`;
    case 'decompose-task':
      return `Break this task into smaller sub-steps:\n${action.subtasks.map((s) => `  - ${s}`).join('\n')}`;
    case 'escalate-to-user':
      return `Please review and manually resolve:\n${action.reason}`;
  }
}
