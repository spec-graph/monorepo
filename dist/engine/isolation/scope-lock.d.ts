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
export type ViolationKind = "not-allowed" | "protected-modified" | "forbidden-touched";
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
export declare function validateScopeLock(changedFiles: string[], lock: ScopeLockDecl): ScopeValidationResult;
/**
 * Validate actual changes (as file+status pairs) against a scope lock.
 * Status 'D' (deleted) and 'M'/'A'/'R' are all treated as modifications.
 * This variant is for post-hoc audits rather than pre-commit validation.
 */
export declare function validateActualChangesAgainstScope(changes: Array<{
    file: string;
    status: string;
}>, lock: ScopeLockDecl): ScopeValidationResult;
/**
 * Render a human-readable summary of validation results.
 */
export declare function summarizeViolations(result: ScopeValidationResult): string;
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
export declare function detectScopeOverlaps(locks: Record<string, ScopeLockDecl>): ScopeOverlap[];
/**
 * Minimal glob matcher supporting *, **, and ?.
 * Does not support character classes or brace expansion — sufficient for
 * scope-lock path patterns.
 */
export declare function matchGlob(path: string, pattern: string): boolean;
