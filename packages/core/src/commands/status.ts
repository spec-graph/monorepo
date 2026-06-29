import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";
import { computeNextPlan } from "../engine/next/index";
import { buildTraceIndex } from "../engine/trace/index";
import { inferStageOrder } from "../engine/workflow/index";
import { loadPermissions } from "../engine/permissions/index";
import { readYaml } from "../utils/yaml";

export interface StatusOptions {
  json?: boolean;
}

export async function statusCommand(
  projectRoot: string,
  options: StatusOptions,
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
    const permissions = await loadPermissions(projectRoot);

    // Pipeline stage order
    const stageOrder = inferStageOrder(graph);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            current_stage: state.current_stage,
            pipeline: stageOrder,
            artifacts: state.artifacts,
            checks: state.checks,
            plan: {
              next_stage: plan.next_stage,
              gate_passed: plan.gate_passed,
              blocking_gate: plan.blocking_gate,
              missing_artifacts: plan.missing_artifacts,
              failed_checks: plan.failed_checks,
              missing_traces: plan.missing_traces,
              missing_contracts: plan.missing_contracts,
              forbidden_violations: plan.forbidden_violations,
              done: plan.done,
              suggested_actions: plan.suggested_actions,
            },
            permissions: { level: permissions.level },
          },
          null,
          2,
        ),
      );
      return;
    }

    // ── Header ──
    console.log(chalk.bold("\n📊 spec-graph Status\n"));

    // Pipeline progress bar
    const stageIndex = stageOrder.indexOf(state.current_stage);
    const stageParts: string[] = [];
    for (let i = 0; i < stageOrder.length; i++) {
      if (i < stageIndex) {
        stageParts.push(chalk.green("✓ " + stageOrder[i]));
      } else if (i === stageIndex) {
        stageParts.push(chalk.cyan.bold("▶ " + stageOrder[i]));
      } else {
        stageParts.push(chalk.gray("· " + stageOrder[i]));
      }
    }
    console.log("  " + stageParts.join(chalk.gray("  →  ")));
    console.log("");

    // Quick stats
    const totalArtifacts = Object.keys(state.artifacts).length;
    const completedArtifacts = Object.values(state.artifacts).filter(
      (a) => a.status === "completed",
    ).length;
    const totalChecks = Object.keys(state.checks).length;
    const passedChecks = Object.values(state.checks).filter(
      (c) => c.status === "passed",
    ).length;

    console.log(
      `  Change:  ${chalk.cyan(graph.meta.change_type || "N/A")}    Permissions: ${chalk.cyan(permissions.level)}`,
    );
    console.log(
      `  Stage:   ${chalk.cyan(state.current_stage)}    Artifacts: ${chalk.green(String(completedArtifacts))}/${totalArtifacts}    Checks: ${chalk.green(String(passedChecks))}/${totalChecks}`,
    );
    console.log("");

    // ── Artifacts ──
    if (totalArtifacts > 0) {
      console.log(chalk.bold("  Artifacts"));
      const artTable = new Table({
        head: ["ID", "Status", "Producer"],
        style: { head: ["cyan"] },
        wordWrap: true,
      });

      for (const [id, a] of Object.entries(state.artifacts)) {
        artTable.push([id, colorStatus(a.status), a.produced_by || "-"]);
      }
      console.log(artTable.toString());
      console.log("");
    }

    // ── Checks ──
    if (totalChecks > 0) {
      console.log(chalk.bold("  Checks"));
      const checkTable = new Table({
        head: ["ID", "Status"],
        style: { head: ["cyan"] },
        wordWrap: true,
      });

      for (const [id, c] of Object.entries(state.checks)) {
        checkTable.push([id, colorStatus(c.status)]);
      }
      console.log(checkTable.toString());
      console.log("");
    }

    // ── Gate Status ──
    if (plan.blocking_gate) {
      const gateStatus = plan.gate_passed
        ? chalk.green("PASSED")
        : chalk.red("BLOCKED");
      console.log(chalk.bold("  Gate Status"));
      console.log(`    Gate:  ${plan.blocking_gate}`);
      console.log(`    State: ${gateStatus}`);

      if (!plan.gate_passed) {
        if (plan.missing_artifacts.length)
          console.log(
            chalk.red(
              `    Missing artifacts: ${plan.missing_artifacts.join(", ")}`,
            ),
          );
        if (plan.failed_checks.length)
          console.log(
            chalk.red(`    Failed checks: ${plan.failed_checks.join(", ")}`),
          );
        if (plan.missing_traces.length)
          console.log(
            chalk.red(`    Missing traces: ${plan.missing_traces.join(", ")}`),
          );
        if (plan.missing_contracts.length)
          console.log(
            chalk.red(
              `    Contract drift: ${plan.missing_contracts.length} consumer(s)`,
            ),
          );
        if (plan.forbidden_violations.length)
          console.log(
            chalk.red(`    Forbidden: ${plan.forbidden_violations.join(", ")}`),
          );
      }
      console.log("");
    }

    // ── Next Action ──
    if (!plan.done) {
      const action = plan.suggested_actions[0];
      console.log(chalk.bold("  Next Action"));
      console.log(`    ${action?.description || "N/A"}`);
      // Deterministic actions can be auto-run; LLM-requiring actions need dispatch.
      const isDeterministic =
        action?.type === "run_check" ||
        action?.type === "verify_trace" ||
        action?.type === "transition";
      if (isDeterministic) {
        console.log(chalk.gray(`    Auto: spec-graph run`));
      } else {
        console.log(chalk.gray(`    Manual: spec-graph dispatch`));
      }
      console.log("");
    } else {
      console.log(chalk.green.bold("  ✓ Workflow complete\n"));
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

function colorStatus(status: string): string {
  if (status === "completed" || status === "passed") return chalk.green(status);
  if (status === "failed" || status === "blocked") return chalk.red(status);
  if (status === "ready") return chalk.blue(status);
  if (status === "in_progress" || status === "running")
    return chalk.yellow(status);
  return chalk.gray(status);
}
