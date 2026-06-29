import { Graph, ContractRegistryEntry } from "../../types/index";
export interface GateEvaluationResult {
    gate_id: string;
    passed: boolean;
    missing_artifacts: string[];
    missing_checks: string[];
    missing_traces: string[];
    missing_contracts: string[];
    violated_forbids: string[];
    warnings: string[];
}
export interface EnforceResult {
    evaluated_gates: GateEvaluationResult[];
    blocking_gates: string[];
    all_passed: boolean;
}
export interface EnforceOptions {
    phase?: string;
}
export declare function runEnforce(projectRoot: string, graph: Graph, options?: EnforceOptions): Promise<EnforceResult>;
export declare function loadForbiddenInvariants(projectRoot: string): Promise<Set<string>>;
export declare function loadContractRegistry(projectRoot: string): Promise<ContractRegistryEntry[]>;
export declare function collectDriftedConsumers(entries: ContractRegistryEntry[]): Array<{
    contract: string;
    consumer: string;
    status: string;
    bound: string;
    current: string;
}>;
