export interface VisualizeOptions {
    format?: string;
    output?: string;
}
export declare function visualizeCommand(projectRoot: string, options: VisualizeOptions): Promise<void>;
