export interface PermissionsOptions {
    subcommand?: string;
    level?: string;
    force?: boolean;
    json?: boolean;
}
export declare function permissionsCommand(projectRoot: string, options: PermissionsOptions): Promise<void>;
