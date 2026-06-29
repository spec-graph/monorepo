export interface AnalyzeOptions {
    json?: boolean;
}
export declare function analyzeCommand(projectRoot: string, options: AnalyzeOptions): Promise<void>;
