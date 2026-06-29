import { execSync } from "node:child_process";
import path from "node:path";
import * as fs from "node:fs";
import { minimatch } from "minimatch";

/**
 * Get the list of files changed in git (relative to a base).
 *
 * @param projectRoot Project root directory
 * @param baseRef Git ref to diff against (default: HEAD)
 * @returns Array of changed file paths (relative to project root)
 */
export function getChangedFiles(
  projectRoot: string,
  baseRef: string = "HEAD",
): string[] {
  try {
    // Check if .git exists
    if (!fs.existsSync(path.join(projectRoot, ".git"))) {
      return [];
    }

    // Get list of changed files
    const output = execSync(`git diff --name-only ${baseRef}`, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
    });

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    // Not a git repo, or git not available, or no commits yet
    return [];
  }
}

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
export function matchesTouchfiles(
  filePath: string,
  globs: string[],
): boolean {
  return globs.some((glob) => minimatch(filePath, glob));
}

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
export function shouldRunCheck(
  touchfiles: string[] | undefined,
  changedFiles: string[],
): boolean {
  if (!touchfiles || touchfiles.length === 0) {
    return true; // No touchfiles = always run
  }

  if (changedFiles.length === 0) {
    return true; // No git diff info = run conservatively
  }

  return changedFiles.some((file) => matchesTouchfiles(file, touchfiles));
}
