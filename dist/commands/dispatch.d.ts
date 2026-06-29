export interface DispatchOptions {
    json?: boolean;
    all?: boolean;
    output?: string;
}
export declare function dispatchCommand(projectRoot: string, options: DispatchOptions): Promise<void>;
