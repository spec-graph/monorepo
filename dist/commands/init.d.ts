export interface InitOptions {
    force?: boolean;
    description?: string;
    permissionLevel?: string;
    quick?: boolean;
    build?: string;
    profileOverride?: string;
    llmClassify?: boolean;
}
export declare function initCommand(projectRoot: string, options: InitOptions): Promise<void>;
