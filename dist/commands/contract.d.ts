export interface ContractOptions {
    subcommand?: string;
    id?: string;
    version?: string;
    consumer?: string;
    notes?: string;
    producer?: string;
    json?: boolean;
}
export declare function contractCommand(projectRoot: string, options: ContractOptions): Promise<void>;
