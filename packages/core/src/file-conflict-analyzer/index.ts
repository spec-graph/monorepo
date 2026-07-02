/**
 * File Conflict Analyzer
 *
 * Analyzes task file impact and detects conflicts. Returns a conflict
 * matrix indicating which task pairs should NOT run in parallel.
 *
 * **Conservative strategy**: if impact is uncertain (task has no file list),
 * risk is marked "unknown" and the task is excluded from conflict checks
 * (per design Decision 3).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskImpact {
  taskId: string;
  files: string[];
  risk: 'low' | 'medium' | 'high' | 'unknown';
}

export interface ConflictMatrix {
  /** matrix[taskA][taskB] = true means conflict detected */
  rows: Record<string, Record<string, boolean>>;
  /** Per-task impact summary */
  impacts: Record<string, TaskImpact>;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze file conflicts between tasks.
 * Each task provides its planned file list (from agent analysis).
 * Conservative: tasks with unknown impact (empty file list) are
 * excluded from conflict checks.
 */
export function analyzeConflicts(taskFiles: Record<string, string[]>): ConflictMatrix {
  const taskIds = Object.keys(taskFiles);
  const matrix: ConflictMatrix = { impacts: {}, rows: {} };

  for (const taskId of taskIds) {
    const files = taskFiles[taskId] || [];
    matrix.impacts[taskId] = {
      taskId,
      files,
      risk: assessRisk(files),
    };
    matrix.rows[taskId] = {};
  }

  for (const taskA of taskIds) {
    for (const taskB of taskIds) {
      if (taskA === taskB) {
        matrix.rows[taskA][taskB] = false;
        continue;
      }
      // Conservative: if either task has unknown risk, no conflict flag
      if (matrix.impacts[taskA].risk === 'unknown' || matrix.impacts[taskB].risk === 'unknown') {
        matrix.rows[taskA][taskB] = false;
      } else {
        matrix.rows[taskA][taskB] = hasConflict(
          matrix.impacts[taskA].files,
          matrix.impacts[taskB].files,
        );
      }
    }
  }

  return matrix;
}

/**
 * Parse agent file list response (JSON array or text).
 * Used when querying agents pre-dispatch for file impact.
 */
export function parseAgentFileList(response: string): string[] {
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string');
    }
  } catch {
    // Fall through
  }
  const files: string[] = [];
  const patterns = [
    /["'`]([^"'`\s]+)["'`]/g,
    /(?:modify|create|update|write|edit|touch|files?):\s*([^\s,;]+)/gi,
    /^\s*-\s+["'`]?([^"'`\s,;]+)["'`]?\s*$/gm,
  ];
  for (const pattern of patterns) {
    for (const m of response.matchAll(pattern)) {
      if (m[1]) files.push(m[1]);
    }
  }
  return [...new Set(files)];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasConflict(filesA: string[], filesB: string[]): boolean {
  for (const a of filesA) {
    for (const b of filesB) {
      if (fileOverlap(a, b)) return true;
    }
  }
  return false;
}

function fileOverlap(fileA: string, fileB: string): boolean {
  if (fileA === fileB) return true;
  // Same directory
  const dirA = fileA.split('/').slice(0, -1).join('/');
  const dirB = fileB.split('/').slice(0, -1).join('/');
  if (dirA && dirA === dirB) return true;
  // Wildcard pattern
  if (fileA.endsWith('*') && fileB.startsWith(fileA.slice(0, -1))) return true;
  if (fileB.endsWith('*') && fileA.startsWith(fileB.slice(0, -1))) return true;
  return false;
}

function assessRisk(files: string[]): 'low' | 'medium' | 'high' | 'unknown' {
  if (files.length === 0) return 'unknown';
  if (files.length <= 2) return 'low';
  if (files.length <= 5) return 'medium';
  return 'high';
}
