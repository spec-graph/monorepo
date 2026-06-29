export interface RunOptions {
    maxSteps?: string;
    timeout?: string;
    dryRun?: boolean;
    json?: boolean;
    includePeriodic?: boolean;
    baseRef?: string;
    noDiffSelect?: boolean;
    /**
     * Maximum retry attempts for failed checks (default: 0 = no retry).
     * When > 0, failed checks are retried after a backoff delay.
     */
    retries?: string;
    /**
     * Backoff strategy for retries: 'fixed' (default), 'linear', 'exponential'.
     * Base delay is 1000ms.
     */
    backoff?: "fixed" | "linear" | "exponential";
}
export declare function runCommand(projectRoot: string, options: RunOptions): Promise<void>;
