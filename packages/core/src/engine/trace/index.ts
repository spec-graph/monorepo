import fs from "node:fs/promises";
import path from "node:path";
import { Graph, TraceQuery } from "../../types/index";
import { readYaml } from "../../utils/yaml";

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
export async function buildTraceIndex(
  projectRoot: string,
  graph: Graph,
): Promise<TraceIndex> {
  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];

  indexArtifacts(nodes, edges, graph.artifacts);
  indexChecks(nodes, graph.checks);
  indexGates(nodes, edges, graph.gates);
  indexTracks(nodes, graph.tracks);
  await indexTraceFiles(nodes, edges, projectRoot);

  return { nodes, edges };
}

function indexArtifacts(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  artifacts: Graph["artifacts"],
): void {
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

function indexChecks(
  nodes: Map<string, TraceNode>,
  checks: Graph["checks"],
): void {
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

function indexGates(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  gates: Graph["gates"],
): void {
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

function indexTracks(
  nodes: Map<string, TraceNode>,
  tracks: Graph["tracks"],
): void {
  for (const track of tracks) {
    nodes.set(track.id, {
      id: track.id,
      type: "track",
      metadata: { scope: track.scope, actions: track.actions },
    });
  }
}

async function indexTraceFiles(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  projectRoot: string,
): Promise<void> {
  const tracesDir = path.join(projectRoot, ".spec-graph", "traces");
  let entries: string[];
  try {
    entries = await fs.readdir(tracesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".json")) continue;
    const tracePath = path.join(tracesDir, entry);
    try {
      const traceData = await readYaml<any>(tracePath);
      indexRequirements(nodes, edges, traceData.requirements);
      indexTraceEntries(nodes, edges, traceData.traces);
    } catch {
      // Skip invalid trace files
    }
  }
}

function indexRequirements(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  requirements: any[],
): void {
  if (!requirements) return;
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
        const relation =
          typeof target === "string"
            ? "traces_to"
            : target.relation || "traces_to";
        edges.push({ from: req.id, to: targetId, relation });
      }
    }
  }
}

function indexTraceEntries(
  nodes: Map<string, TraceNode>,
  edges: TraceEdge[],
  traces: any[],
): void {
  if (!traces) return;
  for (const trace of traces) {
    const from = trace.from || trace.source;
    const to = trace.to || trace.target;
    if (!from || !to) continue;
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

export function evaluateTraceQuery(
  index: TraceIndex,
  query: TraceQuery,
): TraceQueryEvaluation {
  const sources = findNodesByKind(index, query.from_kind);
  const targets = findNodesByKind(index, query.to_kind);
  const reachableSources = sources.filter((source) => {
    return targets.some((target) =>
      hasTracePath(index, source.id, target.id, query.via),
    );
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

function indexTraceNode(
  nodes: Map<string, TraceNode>,
  id: string,
  kind?: string,
): void {
  if (!kind || nodes.has(id)) return;
  nodes.set(id, {
    id,
    type: "artifact",
    metadata: { kind },
  });
}

function findNodesByKind(index: TraceIndex, kind: string): TraceNode[] {
  return Array.from(index.nodes.values()).filter((node) => {
    return (
      node.metadata.kind === kind || node.type === kind || node.id === kind
    );
  });
}

function hasTracePath(
  index: TraceIndex,
  from: string,
  to: string,
  allowedRelations: string[],
): boolean {
  const visited = new Set<string>();
  const queue = [from];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const edges = index.edges.filter(
      (edge) =>
        edge.from === current &&
        relationAllowed(edge.relation, allowedRelations),
    );
    for (const edge of edges) {
      queue.push(edge.to);
    }
  }

  return false;
}

function relationAllowed(
  relation: string,
  allowedRelations: string[],
): boolean {
  if (allowedRelations.length === 0) return true;
  return allowedRelations.includes(relation);
}

export function traceBackward(index: TraceIndex, nodeId: string): TraceResult {
  const path: TracePath[] = [];
  const visited = new Set<string>();

  function dfs(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const node = index.nodes.get(currentId);
    if (!node) return;

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
export function traceForward(index: TraceIndex, nodeId: string): TraceResult {
  const path: TracePath[] = [];
  const visited = new Set<string>();

  function dfs(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const node = index.nodes.get(currentId);
    if (!node) return;

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
export function listTraceNodes(index: TraceIndex): TraceNode[] {
  return Array.from(index.nodes.values());
}
