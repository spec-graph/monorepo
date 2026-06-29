export interface ScopeOptions {
    subcommand?: string;
    unitId?: string;
    allowed?: string;
    protected?: string;
    forbidden?: string;
    mode?: string;
    files?: string;
    json?: boolean;
}
export declare function scopeCommand(projectRoot: string, options: ScopeOptions): Promise<void>;
