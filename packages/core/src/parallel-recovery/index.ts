/**
 * Parallel Recovery — precise failure attribution and targeted recovery.
 *
 * Analyzes failures to determine which sub-agent caused the issue.
 * Targeted recovery: retry only the failing sub-agent.
 * Auto-degrade to serial when attribution fails or retries exhausted.
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
 * Analyze a set of failures to determine which sub-agent(s) caused them.
 *
 * Returns attribution result identifying the blamed task(s), or indicates
 * that the failure cannot be attributed (suggesting degradation to serial).
 */
export function analyzeFailure(
  failures: SubAgentFailure[],
  taskFiles: Record<string, string[]>
): AttributionResult {
  if (failures.length === 0) {
    return { blamedTasks: [], canAttribute: true, reason: 'No failures' };
  }

  // Group failures by taskId
  const failuresByTask = new Map<string, SubAgentFailure[]>();
  for (const f of failures) {
    if (!failuresByTask.has(f.taskId)) failuresByTask.set(f.taskId, []);
    failuresByTask.get(f.taskId)!.push(f);
  }

  // Check if failures point to specific tasks
  const blamedTasks = Array.from(failuresByTask.keys());

  // If multiple tasks failed and failures look like file conflicts,
  // attribute to specific task that introduced the conflict
  if (blamedTasks.length > 1) {
    // Check for file conflicts among failed tasks
    const fileConflicts = checkFileConflicts(blamedTasks, taskFiles);
    if (fileConflicts.length > 0) {
      // Attribute to the first task that has the conflict
      return {
        blamedTasks: fileConflicts,
        canAttribute: true,
        reason: 'File conflicts detected',
      };
    }

    // Cannot attribute: too many failures without clear cause
    return {
      blamedTasks,
      canAttribute: false,
      reason: 'Multiple tasks failed without clear single cause',
    };
  }

  // Single task failure: clearly attributed
  return {
    blamedTasks,
    canAttribute: true,
  };
}

/**
 * Determine the minimal recovery action based on attribution.
 */
export function planRecovery(
  attribution: AttributionResult,
  failureCount: number
): RecoveryResult {
  // Cannot attribute: degrade to serial
  if (!attribution.canAttribute) {
    return {
      action: 'degrade-serial',
      tasksToRetry: [],
      reason: 'Cannot attribute failure to specific sub-agent; degrading to serial mode',
    };
  }

  // Too many failures: degrade (regardless of attribution)
  if (failureCount >= 3) {
    return {
      action: 'degrade-serial',
      tasksToRetry: [],
      reason: `Multiple failures (${failureCount}) exceeded retry limit; degrading to serial`,
    };
  }

  // Single task failed: retry that specific task
  if (attribution.blamedTasks.length === 1) {
    return {
      action: 'retry-specific',
      tasksToRetry: attribution.blamedTasks,
      reason: `Retrying specific sub-agent: ${attribution.blamedTasks[0]}`,
    };
  }

  // Multiple tasks but attributed: retry all blamed tasks (≤ 3)
  if (attribution.blamedTasks.length > 1 && attribution.blamedTasks.length <= 3) {
    return {
      action: 'retry-specific',
      tasksToRetry: attribution.blamedTasks,
      reason: `Retrying specific sub-agents: ${attribution.blamedTasks.join(', ')}`,
    };
  }

  // Too many tasks affected (> 3): retry the entire wave
  return {
    action: 'retry-wave',
    tasksToRetry: attribution.blamedTasks,
    reason: 'Multiple sub-agents affected; retrying entire wave',
  };
}

/**
 * Check if multiple tasks have file conflicts.
 */
function checkFileConflicts(
  taskIds: string[],
  taskFiles: Record<string, string[]>
): string[] {
  const conflictingTasks: string[] = [];
  for (let i = 0; i < taskIds.length; i++) {
    for (let j = i + 1; j < taskIds.length; j++) {
      const conflictMatrix = analyzeConflicts({
        [taskIds[i]]: taskFiles[taskIds[i]] || [],
        [taskIds[j]]: taskFiles[taskIds[j]] || [],
      });
      if (conflictMatrix.rows[taskIds[i]]?.[taskIds[j]]) {
        conflictingTasks.push(taskIds[i]);
        conflictingTasks.push(taskIds[j]);
      }
    }
  }
  return Array.from(new Set(conflictingTasks));
}

/**
 * Log a failure for traceability.
 */
export function logFailure(
  taskId: string,
  level: FailureLevel,
  recoveryAction: RecoveryAction,
  outcome: 'success' | 'failure' | 'in-progress',
  rootCause?: string
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
