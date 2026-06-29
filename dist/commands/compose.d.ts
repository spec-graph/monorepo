export interface ComposeOptions {
    changeType?: string;
    output?: string;
}
export declare function composeCommand(projectRoot: string, options: ComposeOptions): Promise<void>;
