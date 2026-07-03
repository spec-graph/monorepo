/**
 * ScopeLock — validates sub-agent file access against allowed/protected/forbidden paths.
 *
 * After a sub-agent completes work in a worktree, the scope-lock check
 * verifies that the agent didn't write to forbidden paths or modify
 * protected paths.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScopeLockCheck {
  allowedPaths: string[];  // globs — may read AND write
  protectedPaths: string[]; // globs — may read, must not modify
  forbiddenPaths: string[]; // globs — must not touch at all
}

export interface ScopeViolation {
  type: 'forbidden' | 'protected-modified';
  path: string;
  rule: string;
}

export interface ScopeLockResult {
  clean: boolean;
  violations: ScopeViolation[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Check a worktree for scope lock violations.
 *
 * Scans files in the worktree that have been modified (compared to base commit)
 * and checks each against the scope lock rules.
 */
export function checkScopeLock(
  worktreePath: string,
  lock: ScopeLockCheck,
  changedFiles: string[],
): ScopeLockResult {
  const violations: ScopeViolation[] = [];

  for (const file of changedFiles) {
    const absPath = path.isAbsolute(file) ? file : path.join(worktreePath, file);

    // Check forbidden
    for (const pattern of lock.forbiddenPaths) {
      if (matchesGlob(file, pattern)) {
        violations.push({
          type: 'forbidden',
          path: file,
          rule: pattern,
        });
        break;
      }
    }

    // Check protected (modified)
    for (const pattern of lock.protectedPaths) {
      if (matchesGlob(file, pattern)) {
        // Check if file was actually modified
        if (fs.existsSync(absPath)) {
          violations.push({
            type: 'protected-modified',
            path: file,
            rule: pattern,
          });
        }
        break;
      }
    }
  }

  return {
    clean: violations.length === 0,
    violations,
  };
}

/**
 * Simple glob matching (supports * and **).
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // 1. Escape literal dots first
  // 2. Replace ** with placeholder
  // 3. Replace * with [^/]*
  // 4. Replace placeholder with .*
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}
