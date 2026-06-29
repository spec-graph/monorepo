export interface RetroOptions {
    changeId?: string;
}
/**
 * Generate a retrospective document for a completed change.
 * Captures what worked, what didn't, and action items for future changes.
 */
export declare function retroCommand(projectRoot: string, options: RetroOptions): Promise<void>;
