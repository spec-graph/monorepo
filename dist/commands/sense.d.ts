export interface SenseOptions {
    output?: string;
    showSignals?: boolean;
    build?: string;
    profileOverride?: string;
    description?: string;
    llmClassify?: boolean;
}
export declare function senseCommand(projectRoot: string, options: SenseOptions): Promise<void>;
