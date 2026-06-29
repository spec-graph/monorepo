/**
 * Get the list of files changed in git (relative to a base).
 *
 * @param projectRoot Project root directory
 * @param baseRef Git ref to diff against (default: HEAD)
 * @returns Array of changed file paths (relative to project root)
 */
export declare function getChangedFiles(projectRoot: string, baseRef?: string): string[];
/**
 * Check if a file path matches any of the touchfile globs.
 *
 * Uses minimatch for glob matching. Supports:
 *   - ** for recursive matching
 *   - * for single-level matching
 *   - ? for single character
 *
 * @param filePath File path to check (relative to project root)
 * @param globs Array of glob patterns
 * @returns true if filePath matches any glob
 */
export declare function matchesTouchfiles(filePath: string, globs: string[]): boolean;
/**
 * Determine if a check should run based on touchfiles and changed files.
 *
 * Rules:
 *   - If touchfiles is undefined or empty, always run (backward compat)
 *   - If touchfiles is set, only run if any changed file matches
 *   - If changedFiles is empty (no git diff), still run (conservative)
 *
 * @param touchfiles Check's touchfile globs
 * @param changedFiles List of changed files from git diff
 * @returns true if the check should run
 */
export declare function shouldRunCheck(touchfiles: string[] | undefined, changedFiles: string[]): boolean;
