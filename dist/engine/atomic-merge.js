"use strict";
/**
 * Atomic Merge Guard
 *
 * Provides atomic "merge-then-verify-then-commit-or-abort" semantics.
 * Uses `git merge --no-commit --no-ff` to stage changes, runs exit gate
 * checks, and either commits (all pass) or aborts (any fail).
 *
 * This prevents broken code from ever reaching the target branch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.atomicMerge = atomicMerge;
const node_child_process_1 = require("node:child_process");
const index_1 = require("./check/index");
/**
 * Perform an atomic merge:
 * 1. git merge --no-commit --no-ff <unit-branch> into <target-branch>
 * 2. Run exit gate checks
 * 3. All pass → git commit
 * 4. Any fail → git merge --abort
 */
async function atomicMerge(projectRoot, unitBranch, targetBranch, exitChecks) {
    const result = {
        success: false,
        unit_id: unitBranch,
        target_branch: targetBranch,
        checks_passed: 0,
        checks_failed: 0,
        aborted: false,
    };
    try {
        // Step 1: Start merge (no-commit, no-ff)
        (0, node_child_process_1.execSync)(`git checkout ${targetBranch}`, { cwd: projectRoot });
        try {
            (0, node_child_process_1.execSync)(`git merge --no-commit --no-ff ${unitBranch}`, {
                cwd: projectRoot,
                stdio: "pipe",
            });
        }
        catch (e) {
            // Merge conflict
            (0, node_child_process_1.execSync)("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
            result.aborted = true;
            result.failure_reason = "Merge conflict";
            return result;
        }
        // Step 2: Run exit gate checks
        let allPassed = true;
        for (const check of exitChecks) {
            try {
                const checkResult = await (0, index_1.runCheck)(check, {
                    cwd: projectRoot,
                    timeoutMs: 30000,
                });
                if (checkResult.status === "passed") {
                    result.checks_passed++;
                }
                else {
                    result.checks_failed++;
                    allPassed = false;
                    break;
                }
            }
            catch {
                result.checks_failed++;
                allPassed = false;
                break;
            }
        }
        if (allPassed) {
            // Step 3: Commit
            const commitMsg = `Merge ${unitBranch} into ${targetBranch}`;
            const sha = (0, node_child_process_1.execSync)(`git commit -m "${commitMsg}"`, {
                cwd: projectRoot,
            })
                .toString()
                .split("\n")[0];
            result.success = true;
            result.commit_sha = sha;
        }
        else {
            // Step 4: Abort
            (0, node_child_process_1.execSync)("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
            result.aborted = true;
            result.failure_reason = `${result.checks_failed} exit check(s) failed`;
        }
        return result;
    }
    catch (e) {
        result.aborted = true;
        result.failure_reason = e.message;
        // Try to abort to clean up
        try {
            (0, node_child_process_1.execSync)("git merge --abort", { cwd: projectRoot, stdio: "pipe" });
        }
        catch {
            // Ignore abort failures
        }
        return result;
    }
}
//# sourceMappingURL=atomic-merge.js.map