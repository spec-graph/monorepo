"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferStageOrder = inferStageOrder;
exports.findNextStage = findNextStage;
exports.isValidTransition = isValidTransition;
function inferStageOrder(graph) {
    const skeletonStages = graph.pipeline_skeleton.stages || [];
    const edges = collectTransitionEdges(graph);
    if (skeletonStages.length === 0) {
        return inferFromEdgesOnly(edges);
    }
    const ordered = [...skeletonStages];
    prependAncestors(ordered, edges, skeletonStages[0], new Set());
    appendDescendants(ordered, edges, skeletonStages[skeletonStages.length - 1], new Set());
    for (const edge of edges) {
        appendIfMissing(ordered, edge.from);
        appendIfMissing(ordered, edge.to);
    }
    return ordered;
}
function findNextStage(graph, currentStage) {
    const directEdge = chooseDirectEdge(graph, currentStage);
    if (directEdge)
        return directEdge.to;
    const stages = inferStageOrder(graph);
    const index = stages.indexOf(currentStage);
    if (index >= 0 && index < stages.length - 1) {
        return stages[index + 1];
    }
    return null;
}
function isValidTransition(graph, fromStage, toStage) {
    if (collectTransitionEdges(graph).some((edge) => edge.from === fromStage && edge.to === toStage)) {
        return true;
    }
    const stages = inferStageOrder(graph);
    const index = stages.indexOf(fromStage);
    return index >= 0 && stages[index + 1] === toStage;
}
function collectTransitionEdges(graph) {
    const edges = [];
    for (const gate of graph.gates || []) {
        const edge = parseTransition(gate.on_transition || []);
        if (!edge)
            continue;
        if (edges.some((existing) => existing.from === edge.from && existing.to === edge.to))
            continue;
        edges.push(edge);
    }
    return edges;
}
function parseTransition(transitions) {
    for (const transition of transitions) {
        if (transition.includes("→")) {
            const [from, to] = transition.split("→").map((part) => part.trim());
            if (from && to)
                return { from, to };
        }
        if (transition.includes(",")) {
            const [from, to] = transition.split(",").map((part) => part.trim());
            if (from && to)
                return { from, to };
        }
    }
    if (transitions.length >= 2) {
        return { from: transitions[0], to: transitions[1] };
    }
    return null;
}
function chooseDirectEdge(graph, currentStage) {
    const edges = collectTransitionEdges(graph).filter((edge) => edge.from === currentStage);
    if (edges.length === 0)
        return null;
    const skeletonStages = graph.pipeline_skeleton.stages || [];
    const firstSkeletonStage = skeletonStages[0];
    if (firstSkeletonStage) {
        const edgeToSkeleton = edges.find((edge) => edge.to === firstSkeletonStage);
        if (edgeToSkeleton)
            return edgeToSkeleton;
    }
    const skeletonEdge = edges.find((edge) => skeletonStages.includes(edge.to));
    if (skeletonEdge)
        return skeletonEdge;
    return edges[0];
}
function inferFromEdgesOnly(edges) {
    const ordered = [];
    for (const stage of findRoots(edges, [])) {
        appendPath(stage, edges, ordered, new Set());
    }
    for (const edge of edges) {
        appendIfMissing(ordered, edge.from);
        appendIfMissing(ordered, edge.to);
    }
    return ordered;
}
function prependAncestors(ordered, edges, stage, visiting) {
    if (visiting.has(stage))
        return;
    visiting.add(stage);
    const incoming = edges.filter((edge) => edge.to === stage);
    for (const edge of incoming) {
        prependAncestors(ordered, edges, edge.from, visiting);
        if (!ordered.includes(edge.from)) {
            ordered.unshift(edge.from);
        }
    }
    visiting.delete(stage);
}
function appendDescendants(ordered, edges, stage, visiting) {
    if (visiting.has(stage))
        return;
    visiting.add(stage);
    const outgoing = edges.filter((edge) => edge.from === stage);
    for (const edge of outgoing) {
        appendIfMissing(ordered, edge.to);
        appendDescendants(ordered, edges, edge.to, visiting);
    }
    visiting.delete(stage);
}
function findRoots(edges, skeletonStages) {
    const fromStages = new Set(edges.map((edge) => edge.from));
    const toStages = new Set(edges.map((edge) => edge.to));
    const roots = Array.from(fromStages).filter((stage) => !toStages.has(stage));
    if (roots.length > 0)
        return roots;
    if (skeletonStages.length > 0)
        return [skeletonStages[0]];
    return [];
}
function appendPath(stage, edges, ordered, visiting) {
    if (visiting.has(stage)) {
        appendIfMissing(ordered, stage);
        return;
    }
    visiting.add(stage);
    appendIfMissing(ordered, stage);
    const outgoing = edges.filter((edge) => edge.from === stage);
    for (const edge of outgoing) {
        appendPath(edge.to, edges, ordered, visiting);
    }
    visiting.delete(stage);
}
function appendIfMissing(values, value) {
    if (!values.includes(value)) {
        values.push(value);
    }
}
//# sourceMappingURL=index.js.map