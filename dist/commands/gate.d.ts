export interface GateOptions {
    phase?: string;
}
export declare function gateCommand(projectRoot: string, options: GateOptions): Promise<void>;
