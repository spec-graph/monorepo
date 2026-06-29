export interface TraceOptions {
    direction?: "forward" | "backward";
    nodeType?: string;
    from?: string;
    to?: string;
    via?: string;
    relation?: string;
    json?: boolean;
}
export declare function traceCommand(projectRoot: string, arg: string | undefined, options: TraceOptions): Promise<void>;
