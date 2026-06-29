import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import { readYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";
import { buildTraceIndex } from "../engine/trace/index";
import { computeNextPlan } from "../engine/next/index";
import { inferStageOrder } from "../engine/workflow/index";
import {
  DashboardData,
  renderTerminalDashboard,
  renderHtmlDashboard,
} from "../engine/dashboard/index";

export interface DashboardOptions {
  json?: boolean;
  html?: boolean;
  output?: string;
}

export async function dashboardCommand(
  projectRoot: string,
  options: DashboardOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");
  const profilePath = path.join(specGraphDir, "profile.yaml");

  try {
    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(chalk.red("✗ Not composed. Run `spec-graph compose` first."));
      process.exit(1);
      return;
    }

    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    const state = await engine.getState();
    const traceIndex = await buildTraceIndex(projectRoot, graph);
    const plan = await computeNextPlan(graph, state, traceIndex, projectRoot);
    const stageOrder = inferStageOrder(graph);

    // Build profile info
    let profile: any = {};
    try {
      profile = await readYaml<any>(profilePath);
    } catch {
      // ignore
    }

    // Gather gate evaluations
    const gates = (graph.gates || []).map((gate) => {
      const missing_artifacts: string[] = [];
      const failed_checks: string[] = [];
      const missing_traces: string[] = [];

      for (const artId of gate.require_artifacts || []) {
        const artState = state.artifacts[artId];
        if (!artState || artState.status !== "completed") {
          missing_artifacts.push(artId);
        }
      }
      for (const chkId of gate.require_checks || []) {
        const chkState = state.checks[chkId];
        if (!chkState || chkState.status !== "passed") {
          failed_checks.push(chkId);
        }
      }

      const passed =
        missing_artifacts.length === 0 &&
        failed_checks.length === 0 &&
        missing_traces.length === 0;

      return {
        id: gate.id,
        passed,
        missing_artifacts,
        failed_checks,
        missing_traces,
      };
    });

    // Trace coverage
    const totalEdges = traceIndex.edges.length;
    const satisfied = traceIndex.edges.filter((e) => {
      const fromState = state.artifacts[e.from];
      const toState = state.artifacts[e.to];
      return fromState?.status === "completed" && toState?.status === "completed";
    }).length;

    // Active change
    const changesDir = path.join(specGraphDir, "changes");
    let activeChange: DashboardData["active_change"] = null;
    try {
      const files = await fs.readdir(changesDir);
      const active = files.find((f) => f.endsWith(".json"));
      if (active) {
        const changeData = await readYaml<any>(path.join(changesDir, active));
        if (changeData.status === "applied" || changeData.status === "in_progress") {
          activeChange = {
            id: changeData.id,
            title: changeData.title || "Untitled",
            type: changeData.type || "feature",
            priority: changeData.priority || "medium",
          };
        }
      }
    } catch {
      // no changes dir
    }

    // Constitution
    let constitutionVersion = "0.0.0";
    let constitutionPrinciples = 0;
    try {
      const constitutionPath = path.join(specGraphDir, "constitution.yaml");
      const constitution = await readYaml<any>(constitutionPath);
      constitutionVersion = constitution.version || "0.0.0";
      constitutionPrinciples = constitution.principles?.length || 0;
    } catch {
      // no constitution
    }

    const projectName = profile.meta?.name || path.basename(projectRoot);

    const data: DashboardData = {
      project_name: projectName,
      current_stage: state.current_stage,
      stage_order: stageOrder,
      artifacts: Object.fromEntries(
        Object.entries(state.artifacts).map(([id, info]) => [
          id,
          {
            status: info.status,
            kind: graph.artifacts?.find((a) => a.id === id)?.kind,
          },
        ]),
      ),
      checks: Object.fromEntries(
        Object.entries(state.checks).map(([id, info]) => [
          id,
          {
            status: info.status,
            layer: graph.checks?.find((c) => c.id === id)?.layer,
          },
        ]),
      ),
      gates,
      trace_coverage: {
        total_edges: totalEdges,
        satisfied,
        pending: totalEdges - satisfied,
      },
      constitution: {
        version: constitutionVersion,
        principles: constitutionPrinciples,
      },
      active_change: activeChange,
      stats: {
        total_artifacts: Object.keys(state.artifacts).length,
        completed_artifacts: Object.values(state.artifacts).filter(
          (a) => a.status === "completed",
        ).length,
        total_checks: Object.keys(state.checks).length,
        passed_checks: Object.values(state.checks).filter(
          (c) => c.status === "passed",
        ).length,
        total_gates: gates.length,
        passed_gates: gates.filter((g) => g.passed).length,
      },
    };

    // JSON output
    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // HTML output
    if (options.html) {
      const html = renderHtmlDashboard(data);
      const outputPath = options.output
        ? path.isAbsolute(options.output)
          ? options.output
          : path.join(projectRoot, options.output)
        : path.join(specGraphDir, "dashboard.html");
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, html, "utf-8");
      console.log(chalk.green(`✓ HTML dashboard written: ${outputPath}`));
      console.log(chalk.gray(`  Open in browser to view.`));
      return;
    }

    // Terminal dashboard
    console.log(renderTerminalDashboard(data));
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
