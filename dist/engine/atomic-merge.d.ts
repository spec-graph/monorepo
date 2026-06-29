/**
 * Atomic Merge Guard
 *
 * Provides atomic "merge-then-verify-then-commit-or-abort" semantics.
 * Uses `git merge --no-commit --no-ff` to stage changes, runs exit gate
 * checks, and either commits (all pass) or aborts (any fail).
 *
 * This prevents broken code from ever reaching the target branch.
 */
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
export declare function atomicMerge(projectRoot: string, unitBranch: string, targetBranch: string, exitChecks: CheckDecl[]): Promise<AtomicMergeResult>;
