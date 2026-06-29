export interface StatusOptions {
    json?: boolean;
}
export declare function statusCommand(projectRoot: string, options: StatusOptions): Promise<void>;
