/**
 * Workflow Visualization
 *
 * Generate Graphviz DOT files for visual representation of the workflow graph.
 * Artifacts are nodes, trace edges are arrows, gates are clusters.
 */
import { Graph } from "../../types/index";
/**
 * Generate Graphviz DOT representation of the workflow graph.
 */
export declare function generateDot(projectRoot: string, graph: Graph): Promise<string>;
/**
 * Generate Mermaid flowchart representation of the workflow graph.
 */
export declare function generateMermaid(projectRoot: string, graph: Graph): Promise<string>;
/**
 * Generate a summary of the workflow graph for JSON output.
 */
export declare function generateSummary(graph: Graph): any;
