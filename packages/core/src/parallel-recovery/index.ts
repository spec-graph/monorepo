/**
 * Parallel Recovery
 *
 * Precise failure attribution + targeted recovery:
 *   - Analyzes failures to determine which sub-agent caused the issue
 *   - Targets recovery to the specific failing sub-agent (not entire wave)
 *   - Auto-degrades to serial when attribution fails or retries exhausted
 *
 * **Recovery order (per design)**:
 *   1. Cannot attribute → degrade to serial
 *   2. failureCount >= 3 → degrade to serial
 *   3. Single task failed → retry that specific task
 *   4. Multiple tasks (<=3) → retry all blamed tasks
 *   5. Too many tasks (>3) → retry entire wave
 */

import { analyzeConflicts } from '../file-conflict-analyzer/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryAction = 'retry-specific' | 'retry-wave' | 'degrade-serial' | 'no-action';
export type FailureLevel = 1 | 2 | 3;

export interface SubAgentFailure {
  taskId: string;
  level: FailureLevel;
  error: string;
  evidence?: string;
}

export interface AttributionResult {
  blamedTasks: string[];
  canAttribute: boolean;
  reason?: string;
}

export interface RecoveryResult {
  action: RecoveryAction;
  tasksToRetry: string[];
  reason: string;
}

export interface FailureLog {
  timestamp: string;
  taskId: string;
  level: FailureLevel;
  rootCause?: string;
  recoveryAction: RecoveryAction;
  outcome: 'success' | 'failure' | 'in-progress';
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze failures to attribute blame to specific sub-agent(s).
 * If multiple tasks failed and they have file conflicts, attribute
 * to the conflicting tasks.
 */
export function analyzeFailure(
  failures: SubAgentFailure[],
  taskFiles: Record<string, string[]>,
): AttributionResult {
  if (failures.length === 0) {
    return { blamedTasks: [], canAttribute: true, reason: 'No failures' };
  }

  // Group by taskId
  const failuresByTask = new Map<string, SubAgentFailure[]>();
  for (const f of failures) {
    if (!failuresByTask.has(f.taskId)) failuresByTask.set(f.taskId, []);
    failuresByTask.get(f.taskId)!.push(f);
  }

  const blamedTasks = Array.from(failuresByTask.keys());

  if (blamedTasks.length > 1) {
    // Check for file conflicts among failed tasks
    const conflicting = checkFileConflicts(blamedTasks, taskFiles);
    if (conflicting.length > 0) {
      return {
        blamedTasks: conflicting,
        canAttribute: true,
        reason: 'File conflicts detected',
      };
    }
    return {
      blamedTasks,
      canAttribute: false,
      reason: 'Multiple tasks failed without clear single cause',
    };
  }

  return { blamedTasks, canAttribute: true };
}

/**
 * Determine the minimal recovery action based on attribution and failure count.
 */
export function planRecovery(
  attribution: AttributionResult,
  failureCount: number,
): RecoveryResult {
  if (!attribution.canAttribute) {
    return {
      action: 'degrade-serial',
      tasksToRetry: [],
      reason: 'Cannot attribute failure; degrading to serial mode',
    };
  }
  if (failureCount >= 3) {
    return {
      action: 'degrade-serial',
      tasksToRetry: [],
      reason: `Multiple failures (${failureCount}) exceeded retry limit; degrading to serial`,
    };
  }
  if (attribution.blamedTasks.length === 1) {
    return {
      action: 'retry-specific',
      tasksToRetry: attribution.blamedTasks,
      reason: `Retrying specific sub-agent: ${attribution.blamedTasks[0]}`,
    };
  }
  if (attribution.blamedTasks.length <= 3) {
    return {
      action: 'retry-specific',
      tasksToRetry: attribution.blamedTasks,
      reason: `Retrying specific sub-agents: ${attribution.blamedTasks.join(', ')}`,
    };
  }
  return {
    action: 'retry-wave',
    tasksToRetry: attribution.blamedTasks,
    reason: 'Multiple sub-agents affected; retrying entire wave',
  };
}

/**
 * Log a failure for traceability.
 */
export function logFailure(
  taskId: string,
  level: FailureLevel,
  recoveryAction: RecoveryAction,
  outcome: 'success' | 'failure' | 'in-progress',
  rootCause?: string,
): FailureLog {
  return {
    timestamp: new Date().toISOString(),
    taskId,
    level,
    rootCause,
    recoveryAction,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkFileConflicts(
  taskIds: string[],
  taskFiles: Record<string, string[]>,
): string[] {
  const conflicting: string[] = [];
  for (let i = 0; i < taskIds.length; i++) {
    for (let j = i + 1; j < taskIds.length; j++) {
      const matrix = analyzeConflicts({
        [taskIds[i]]: taskFiles[taskIds[i]] || [],
        [taskIds[j]]: taskFiles[taskIds[j]] || [],
      });
      if (matrix.rows[taskIds[i]]?.[taskIds[j]]) {
        conflicting.push(taskIds[i], taskIds[j]);
      }
    }
  }
  return Array.from(new Set(conflicting));
}
