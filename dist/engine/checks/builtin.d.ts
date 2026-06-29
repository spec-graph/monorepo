/**
 * Built-in Check Implementations
 *
 * Replaces <placeholder> commands in graph.yaml with real,
 * deterministic checks operating on project files and spec-graph state.
 */
import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";
export interface BuiltinCheckContext {
    projectRoot: string;
    graph: Graph;
    state: MachineState;
}
export interface BuiltinCheckResult {
    passed: boolean;
    exit_code: number;
    stdout: string;
    stderr: string;
    details?: Record<string, any>;
}
export type BuiltinCheckFn = (ctx: BuiltinCheckContext) => Promise<BuiltinCheckResult>;
export declare const builtinChecks: Record<string, BuiltinCheckFn>;
export declare function isBuiltinCheck(command: string): boolean;
export declare function extractBuiltinName(command: string): string | null;
export declare function runBuiltinCheck(name: string, ctx: BuiltinCheckContext): Promise<BuiltinCheckResult>;
