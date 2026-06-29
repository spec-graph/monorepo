/**
 * Impact Analysis Engine
 *
 * Computes the "blast radius" of changes to artifacts.
 * Uses trace edges and check dependencies to identify downstream impact.
 */

import { Graph, ArtifactDecl, CheckDecl } from "../../types/index";
import { buildTraceIndex, TraceIndex } from "../trace/index";

export interface ImpactAnalysis {
  /** The artifact that changed */
  source: string;
  /** Direct downstream artifacts (1 hop) */
  directDependencies: string[];
  /** Transitive downstream artifacts (all hops) */
  transitiveDependencies: string[];
  /** Checks that depend on the source artifact */
  affectedChecks: string[];
  /** Gates that might be affected */
  affectedGates: string[];
}

/**
 * Compute the impact of a change to an artifact.
 * Returns all downstream artifacts and checks that might be affected.
 */
export async function analyzeImpact(
  projectRoot: string,
  graph: Graph,
  sourceArtifactId: string,
): Promise<ImpactAnalysis> {
  const traceIndex = await buildTraceIndex(projectRoot, graph);

  // Find direct downstream dependencies (artifacts that depend on source)
  const directDependencies = findDirectDependencies(
    sourceArtifactId,
    traceIndex,
    graph,
  );

  // Compute transitive closure (all downstream dependencies)
  const transitiveDependencies = computeTransitiveClosure(
    sourceArtifactId,
    traceIndex,
    graph,
  );

  // Find checks that depend on source or its dependencies
  const affectedChecks = findAffectedChecks(
    [sourceArtifactId, ...transitiveDependencies],
    graph,
  );

  // Find gates that might be affected
  const affectedGates = findAffectedGates(affectedChecks, graph);

  return {
    source: sourceArtifactId,
    directDependencies,
    transitiveDependencies,
    affectedChecks,
    affectedGates,
  };
}

/**
 * Find artifacts that directly depend on the source artifact via trace edges.
 */
function findDirectDependencies(
  sourceId: string,
  traceIndex: TraceIndex,
  graph: Graph,
): string[] {
  const dependencies: string[] = [];

  // Trace edges are from -> to, so we want edges where source is 'from'
  // and we want to find all 'to' artifacts (downstream)
  for (const edge of traceIndex.edges) {
    if (edge.from === sourceId) {
      dependencies.push(edge.to);
    }
  }

  return [...new Set(dependencies)];
}

/**
 * Compute transitive closure of dependencies (BFS).
 */
function computeTransitiveClosure(
  sourceId: string,
  traceIndex: TraceIndex,
  graph: Graph,
): string[] {
  const visited = new Set<string>();
  const queue = [sourceId];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find direct dependencies
    const direct = findDirectDependencies(current, traceIndex, graph);
    for (const dep of direct) {
      if (!visited.has(dep)) {
        result.push(dep);
        queue.push(dep);
      }
    }
  }

  return [...new Set(result)];
}

/**
 * Find checks that depend on any of the given artifacts.
 * A check "depends on" an artifact if it validates that artifact.
 */
function findAffectedChecks(artifactIds: string[], graph: Graph): string[] {
  const affected: string[] = [];

  // For now, we assume all checks might be affected by any artifact change
  // In the future, we could add explicit check -> artifact dependencies
  // For now, we conservatively assume all checks are affected
  for (const check of graph.checks) {
    affected.push(check.id);
  }

  return [...new Set(affected)];
}

/**
 * Find gates that might be affected by the given checks.
 */
function findAffectedGates(checkIds: string[], graph: Graph): string[] {
  const affected: string[] = [];

  for (const gate of graph.gates) {
    // Gate is affected if it requires any of the affected checks
    const gateChecks = gate.require_checks || [];
    if (gateChecks.some((c: string) => checkIds.includes(c))) {
      affected.push(gate.id);
    }
  }

  return [...new Set(affected)];
}

/**
 * Format impact analysis for display.
 */
export function formatImpactAnalysis(impact: ImpactAnalysis): string {
  const lines: string[] = [];

  lines.push(`## Impact Analysis: ${impact.source}`);
  lines.push("");

  lines.push(`### Direct Dependencies (${impact.directDependencies.length})`);
  if (impact.directDependencies.length > 0) {
    for (const dep of impact.directDependencies) {
      lines.push(`- ${dep}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  lines.push(
    `### Transitive Dependencies (${impact.transitiveDependencies.length})`,
  );
  if (impact.transitiveDependencies.length > 0) {
    for (const dep of impact.transitiveDependencies) {
      lines.push(`- ${dep}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  lines.push(`### Affected Checks (${impact.affectedChecks.length})`);
  if (impact.affectedChecks.length > 0) {
    for (const check of impact.affectedChecks) {
      lines.push(`- ${check}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  lines.push(`### Affected Gates (${impact.affectedGates.length})`);
  if (impact.affectedGates.length > 0) {
    for (const gate of impact.affectedGates) {
      lines.push(`- ${gate}`);
    }
  } else {
    lines.push("- (none)");
  }

  return lines.join("\n");
}
