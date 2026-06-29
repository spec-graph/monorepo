/**
 * Worktree Isolation Engine
 *
 * Manages per-unit git worktrees so parallel work on different tracks/changes
 * never stomps on shared working-tree state. Wraps a GitBackend (defaulting to
 * node:child_process) so tests can inject a fake without needing a real repo.
 *
 * Layout:
 *   <projectRoot>/
 *     .spec-graph/isolation/worktrees.yaml   ← persisted unit registry
 *     .worktrees/<unitId>/                    ← actual git worktree content
 *
 * Branch naming: spec-graph/<unitId>-<track>
 */
import { GitBackend, IsolationUnit, IsolationStatus } from "../../types/index";
export declare class ProcessGitBackend implements GitBackend {
    exec(args: string[], opts?: {
        cwd?: string;
    }): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    exists(p: string): Promise<boolean>;
}
export interface WorktreeManagerOptions {
    projectRoot: string;
    backend?: GitBackend;
    /** Override default worktree base directory (defaults to <projectRoot>/.worktrees) */
    worktreesDir?: string;
}
export interface CreateOptions {
    baseBranch?: string;
    /** Override branch name (defaults to spec-graph/<unitId>-<track>) */
    branch?: string;
}
export interface MergeResult {
    success: boolean;
    conflicts: string[];
    mergedCommit?: string;
    error?: string;
}
export declare class WorktreeManager {
    private projectRoot;
    private backend;
    private worktreesDir;
    private registryPath;
    constructor(opts: WorktreeManagerOptions);
    /**
     * Create a new worktree + branch for an isolation unit.
     */
    create(unitId: string, track: string, opts?: CreateOptions): Promise<IsolationUnit>;
    /**
     * List all isolation units (all statuses).
     */
    list(): Promise<IsolationUnit[]>;
    /**
     * List only units matching a given status.
     */
    listByStatus(status: IsolationStatus): Promise<IsolationUnit[]>;
    /**
     * Get a single unit by id.
     */
    get(unitId: string): Promise<IsolationUnit | null>;
    /**
     * Update an isolation unit's fields (status, timestamps, etc.).
     * Used by enriched lifecycle transitions (self-verify, submit, accept, reject).
     */
    update(unit: IsolationUnit): Promise<void>;
    /**
     * Remove a worktree from disk and mark the unit abandoned (or delete it).
     * Safe to call even if the worktree dir is already gone.
     */
    remove(unitId: string, opts?: {
        purge?: boolean;
    }): Promise<void>;
    /**
     * Dry-run conflict check + merge into target branch.
     * Returns success=true if merge would apply cleanly, with list of conflict files otherwise.
     *
     * Two-phase: first a `merge-tree` dry-run to detect conflicts without touching
     * the target branch; then (if dryRun=false) a real merge.
     */
    merge(unitId: string, targetBranch: string, opts?: {
        dryRun?: boolean;
        message?: string;
    }): Promise<MergeResult>;
    /**
     * Prune git's worktree metadata (removes references to worktrees that no
     * longer exist on disk). Useful for recovery.
     */
    prune(): Promise<void>;
    private git;
    private detectDefaultBranch;
    private loadRegistry;
    private saveRegistry;
}
/**
 * Parse git merge-tree output for conflict markers.
 * merge-tree emits "changed in both" sections with conflict blocks when both
 * sides modified the same region. We detect these by looking for the
 * "CONFLICT" marker or "base ... <filename>" header patterns.
 */
export declare function parseMergeTreeConflicts(output: string): string[];
