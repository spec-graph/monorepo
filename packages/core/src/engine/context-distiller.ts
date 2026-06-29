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

import { Graph, ArtifactDecl } from "../types/index";
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
export function distillContext(
  actionId: string,
  graph: Graph,
  traceIndex: TraceIndex,
  state: MachineState,
  maxHops: number = 3,
): DistilledContext {
  const visited = new Set<string>();
  const result: DistilledContext["relevant_artifacts"] = [];
  const queue: Array<{ id: string; hops: number }> = [{ id: actionId, hops: 0 }];

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    if (visited.has(id)) continue;
    if (hops > maxHops) continue;
    visited.add(id);

    // Look up artifact declaration
    const artifactDecl = (graph.artifacts || []).find((a: ArtifactDecl) => a.id === id);
    const artifactState = state.artifacts[id];

    // Add to results if it's a real artifact with content
    if (artifactDecl && artifactState) {
      result.push({
        id,
        kind: artifactDecl.kind,
        status: artifactState.status,
        hops,
      });
    }

    // Find upstream artifacts (trace edges pointing TO this artifact)
    for (const edge of traceIndex.edges) {
      if (edge.to === id && !visited.has(edge.from)) {
        queue.push({ id: edge.from, hops: hops + 1 });
      }
    }

    // Also follow artifact kind relationships (e.g., story → requirement)
    if (artifactDecl) {
      for (const otherDecl of graph.artifacts || []) {
        if (otherDecl.id === id) continue;
        if (visited.has(otherDecl.id)) continue;

        // Check if there's a producer/consumer relationship
        if (
          artifactDecl.default_consumers?.includes(otherDecl.id) ||
          otherDecl.default_consumers?.includes(id)
        ) {
          queue.push({ id: otherDecl.id, hops: hops + 1 });
        }
      }
    }
  }

  // Sort by hops (closest first), then by kind
  result.sort((a, b) => a.hops - b.hops);

  return {
    source: actionId,
    relevant_artifacts: result,
    total: result.length,
  };
}
