export interface RollbackOptions {
    changeId?: string;
    dryRun?: boolean;
}
/**
 * Safely rollback a change to its pre-change state.
 * Uses safety-net snapshots to restore files, or git revert if git is available.
 */
export declare function rollbackCommand(projectRoot: string, options: RollbackOptions): Promise<void>;
