/**
 * Dashboard Engine
 *
 * Generates rich terminal and HTML dashboards for workflow status.
 * Combines graph, machine state, trace index, and configuration data
 * into a single visual overview.
 */

import path from "node:path";
import { Graph } from "../../types/index";

export interface DashboardData {
  project_name: string;
  current_stage: string;
  stage_order: string[];
  artifacts: Record<string, { status: string; kind?: string }>;
  checks: Record<string, { status: string; layer?: string }>;
  gates: Array<{
    id: string;
    passed: boolean;
    missing_artifacts: string[];
    failed_checks: string[];
    missing_traces: string[];
  }>;
  trace_coverage: {
    total_edges: number;
    satisfied: number;
    pending: number;
  };
  constitution: {
    version: string;
    principles: number;
  };
  active_change: {
    id: string;
    title: string;
    type: string;
    priority: string;
  } | null;
  stats: {
    total_artifacts: number;
    completed_artifacts: number;
    total_checks: number;
    passed_checks: number;
    total_gates: number;
    passed_gates: number;
  };
}

/**
 * Generate terminal dashboard output using box-drawing characters.
 */
export function renderTerminalDashboard(data: DashboardData): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(`  ╔══════════════════════════════════════════════════════╗`);
  lines.push(`  ║  spec-graph Dashboard — ${data.project_name.padEnd(30)} ║`);
  lines.push(`  ╚══════════════════════════════════════════════════════╝`);
  lines.push("");

  // Pipeline progress
  lines.push(`  ▸ Pipeline: ${data.current_stage}`);
  const stageBar = data.stage_order
    .map((s, i) => {
      const current = data.stage_order.indexOf(data.current_stage);
      if (i < current) return `■`;
      if (i === current) return `◆`;
      return `□`;
    })
    .join(" → ");
  lines.push(`  ${stageBar}`);
  lines.push(`  ${data.stage_order.map((s) => s.padEnd(10).slice(0, 10)).join("   ")}`);
  lines.push("");

  // Stats summary
  const artPct = data.stats.total_artifacts > 0
    ? Math.round((data.stats.completed_artifacts / data.stats.total_artifacts) * 100)
    : 0;
  const chkPct = data.stats.total_checks > 0
    ? Math.round((data.stats.passed_checks / data.stats.total_checks) * 100)
    : 0;
  const gatePct = data.stats.total_gates > 0
    ? Math.round((data.stats.passed_gates / data.stats.total_gates) * 100)
    : 0;
  const tracePct = data.trace_coverage.total_edges > 0
    ? Math.round((data.trace_coverage.satisfied / data.trace_coverage.total_edges) * 100)
    : 0;

  lines.push(`  ▸ Progress:`);
  lines.push(`    Artifacts  ${data.stats.completed_artifacts}/${data.stats.total_artifacts} (${artPct}%)  ${progressBar(artPct)}`);
  lines.push(`    Checks     ${data.stats.passed_checks}/${data.stats.total_checks} (${chkPct}%)  ${progressBar(chkPct)}`);
  lines.push(`    Gates      ${data.stats.passed_gates}/${data.stats.total_gates} (${gatePct}%)  ${progressBar(gatePct)}`);
  lines.push(`    Traces     ${data.trace_coverage.satisfied}/${data.trace_coverage.total_edges} (${tracePct}%)  ${progressBar(tracePct)}`);
  lines.push("");

  // Artifact status grid
  const artEntries = Object.entries(data.artifacts);
  if (artEntries.length > 0) {
    lines.push(`  ▸ Artifacts (${artEntries.length}):`);
    const byKind: Record<string, Array<[string, { status: string; kind?: string }]>> = {};
    for (const [id, info] of artEntries) {
      const k = info.kind || "unknown";
      if (!byKind[k]) byKind[k] = [];
      byKind[k].push([id, info]);
    }
    for (const [kind, items] of Object.entries(byKind)) {
      lines.push(`    [${kind}]`);
      for (const [id, info] of items) {
        const icon = info.status === "completed" ? "●" : info.status === "in_progress" ? "◐" : info.status === "stale" ? "⚠" : "○";
        lines.push(`      ${icon} ${id}`);
      }
    }
    lines.push("");
  }

  // Gate evaluation
  if (data.gates.length > 0) {
    lines.push(`  ▸ Gates:`);
    for (const gate of data.gates) {
      const icon = gate.passed ? "✓" : "✗";
      const blocking = !gate.passed ? " (BLOCKING)" : "";
      lines.push(`    ${icon} ${gate.id}${blocking}`);
      if (!gate.passed) {
        if (gate.missing_artifacts.length > 0) {
          lines.push(`      missing: ${gate.missing_artifacts.join(", ")}`);
        }
        if (gate.failed_checks.length > 0) {
          lines.push(`      failed: ${gate.failed_checks.join(", ")}`);
        }
        if (gate.missing_traces.length > 0) {
          lines.push(`      traces: ${gate.missing_traces.join(", ")}`);
        }
      }
    }
    lines.push("");
  }

  // Active change
  if (data.active_change) {
    lines.push(`  ▸ Active Change:`);
    lines.push(`    ${data.active_change.id} [${data.active_change.type}] ${data.active_change.title}`);
    lines.push(`    Priority: ${data.active_change.priority}`);
    lines.push("");
  }

  // Constitution
  lines.push(`  ▸ Constitution v${data.constitution.version} (${data.constitution.principles} principles)`);
  lines.push("");

  return lines.join("\n");
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${pct}%`;
}

/**
 * Generate HTML dashboard file.
 */
export function renderHtmlDashboard(data: DashboardData): string {
  const artPct = data.stats.total_artifacts > 0
    ? Math.round((data.stats.completed_artifacts / data.stats.total_artifacts) * 100)
    : 0;
  const chkPct = data.stats.total_checks > 0
    ? Math.round((data.stats.passed_checks / data.stats.total_checks) * 100)
    : 0;
  const gatePct = data.stats.total_gates > 0
    ? Math.round((data.stats.passed_gates / data.stats.total_gates) * 100)
    : 0;
  const tracePct = data.trace_coverage.total_edges > 0
    ? Math.round((data.trace_coverage.satisfied / data.trace_coverage.total_edges) * 100)
    : 0;

  const stageIndex = data.stage_order.indexOf(data.current_stage);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>spec-graph Dashboard — ${data.project_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { font-size: 1.6rem; color: #58a6ff; margin-bottom: 4px; }
  .subtitle { color: #8b949e; font-size: 0.9rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .card h3 { font-size: 0.85rem; color: #8b949e; text-transform: uppercase; margin-bottom: 8px; }
  .card .value { font-size: 2rem; font-weight: 700; }
  .card .sub { font-size: 0.85rem; color: #8b949e; margin-top: 4px; }
  .bar-track { background: #21262d; border-radius: 4px; height: 8px; margin-top: 8px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .green { background: #3fb950; } .blue { background: #58a6ff; } .purple { background: #bc8cff; } .orange { background: #d29922; }
  .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .section h2 { font-size: 1rem; color: #58a6ff; margin-bottom: 12px; }
  .pipeline { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .stage { padding: 6px 12px; border-radius: 4px; font-size: 0.85rem; background: #21262d; border: 1px solid #30363d; }
  .stage.done { background: #0d2818; border-color: #238636; color: #3fb950; }
  .stage.active { background: #0d1d33; border-color: #58a6ff; color: #58a6ff; font-weight: 700; }
  .arrow { color: #484f58; font-size: 1.2rem; }
  .artifact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .artifact { padding: 8px 12px; border-radius: 4px; font-size: 0.85rem; background: #21262d; border: 1px solid #30363d; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.completed { background: #3fb950; } .dot.in_progress { background: #d29922; } .dot.pending { background: #484f58; } .dot.stale { background: #f85149; }
  .gate { padding: 8px 12px; border-radius: 4px; margin-bottom: 4px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; }
  .gate.passed { background: #0d2818; border: 1px solid #238636; }
  .gate.blocked { background: #3d1117; border: 1px solid #f85149; }
  .footer { color: #484f58; font-size: 0.8rem; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
<h1>${data.project_name}</h1>
<p class="subtitle">spec-graph Dashboard · Stage: <strong>${data.current_stage}</strong> · Constitution v${data.constitution.version}</p>

<div class="grid">
  <div class="card">
    <h3>Artifacts</h3>
    <div class="value" style="color:#3fb950">${data.stats.completed_artifacts}/${data.stats.total_artifacts}</div>
    <div class="bar-track"><div class="bar-fill green" style="width:${artPct}%"></div></div>
    <div class="sub">${artPct}% complete</div>
  </div>
  <div class="card">
    <h3>Checks</h3>
    <div class="value" style="color:#58a6ff">${data.stats.passed_checks}/${data.stats.total_checks}</div>
    <div class="bar-track"><div class="bar-fill blue" style="width:${chkPct}%"></div></div>
    <div class="sub">${chkPct}% passed</div>
  </div>
  <div class="card">
    <h3>Gates</h3>
    <div class="value" style="color:#bc8cff">${data.stats.passed_gates}/${data.stats.total_gates}</div>
    <div class="bar-track"><div class="bar-fill purple" style="width:${gatePct}%"></div></div>
    <div class="sub">${gatePct}% satisfied</div>
  </div>
  <div class="card">
    <h3>Traces</h3>
    <div class="value" style="color:#d29922">${data.trace_coverage.satisfied}/${data.trace_coverage.total_edges}</div>
    <div class="bar-track"><div class="bar-fill orange" style="width:${tracePct}%"></div></div>
    <div class="sub">${tracePct}% covered</div>
  </div>
</div>

<div class="section">
  <h2>Pipeline</h2>
  <div class="pipeline">
    ${data.stage_order.map((s, i) => {
      const cls = i < stageIndex ? "done" : i === stageIndex ? "active" : "";
      const label = i < stageIndex ? `${s} ✓` : i === stageIndex ? `${s} ◆` : s;
      return (i > 0 ? '<span class="arrow">→</span>' : '') + `<span class="stage ${cls}">${label}</span>`;
    }).join("")}
  </div>
</div>

<div class="section">
  <h2>Artifacts</h2>
  <div class="artifact-grid">
    ${Object.entries(data.artifacts).map(([id, info]) =>
      `<div class="artifact"><span class="dot ${info.status}"></span>${id} <span style="color:#8b949e;font-size:0.75rem">${info.kind || ""}</span></div>`
    ).join("")}
  </div>
</div>

<div class="section">
  <h2>Gates</h2>
  ${data.gates.map(g =>
    `<div class="gate ${g.passed ? "passed" : "blocked"}">
      ${g.passed ? "✓" : "✗"} <strong>${g.id}</strong>
      ${!g.passed ? `<span style="color:#f85149;font-size:0.8rem"> — ${[...g.missing_artifacts, ...g.failed_checks, ...g.missing_traces].join(", ")}</span>` : ""}
    </div>`
  ).join("")}
</div>

${data.active_change ? `
<div class="section">
  <h2>Active Change</h2>
  <p><strong>${data.active_change.title}</strong> <span style="color:#8b949e">[${data.active_change.type}]</span></p>
  <p style="font-size:0.85rem;color:#8b949e">ID: ${data.active_change.id} · Priority: ${data.active_change.priority}</p>
</div>` : ""}

<p class="footer">Generated by spec-graph · ${(new Date()).toISOString()}</p>
</body>
</html>`;
}
