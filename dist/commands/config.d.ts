export interface ConfigOptions {
    subcommand?: string;
    pairs?: string;
    json?: boolean;
}
export declare function configCommand(projectRoot: string, options: ConfigOptions): Promise<void>;
