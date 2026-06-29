export interface MergeQueueOptions {
    subcommand?: string;
    unitId?: string;
    files?: string;
    target?: string;
    reason?: string;
    json?: boolean;
}
export declare function mergeQueueCommand(projectRoot: string, options: MergeQueueOptions): Promise<void>;
