"use strict";
/**
 * Impact Analysis Engine
 *
 * Computes the "blast radius" of changes to artifacts.
 * Uses trace edges and check dependencies to identify downstream impact.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImpact = analyzeImpact;
exports.formatImpactAnalysis = formatImpactAnalysis;
const index_1 = require("../trace/index");
/**
 * Compute the impact of a change to an artifact.
 * Returns all downstream artifacts and checks that might be affected.
 */
async function analyzeImpact(projectRoot, graph, sourceArtifactId) {
    const traceIndex = await (0, index_1.buildTraceIndex)(projectRoot, graph);
    // Find direct downstream dependencies (artifacts that depend on source)
    const directDependencies = findDirectDependencies(sourceArtifactId, traceIndex, graph);
    // Compute transitive closure (all downstream dependencies)
    const transitiveDependencies = computeTransitiveClosure(sourceArtifactId, traceIndex, graph);
    // Find checks that depend on source or its dependencies
    const affectedChecks = findAffectedChecks([sourceArtifactId, ...transitiveDependencies], graph);
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
function findDirectDependencies(sourceId, traceIndex, graph) {
    const dependencies = [];
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
function computeTransitiveClosure(sourceId, traceIndex, graph) {
    const visited = new Set();
    const queue = [sourceId];
    const result = [];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current))
            continue;
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
function findAffectedChecks(artifactIds, graph) {
    const affected = [];
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
function findAffectedGates(checkIds, graph) {
    const affected = [];
    for (const gate of graph.gates) {
        // Gate is affected if it requires any of the affected checks
        const gateChecks = gate.require_checks || [];
        if (gateChecks.some((c) => checkIds.includes(c))) {
            affected.push(gate.id);
        }
    }
    return [...new Set(affected)];
}
/**
 * Format impact analysis for display.
 */
function formatImpactAnalysis(impact) {
    const lines = [];
    lines.push(`## Impact Analysis: ${impact.source}`);
    lines.push("");
    lines.push(`### Direct Dependencies (${impact.directDependencies.length})`);
    if (impact.directDependencies.length > 0) {
        for (const dep of impact.directDependencies) {
            lines.push(`- ${dep}`);
        }
    }
    else {
        lines.push("- (none)");
    }
    lines.push("");
    lines.push(`### Transitive Dependencies (${impact.transitiveDependencies.length})`);
    if (impact.transitiveDependencies.length > 0) {
        for (const dep of impact.transitiveDependencies) {
            lines.push(`- ${dep}`);
        }
    }
    else {
        lines.push("- (none)");
    }
    lines.push("");
    lines.push(`### Affected Checks (${impact.affectedChecks.length})`);
    if (impact.affectedChecks.length > 0) {
        for (const check of impact.affectedChecks) {
            lines.push(`- ${check}`);
        }
    }
    else {
        lines.push("- (none)");
    }
    lines.push("");
    lines.push(`### Affected Gates (${impact.affectedGates.length})`);
    if (impact.affectedGates.length > 0) {
        for (const gate of impact.affectedGates) {
            lines.push(`- ${gate}`);
        }
    }
    else {
        lines.push("- (none)");
    }
    return lines.join("\n");
}
//# sourceMappingURL=index.js.map