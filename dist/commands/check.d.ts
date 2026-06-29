export interface CheckOptions {
    id?: string;
    layer?: string;
    dryRun?: boolean;
    timeout?: string;
    json?: boolean;
}
export declare function checkCommand(projectRoot: string, options: CheckOptions): Promise<void>;
