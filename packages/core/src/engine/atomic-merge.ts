/**
 * Atomic Merge Guard
 *
 * Provides atomic "merge-then-verify-then-commit-or-abort" semantics.
 * Uses `git merge --no-commit --no-ff` to stage changes, runs exit gate
 * checks, and either commits (all pass) or aborts (any fail).
 *
 * This prevents broken code from ever reaching the target branch.
 */

import { execSync } from "node:child_process";
import { runCheck } from "./check/index";
import { CheckDecl } from "../types/index";

export interface AtomicMergeResult {
  success: boolean;
  unit_id: string;
  target_branch: string;
  checks_passed: number;
  checks_failed: number;
  aborted: boolean;
  commit_sha?: string;
  failure_reason?: string;
}

/**
 * Perform an atomic merge:
 * 1. git merge --no-commit --no-ff <unit-branch> into <target-branch>
 * 2. Run exit gate checks
 * 3. All pass → git commit
 * 4. Any fail → git merge --abort
 */
export async function atomicMerge(
  projectRoot: string,
  unitBranch: string,
  targetBranch: string,
  exitChecks: CheckDecl[],
): Promise<AtomicMergeResult> {
  const result: AtomicMergeResult = {
    success: false,
    unit_id: unitBranch,
    target_branch: targetBranch,
    checks_passed: 0,
    checks_failed: 0,
    aborted: false,
  };

  try {
    // Step 1: Start merge (no-commit, no-ff)
    execSync(`git checkout ${targetBranch}`, { cwd: projectRoot });
    try {
      execSync(`git merge --no-commit --no-ff ${unitBranch}`, {
        cwd: projectRoot,
        stdio: "pipe",
      });
    } catch (e: any) {
      // Merge conflict
      execSync("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
      result.aborted = true;
      result.failure_reason = "Merge conflict";
      return result;
    }

    // Step 2: Run exit gate checks
    let allPassed = true;
    for (const check of exitChecks) {
      try {
        const checkResult = await runCheck(check, {
          cwd: projectRoot,
          timeoutMs: 30000,
        });
        if (checkResult.status === "passed") {
          result.checks_passed++;
        } else {
          result.checks_failed++;
          allPassed = false;
          break;
        }
      } catch {
        result.checks_failed++;
        allPassed = false;
        break;
      }
    }

    if (allPassed) {
      // Step 3: Commit
      const commitMsg = `Merge ${unitBranch} into ${targetBranch}`;
      const sha = execSync(`git commit -m "${commitMsg}"`, {
        cwd: projectRoot,
      })
        .toString()
        .split("\n")[0];
      result.success = true;
      result.commit_sha = sha;
    } else {
      // Step 4: Abort
      execSync("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
      result.aborted = true;
      result.failure_reason = `${result.checks_failed} exit check(s) failed`;
    }

    return result;
  } catch (e: any) {
    result.aborted = true;
    result.failure_reason = e.message;
    // Try to abort to clean up
    try {
      execSync("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
    } catch {
      // Ignore abort failures
    }
    return result;
  }
}
