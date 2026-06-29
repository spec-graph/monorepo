export interface MigrateOptions {
    json?: boolean;
}
export declare function migrateCommand(projectRoot: string, options: MigrateOptions): Promise<void>;
