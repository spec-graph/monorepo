export interface MachineOptions {
    stage?: string;
    from?: string;
    to?: string;
    action?: string;
    artifact?: string;
    check?: string;
    status?: string;
    restartStage?: boolean;
    projectRoot?: string;
}
export declare function machineCommand(projectRoot: string, subcommand: string, options: MachineOptions): Promise<void>;
