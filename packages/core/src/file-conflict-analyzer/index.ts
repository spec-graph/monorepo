/**
 * File Conflict Analyzer — analyzes task file impact and detects conflicts.
 *
 * Conservative strategy: if impact is uncertain, default to serial.
 * Static analysis based on task description + design references.
 * Optional pre-dispatch agent query for accurate file lists.
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
  /** matrix[taskA][taskB] = true means taskA and taskB have conflicts */
  rows: Record<string, Record<string, boolean>>;
  /** Per-task impact summary */
  impacts: Record<string, TaskImpact>;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze file conflicts between tasks.
 *
 * Each task should provide its planned files (via pre-query or static analysis).
 * Returns a conflict matrix indicating which task pairs should NOT run in parallel.
 */
export function analyzeConflicts(taskFiles: Record<string, string[]>): ConflictMatrix {
  const taskIds = Object.keys(taskFiles);
  const matrix: ConflictMatrix = { impacts: {} };

  // Build per-task impact records
  for (const taskId of taskIds) {
    const files = taskFiles[taskId] || [];
    matrix.impacts[taskId] = {
      taskId,
      files,
      risk: assessRisk(files),
    };
  }

  // Build conflict matrix
  for (const taskA of taskIds) {
    matrix.rows[taskA] = {};
    for (const taskB of taskIds) {
      if (taskA === taskB) {
        matrix.rows[taskA][taskB] = false;
        continue;
      }
      matrix.rows[taskA][taskB] = hasConflict(taskFiles[taskA] || [], taskFiles[taskB] || []);
    }
  }

  return matrix;
}

/**
 * Query an agent for which files it plans to modify.
 * Returns the parsed list of files, or [] if parsing fails.
 */
export function parseAgentFileList(response: string): string[] {
  // Try to parse as JSON array
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string');
    }
  } catch {
    // Fall through to text parsing
  }

  // Try to extract files from common patterns
  const files: string[] = [];
  const patterns = [
    /["'`]([^"'`\s]+)["'`]/g, // "path/to/file" (any path, with or without extension)
    /(?:modify|create|update|write|edit|touch|files?):\s*([^\s,;]+)/gi, // "modify: path" or "files: path"
    /^\s*-\s+["'`]?([^"'`\s,;]+)["'`]?\s*$/gm, // "- path" (line-start bullet)
  ];

  for (const pattern of patterns) {
    const matches = response.matchAll(pattern);
    for (const m of matches) {
      if (m[1]) files.push(m[1]);
    }
  }

  return [...new Set(files)];
}

/**
 * Static analysis: extract likely files from task description.
 * This is a heuristic; agent-query is more accurate.
 */
export function staticAnalyze(description: string, designRefs: string[] = []): string[] {
  const files = new Set<string>();

  // Extract from design references
  for (const ref of designRefs) {
    if (ref.startsWith('src/') || ref.startsWith('test/') || ref.startsWith('docs/')) {
      files.add(ref);
    }
  }

  // Extract from description
  // Pattern: "src/X/Y.ts" or "test/X/Y.test.ts" etc.
  const pathPattern = /\b((?:src|test|tests|docs|lib|app|backend|frontend|api|services|src\/modules|src\/components)\/[a-zA-Z0-9_\-/.]+(?:\.[a-z]+)?)\b/g;
  const pathMatches = description.matchAll(pathPattern);
  for (const m of pathMatches) {
    files.add(m[1]);
  }

  return Array.from(files);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasConflict(filesA: string[], filesB: string[]): boolean {
  if (filesA.length === 0 || filesB.length === 0) return false;

  for (const fileA of filesA) {
    for (const fileB of filesB) {
      if (fileOverlap(fileA, fileB)) return true;
    }
  }
  return false;
}

function fileOverlap(fileA: string, fileB: string): boolean {
  if (fileA === fileB) return true;

  // Directory overlap
  const dirA = fileA.split('/').slice(0, -1).join('/');
  const dirB = fileB.split('/').slice(0, -1).join('/');
  if (dirA && dirA === dirB) return true;

  // Wildcard pattern overlap (e.g., "src/auth/*" matches "src/auth/login.ts")
  if (fileA.endsWith('*')) {
    const prefix = fileA.slice(0, -1);
    if (fileB.startsWith(prefix)) return true;
  }
  if (fileB.endsWith('*')) {
    const prefix = fileB.slice(0, -1);
    if (fileA.startsWith(prefix)) return true;
  }

  return false;
}

function assessRisk(files: string[]): 'low' | 'medium' | 'high' | 'unknown' {
  if (files.length === 0) return 'unknown';
  if (files.length <= 2) return 'low';
  if (files.length <= 5) return 'medium';
  return 'high';
}
