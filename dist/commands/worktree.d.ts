export interface WorktreeOptions {
    subcommand?: string;
    unitId?: string;
    track?: string;
    to?: string;
    dryRun?: boolean;
    branch?: string;
    baseBranch?: string;
    purge?: boolean;
    json?: boolean;
    reason?: string;
    reviewedBy?: string;
}
export declare function worktreeCommand(projectRoot: string, options: WorktreeOptions): Promise<void>;
