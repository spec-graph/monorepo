/**
 * Scope-Lock Engine
 *
 * Validates that a set of changed files stays within the boundaries declared
 * by a ScopeLockDecl. Inherited from wdf-method's scope-lock.ts concept:
 * each isolation unit declares allowed / protected / forbidden paths, and
 * any change that violates those boundaries is either blocked (strict mode)
 * or surfaced as a warning (warn mode).
 *
 * Globs support:
 *   *   → matches any characters within a single path segment
 *   **  → matches any characters across path segments
 *   ?   → matches a single character
 *
 * All paths are relative to the project root.
 */

import { ScopeLockDecl, EnforcementMode } from "../../types/index";

// ============ Public API ============

export type ViolationKind =
  | "not-allowed"
  | "protected-modified"
  | "forbidden-touched";

export interface ScopeViolation {
  file: string;
  kind: ViolationKind;
  message: string;
}

export interface ScopeValidationResult {
  passed: boolean;
  enforcement_mode: EnforcementMode;
  violations: ScopeViolation[];
}

/**
 * Validate a set of changed files against a scope lock.
 *
 * Rules:
 *   1. forbidden_paths: any match → violation (regardless of allowed/protected)
 *   2. protected_paths: write violations (any match = protected-modified)
 *   3. allowed_paths: files outside allowed → not-allowed violation
 *      (only enforced if allowed_paths is non-empty — empty = "anything not forbidden")
 */
export function validateScopeLock(
  changedFiles: string[],
  lock: ScopeLockDecl,
): ScopeValidationResult {
  const violations: ScopeViolation[] = [];

  for (const file of changedFiles) {
    const normalized = normalizePath(file);

    // 1. Forbidden — trumps everything
    if (matchesAny(normalized, lock.forbidden_paths)) {
      violations.push({
        file,
        kind: "forbidden-touched",
        message: `'${file}' is in a forbidden path`,
      });
      continue;
    }

    // 2. Protected — may read but not modify
    if (matchesAny(normalized, lock.protected_paths)) {
      violations.push({
        file,
        kind: "protected-modified",
        message: `'${file}' is in a protected path (read-only)`,
      });
      continue;
    }

    // 3. Allowed — if allowlist is non-empty, files must be in it
    if (
      lock.allowed_paths.length > 0 &&
      !matchesAny(normalized, lock.allowed_paths)
    ) {
      violations.push({
        file,
        kind: "not-allowed",
        message: `'${file}' is outside allowed paths`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    enforcement_mode: lock.enforcement_mode,
    violations,
  };
}

/**
 * Validate actual changes (as file+status pairs) against a scope lock.
 * Status 'D' (deleted) and 'M'/'A'/'R' are all treated as modifications.
 * This variant is for post-hoc audits rather than pre-commit validation.
 */
export function validateActualChangesAgainstScope(
  changes: Array<{ file: string; status: string }>,
  lock: ScopeLockDecl,
): ScopeValidationResult {
  return validateScopeLock(
    changes.map((c) => c.file),
    lock,
  );
}

/**
 * Render a human-readable summary of validation results.
 */
export function summarizeViolations(result: ScopeValidationResult): string {
  if (result.passed) {
    return `Scope lock OK (${result.enforcement_mode})`;
  }
  const byKind: Record<ViolationKind, number> = {
    "not-allowed": 0,
    "protected-modified": 0,
    "forbidden-touched": 0,
  };
  for (const v of result.violations) byKind[v.kind]++;

  const mode = result.enforcement_mode === "strict" ? "STRICT" : "WARN";
  const parts = [
    byKind["forbidden-touched"] > 0
      ? `${byKind["forbidden-touched"]} forbidden`
      : null,
    byKind["protected-modified"] > 0
      ? `${byKind["protected-modified"]} protected`
      : null,
    byKind["not-allowed"] > 0 ? `${byKind["not-allowed"]} not-allowed` : null,
  ].filter(Boolean);
  return `Scope lock FAIL [${mode}]: ${parts.join(", ")} (${result.violations.length} violation(s))`;
}

// ============ Prefix overlap detection ============

export interface ScopeOverlap {
  path: string;
  lock_a: string;
  lock_b: string;
  kind: "exact" | "prefix" | "nested";
}

/**
 * Detect prefix overlaps between two or more scope locks.
 *
 * Checks if any scope lock's allowed paths contain another lock's paths
 * as subdirectories (prefix overlap) or exact duplicates. This prevents
 * parallel agents from accidentally modifying nested paths in the same
 * module, causing messy merge conflicts.
 *
 * Overlap kinds:
 *   - exact: two locks declare the exact same path
 *   - prefix: lock A's path is a prefix of lock B's path (e.g., src/a and src/a/utils)
 *   - nested: lock B's path is nested inside lock A's path
 *
 * @param locks Map of unit_id → ScopeLockDecl
 * @returns Array of detected overlaps
 */
export function detectScopeOverlaps(
  locks: Record<string, ScopeLockDecl>,
): ScopeOverlap[] {
  const overlaps: ScopeOverlap[] = [];
  const unitIds = Object.keys(locks);

  for (let i = 0; i < unitIds.length; i++) {
    for (let j = i + 1; j < unitIds.length; j++) {
      const lockA = locks[unitIds[i]];
      const lockB = locks[unitIds[j]];

      for (const pathA of lockA.allowed_paths) {
        for (const pathB of lockB.allowed_paths) {
          // Normalize paths for comparison
          const normA = normalizeScopePath(pathA);
          const normB = normalizeScopePath(pathB);

          // Exact match
          if (normA === normB) {
            overlaps.push({
              path: normA,
              lock_a: unitIds[i],
              lock_b: unitIds[j],
              kind: "exact",
            });
            continue;
          }

          // Prefix check: does A start with B/ or B start with A/?
          if (normA.startsWith(normB + "/")) {
            overlaps.push({
              path: normA,
              lock_a: unitIds[i],
              lock_b: unitIds[j],
              kind: "nested",
            });
          } else if (normB.startsWith(normA + "/")) {
            overlaps.push({
              path: normB,
              lock_a: unitIds[i],
              lock_b: unitIds[j],
              kind: "nested",
            });
          }
          // Also check: is A a direct prefix of B or vice versa
          else if (normB.startsWith(normA) && normB !== normA) {
            overlaps.push({
              path: normB,
              lock_a: unitIds[i],
              lock_b: unitIds[j],
              kind: "prefix",
            });
          } else if (normA.startsWith(normB) && normA !== normB) {
            overlaps.push({
              path: normA,
              lock_a: unitIds[i],
              lock_b: unitIds[j],
              kind: "prefix",
            });
          }
        }
      }
    }
  }

  return overlaps;
}

/**
 * Normalize a scope-lock path for overlap comparison.
 * Strips glob characters to get the base directory path.
 * e.g., "src/a/**" → "src/a"
 */
function normalizeScopePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/?\*?\*?$/, "")     // Remove trailing /** or /*
    .replace(/\/?\*$/, "")          // Remove trailing *
    .replace(/^\.?\//, "");         // Remove leading ./
}

// ============ Glob matcher ============

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchGlob(path, p));
}

/**
 * Minimal glob matcher supporting *, **, and ?.
 * Does not support character classes or brace expansion — sufficient for
 * scope-lock path patterns.
 */
export function matchGlob(path: string, pattern: string): boolean {
  const regexStr = globToRegex(pattern);
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

function globToRegex(glob: string): string {
  let result = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** — match across path separators
        // **/ at start or after / → zero or more directory segments
        // /** at end or before / → zero or more directory segments
        // Otherwise treat as equivalent to *
        if (glob[i + 2] === "/") {
          result += "(?:.+/)?";
          i += 3;
        } else if (glob[i - 1] === "/") {
          result += ".*";
          i += 2;
        } else {
          result += ".*";
          i += 2;
        }
      } else {
        // * — match within a single segment (no slashes)
        result += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      result += "[^/]";
      i++;
    } else if (c === ".") {
      result += "\\.";
      i++;
    } else if ("+()|^$[]{}".includes(c)) {
      result += "\\" + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  return result;
}
