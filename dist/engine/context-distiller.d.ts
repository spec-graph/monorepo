/**
 * Context Distiller
 *
 * Walks the trace graph from a given artifact to find the minimal set of
 * relevant upstream artifacts. This reduces token cost by sending only
 * the context that's directly related to the current action, not the
 * entire project context.
 *
 * Algorithm: reverse BFS (upstream traversal) from action.id, limited to
 * N hops (default 3). Collects all reachable artifacts that are completed.
 */
import { Graph } from "../types/index";
import { TraceIndex } from "./trace/index";
import { MachineState } from "./machine/index";
export interface DistilledContext {
    /** The source action that triggered distillation */
    source: string;
    /** All relevant upstream artifacts (BFS closure) */
    relevant_artifacts: Array<{
        id: string;
        kind: string;
        status: string;
        hops: number;
    }>;
    /** Total artifact count (for logging) */
    total: number;
}
/**
 * Distill context for a given action by walking the trace graph upstream.
 *
 * @param actionId The artifact/action ID to distill context for
 * @param graph The workflow graph
 * @param traceIndex The trace index (edges + nodes)
 * @param state Current machine state
 * @param maxHops BFS depth limit (default 3)
 */
export declare function distillContext(actionId: string, graph: Graph, traceIndex: TraceIndex, state: MachineState, maxHops?: number): DistilledContext;
