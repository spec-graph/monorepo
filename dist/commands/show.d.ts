export interface ShowOptions {
    format?: "table" | "json";
}
export declare function showCommand(projectRoot: string, options: ShowOptions): Promise<void>;
