import { Graph, TraceQuery } from "../../types/index";
export interface TraceResult {
    query: string;
    found: boolean;
    path: TracePath[];
}
export interface TracePath {
    node_id: string;
    node_type: "requirement" | "artifact" | "check" | "gate" | "track";
    metadata: Record<string, any>;
}
export interface TraceIndex {
    nodes: Map<string, TraceNode>;
    edges: TraceEdge[];
}
export interface TraceNode {
    id: string;
    type: "requirement" | "artifact" | "check" | "gate" | "track";
    metadata: Record<string, any>;
}
export interface TraceEdge {
    from: string;
    to: string;
    relation: string;
    metadata?: Record<string, any>;
}
export interface TraceQueryEvaluation {
    name: string;
    passed: boolean;
    source_count: number;
    target_count: number;
    match_count: number;
    missing_reason?: string;
}
/**
 * Build a traceability index from the graph
 */
export declare function buildTraceIndex(projectRoot: string, graph: Graph): Promise<TraceIndex>;
export declare function evaluateTraceQuery(index: TraceIndex, query: TraceQuery): TraceQueryEvaluation;
export declare function traceBackward(index: TraceIndex, nodeId: string): TraceResult;
/**
 * Trace forward from a requirement to its implementations
 */
export declare function traceForward(index: TraceIndex, nodeId: string): TraceResult;
/**
 * List all nodes in the trace index
 */
export declare function listTraceNodes(index: TraceIndex): TraceNode[];
