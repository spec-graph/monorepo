export interface DistillCommandOptions {
    artifact: string;
    save?: boolean;
    maxLength?: string;
    json?: boolean;
}
export declare function distillCommand(projectRoot: string, options: DistillCommandOptions): Promise<void>;
