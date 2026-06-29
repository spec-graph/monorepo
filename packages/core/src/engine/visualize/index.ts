/**
 * Workflow Visualization
 *
 * Generate Graphviz DOT files for visual representation of the workflow graph.
 * Artifacts are nodes, trace edges are arrows, gates are clusters.
 */

import { Graph, Gate } from "../../types/index";
import { buildTraceIndex } from "../trace/index";

/**
 * Generate Graphviz DOT representation of the workflow graph.
 */
export async function generateDot(
  projectRoot: string,
  graph: Graph,
): Promise<string> {
  const lines: string[] = [];
  lines.push("digraph spec_graph {");
  lines.push("  rankdir=LR;");
  lines.push('  fontname="Arial";');
  lines.push("  node [fontname=\"Arial\", shape=box, style=filled];");
  lines.push("  edge [fontname=\"Arial\"];");
  lines.push("");

  // Pipeline stages as clusters
  const stages = graph.pipeline_skeleton?.stages || [];
  if (stages.length > 0) {
    lines.push("  // Pipeline stages");
    for (let i = 0; i < stages.length; i++) {
      const color = i === 0 ? "#4CAF50" : i === stages.length - 1 ? "#FF9800" : "#2196F3";
      lines.push(`  "${stages[i]}" [label="${stages[i]}", fillcolor="${color}", fontcolor=white];`);
    }
    for (let i = 0; i < stages.length - 1; i++) {
      lines.push(`  "${stages[i]}" -> "${stages[i + 1]}" [style=bold, color="#666"];`);
    }
    lines.push("");
  }

  // Artifacts grouped by kind
  lines.push("  // Artifacts");
  const artifactsByKind: Record<string, string[]> = {};
  for (const artifact of graph.artifacts || []) {
    const kind = artifact.kind || "unknown";
    if (!artifactsByKind[kind]) artifactsByKind[kind] = [];
    artifactsByKind[kind].push(artifact.id);
  }

  const kindColors: Record<string, string> = {
    requirement: "#E3F2FD",
    design: "#FFF3E0",
    plan: "#F3E5F5",
    contract: "#FFEBEE",
    verification: "#E8F5E9",
    change_record: "#FCE4EC",
    meta: "#ECEFF1",
  };

  for (const [kind, ids] of Object.entries(artifactsByKind)) {
    const color = kindColors[kind] || "#FAFAFA";
    lines.push(`  subgraph cluster_${kind.replace(/[^a-z0-9]/gi, "_")} {`);
    lines.push(`    label="${kind}";`);
    lines.push(`    style=filled; fillcolor="${color}";`);
    for (const id of ids) {
      const safeId = escapeId(id);
      lines.push(`    "${safeId}" [label="${id}"];`);
    }
    lines.push("  }");
    lines.push("");
  }

  // Trace edges
  const traceIndex = await buildTraceIndex(projectRoot, graph);
  if (traceIndex.edges.length > 0) {
    lines.push("  // Trace edges");
    for (const edge of traceIndex.edges) {
      const fromId = escapeId(edge.from);
      const toId = escapeId(edge.to);
      const label = edge.relation || "";
      lines.push(`  "${fromId}" -> "${toId}" [label="${label}", color="#757575", style=dashed];`);
    }
    lines.push("");
  }

  // Gates
  if (graph.gates && graph.gates.length > 0) {
    lines.push("  // Gates");
    for (const gate of graph.gates) {
      const transitions = gate.on_transition || [];
      for (const t of transitions) {
        if (typeof t === "string" && t.includes("→")) {
          const [from, to] = t.split("→");
          const gateLabel = gate.require_artifacts?.length
            ? `${gate.id}\\n(${gate.require_artifacts.length} artifacts)`
            : gate.id;
          lines.push(
            `  "${from}" -> "${to}" [label="${gateLabel}", color="#F44336", style=bold, constraint=false];`,
          );
        }
      }
    }
    lines.push("");
  }

  lines.push("}");
  return lines.join("\n");
}

function escapeId(id: string): string {
  return id.replace(/"/g, '\\"');
}

/**
 * Generate Mermaid flowchart representation of the workflow graph.
 */
export async function generateMermaid(
  projectRoot: string,
  graph: Graph,
): Promise<string> {
  const lines: string[] = [];
  lines.push("flowchart LR");
  lines.push("  %% Pipeline stages");

  const stages = graph.pipeline_skeleton?.stages || [];
  if (stages.length > 0) {
    for (let i = 0; i < stages.length; i++) {
      const safe = stages[i].replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`  ${safe}["${stages[i]}"]`);
    }
    for (let i = 0; i < stages.length - 1; i++) {
      const from = stages[i].replace(/[^a-zA-Z0-9]/g, "_");
      const to = stages[i + 1].replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`  ${from} --> ${to}`);
    }
    lines.push("");
  }

  // Artifacts
  lines.push("  %% Artifacts");
  const kindStyles: Record<string, string> = {
    requirement: "req",
    design: "des",
    plan: "pln",
    contract: "ctr",
    verification: "vrf",
    change_record: "chg",
    meta: "meta",
    implementation: "impl",
  };

  for (const artifact of graph.artifacts || []) {
    const safeId = artifact.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const kindTag = kindStyles[artifact.kind] || "art";
    lines.push(`  ${safeId}["${artifact.id}<br/><small>${artifact.kind}</small>"]:::${kindTag}`);
  }
  lines.push("");

  // Style classes
  lines.push("  %% Styles");
  lines.push("  classDef req fill:#E3F2FD,stroke:#1976D2");
  lines.push("  classDef des fill:#FFF3E0,stroke:#F57C00");
  lines.push("  classDef pln fill:#F3E5F5,stroke:#7B1FA2");
  lines.push("  classDef ctr fill:#FFEBEE,stroke:#D32F2F");
  lines.push("  classDef vrf fill:#E8F5E9,stroke:#388E3C");
  lines.push("  classDef chg fill:#FCE4EC,stroke:#C2185B");
  lines.push("  classDef impl fill:#E0F2F1,stroke:#00796B");
  lines.push("  classDef meta fill:#ECEFF1,stroke:#546E7A");
  lines.push("  classDef art fill:#FAFAFA,stroke:#9E9E9E");
  lines.push("");

  // Trace edges
  const traceIndex = await buildTraceIndex(projectRoot, graph);
  if (traceIndex.edges.length > 0) {
    lines.push("  %% Trace edges");
    for (const edge of traceIndex.edges) {
      const fromSafe = edge.from.replace(/[^a-zA-Z0-9_-]/g, "_");
      const toSafe = edge.to.replace(/[^a-zA-Z0-9_-]/g, "_");
      const label = edge.relation ? `|${edge.relation}|` : "";
      lines.push(`  ${fromSafe} -.-> ${label} ${toSafe}`);
    }
    lines.push("");
  }

  // Gates
  if (graph.gates && graph.gates.length > 0) {
    lines.push("  %% Gates");
    for (const gate of graph.gates) {
      const transitions = gate.on_transition || [];
      for (const t of transitions) {
        if (typeof t === "string" && t.includes("→")) {
          const [from, to] = t.split("→");
          const fromSafe = from.replace(/[^a-zA-Z0-9]/g, "_");
          const toSafe = to.replace(/[^a-zA-Z0-9]/g, "_");
          const reqCount = gate.require_artifacts?.length || 0;
          const label = reqCount > 0 ? `|${gate.id} (${reqCount})|` : `|${gate.id}|`;
          lines.push(`  ${fromSafe} ==> ${label} ${toSafe}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Generate a summary of the workflow graph for JSON output.
 */
export function generateSummary(graph: Graph): any {
  const stages = graph.pipeline_skeleton?.stages || [];
  return {
    stages,
    artifact_count: graph.artifacts?.length || 0,
    artifact_kinds: Object.keys(
      (graph.artifacts || []).reduce((acc, a) => {
        acc[a.kind] = (acc[a.kind] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    ),
    check_count: graph.checks?.length || 0,
    gate_count: graph.gates?.length || 0,
    agent_count: graph.agents?.length || 0,
    meeting_count: graph.meetings?.length || 0,
    track_count: graph.tracks?.length || 0,
  };
}
