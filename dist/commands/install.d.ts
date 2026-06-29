export interface InstallOptions {
    ide?: string;
    target?: string;
    quick?: boolean;
    force?: boolean;
    json?: boolean;
    description?: string;
    permissionLevel?: string;
    syncAgentConfig?: boolean;
    gitHooks?: boolean;
}
export declare function installCommand(projectRoot: string, options: InstallOptions): Promise<void>;
