"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTraceIndex = buildTraceIndex;
exports.evaluateTraceQuery = evaluateTraceQuery;
exports.traceBackward = traceBackward;
exports.traceForward = traceForward;
exports.listTraceNodes = listTraceNodes;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const yaml_1 = require("../../utils/yaml");
/**
 * Build a traceability index from the graph
 */
async function buildTraceIndex(projectRoot, graph) {
    const nodes = new Map();
    const edges = [];
    indexArtifacts(nodes, edges, graph.artifacts);
    indexChecks(nodes, graph.checks);
    indexGates(nodes, edges, graph.gates);
    indexTracks(nodes, graph.tracks);
    await indexTraceFiles(nodes, edges, projectRoot);
    return { nodes, edges };
}
function indexArtifacts(nodes, edges, artifacts) {
    for (const artifact of artifacts) {
        nodes.set(artifact.id, {
            id: artifact.id,
            type: "artifact",
            metadata: {
                kind: artifact.kind,
                schema_ref: artifact.schema_ref,
                optional: artifact.optional,
                default_producer: artifact.default_producer,
                default_consumers: artifact.default_consumers,
            },
        });
        if (artifact.default_producer) {
            edges.push({
                from: artifact.default_producer,
                to: artifact.id,
                relation: "produces",
            });
        }
        if (artifact.default_consumers) {
            for (const consumer of artifact.default_consumers) {
                edges.push({ from: artifact.id, to: consumer, relation: "consumes" });
            }
        }
    }
}
function indexChecks(nodes, checks) {
    for (const check of checks) {
        nodes.set(check.id, {
            id: check.id,
            type: "check",
            metadata: {
                kind: check.kind,
                command: check.command,
                layer: check.layer,
            },
        });
    }
}
function indexGates(nodes, edges, gates) {
    for (const gate of gates) {
        nodes.set(gate.id, {
            id: gate.id,
            type: "gate",
            metadata: {
                on_transition: gate.on_transition,
                fail_mode: gate.fail_mode,
                enabled: gate.enabled,
            },
        });
        for (const artifactId of gate.require_artifacts) {
            edges.push({ from: artifactId, to: gate.id, relation: "required_by" });
        }
        for (const checkId of gate.require_checks) {
            edges.push({ from: checkId, to: gate.id, relation: "required_by" });
        }
    }
}
function indexTracks(nodes, tracks) {
    for (const track of tracks) {
        nodes.set(track.id, {
            id: track.id,
            type: "track",
            metadata: { scope: track.scope, actions: track.actions },
        });
    }
}
async function indexTraceFiles(nodes, edges, projectRoot) {
    const tracesDir = node_path_1.default.join(projectRoot, ".spec-graph", "traces");
    let entries;
    try {
        entries = await promises_1.default.readdir(tracesDir);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (!entry.endsWith(".yaml") && !entry.endsWith(".json"))
            continue;
        const tracePath = node_path_1.default.join(tracesDir, entry);
        try {
            const traceData = await (0, yaml_1.readYaml)(tracePath);
            indexRequirements(nodes, edges, traceData.requirements);
            indexTraceEntries(nodes, edges, traceData.traces);
        }
        catch {
            // Skip invalid trace files
        }
    }
}
function indexRequirements(nodes, edges, requirements) {
    if (!requirements)
        return;
    for (const req of requirements) {
        nodes.set(req.id, {
            id: req.id,
            type: "requirement",
            metadata: {
                title: req.title,
                priority: req.priority,
                source: req.source,
            },
        });
        if (req.implemented_by) {
            for (const artifactId of req.implemented_by) {
                edges.push({
                    from: req.id,
                    to: artifactId,
                    relation: "implemented_by",
                });
            }
        }
        if (req.traces_to) {
            for (const target of req.traces_to) {
                const targetId = typeof target === "string" ? target : target.id;
                const relation = typeof target === "string"
                    ? "traces_to"
                    : target.relation || "traces_to";
                edges.push({ from: req.id, to: targetId, relation });
            }
        }
    }
}
function indexTraceEntries(nodes, edges, traces) {
    if (!traces)
        return;
    for (const trace of traces) {
        const from = trace.from || trace.source;
        const to = trace.to || trace.target;
        if (!from || !to)
            continue;
        indexTraceNode(nodes, from, trace.from_kind || trace.source_kind);
        indexTraceNode(nodes, to, trace.to_kind || trace.target_kind);
        edges.push({
            from,
            to,
            relation: trace.relation || trace.via || "traces_to",
            metadata: trace,
        });
    }
}
function evaluateTraceQuery(index, query) {
    const sources = findNodesByKind(index, query.from_kind);
    const targets = findNodesByKind(index, query.to_kind);
    const reachableSources = sources.filter((source) => {
        return targets.some((target) => hasTracePath(index, source.id, target.id, query.via));
    });
    const base = {
        name: query.name,
        source_count: sources.length,
        target_count: targets.length,
        match_count: reachableSources.length,
    };
    if (sources.length === 0) {
        return {
            ...base,
            passed: false,
            missing_reason: `No source nodes found for kind '${query.from_kind}'`,
        };
    }
    if (targets.length === 0) {
        return {
            ...base,
            passed: false,
            missing_reason: `No target nodes found for kind '${query.to_kind}'`,
        };
    }
    if (query.cardinality === "exists") {
        return reachableSources.length > 0
            ? { ...base, passed: true }
            : {
                ...base,
                passed: false,
                missing_reason: "No matching trace path found",
            };
    }
    if (query.cardinality === "single") {
        return reachableSources.length === 1
            ? { ...base, passed: true }
            : {
                ...base,
                passed: false,
                missing_reason: `Expected exactly one matching source, found ${reachableSources.length}`,
            };
    }
    return reachableSources.length === sources.length
        ? { ...base, passed: true }
        : {
            ...base,
            passed: false,
            missing_reason: `Only ${reachableSources.length}/${sources.length} source nodes are traced`,
        };
}
function indexTraceNode(nodes, id, kind) {
    if (!kind || nodes.has(id))
        return;
    nodes.set(id, {
        id,
        type: "artifact",
        metadata: { kind },
    });
}
function findNodesByKind(index, kind) {
    return Array.from(index.nodes.values()).filter((node) => {
        return (node.metadata.kind === kind || node.type === kind || node.id === kind);
    });
}
function hasTracePath(index, from, to, allowedRelations) {
    const visited = new Set();
    const queue = [from];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === to)
            return true;
        if (visited.has(current))
            continue;
        visited.add(current);
        const edges = index.edges.filter((edge) => edge.from === current &&
            relationAllowed(edge.relation, allowedRelations));
        for (const edge of edges) {
            queue.push(edge.to);
        }
    }
    return false;
}
function relationAllowed(relation, allowedRelations) {
    if (allowedRelations.length === 0)
        return true;
    return allowedRelations.includes(relation);
}
function traceBackward(index, nodeId) {
    const path = [];
    const visited = new Set();
    function dfs(currentId) {
        if (visited.has(currentId))
            return;
        visited.add(currentId);
        const node = index.nodes.get(currentId);
        if (!node)
            return;
        path.unshift({
            node_id: node.id,
            node_type: node.type,
            metadata: node.metadata,
        });
        // Find incoming edges
        const incomingEdges = index.edges.filter((e) => e.to === currentId);
        for (const edge of incomingEdges) {
            dfs(edge.from);
        }
    }
    dfs(nodeId);
    return {
        query: nodeId,
        found: path.length > 0,
        path,
    };
}
/**
 * Trace forward from a requirement to its implementations
 */
function traceForward(index, nodeId) {
    const path = [];
    const visited = new Set();
    function dfs(currentId) {
        if (visited.has(currentId))
            return;
        visited.add(currentId);
        const node = index.nodes.get(currentId);
        if (!node)
            return;
        path.push({
            node_id: node.id,
            node_type: node.type,
            metadata: node.metadata,
        });
        // Find outgoing edges
        const outgoingEdges = index.edges.filter((e) => e.from === currentId);
        for (const edge of outgoingEdges) {
            dfs(edge.to);
        }
    }
    dfs(nodeId);
    return {
        query: nodeId,
        found: path.length > 0,
        path,
    };
}
/**
 * List all nodes in the trace index
 */
function listTraceNodes(index) {
    return Array.from(index.nodes.values());
}
//# sourceMappingURL=index.js.map