export interface ProfileOptions {
    subcommand?: string;
    pairs?: string;
}
export declare function profileCommand(projectRoot: string, options: ProfileOptions): Promise<void>;
