import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { readYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";
import { computeNextPlan, NextPlan } from "../engine/next/index";
import { buildTraceIndex } from "../engine/trace/index";

export interface NextOptions {
  json?: boolean;
}

export async function nextCommand(
  projectRoot: string,
  options: NextOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(
        chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
      );
      process.exit(1);
      return;
    }

    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    const state = await engine.getState();
    const traceIndex = await buildTraceIndex(projectRoot, graph);
    const plan = await computeNextPlan(graph, state, traceIndex, projectRoot);

    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    renderNextPlan(plan);
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

function renderNextPlan(plan: NextPlan): void {
  console.log(chalk.bold("\n🧭 Next Step\n"));
  console.log(`  Current Stage: ${chalk.cyan(plan.current_stage)}`);

  if (plan.done) {
    console.log(chalk.green("  Workflow is complete."));
    console.log("");
    return;
  }

  console.log(`  Next Stage:    ${chalk.cyan(plan.next_stage || "-")}`);
  console.log(`  Transition:    ${plan.transition || "-"}`);
  console.log(`  Gate:          ${plan.blocking_gate || "no gate"}`);
  console.log(
    `  Gate Passed:   ${plan.gate_passed ? chalk.green("yes") : chalk.red("no")}`,
  );
  console.log("");

  if (!plan.gate_passed) {
    const blockersTable = new Table({
      head: ["Type", "ID"],
      style: { head: ["cyan"] },
    });

    for (const id of plan.missing_artifacts)
      blockersTable.push(["missing artifact", id]);
    for (const id of plan.failed_checks)
      blockersTable.push(["failed/missing check", id]);
    for (const id of plan.missing_traces)
      blockersTable.push(["missing trace", id]);
    for (const id of plan.missing_contracts)
      blockersTable.push(["contract drift", id]);
    for (const id of plan.forbidden_violations)
      blockersTable.push(["forbidden violation", id]);

    console.log(chalk.bold("  Blocking Items:"));
    console.log(blockersTable.toString());
    console.log("");
  }

  console.log(chalk.bold("  Suggested Actions:"));
  const actionsTable = new Table({
    head: ["#", "Type", "ID", "Command / Description"],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  plan.suggested_actions.forEach((action, index) => {
    actionsTable.push([
      index + 1,
      action.type,
      action.id,
      action.command || action.description,
    ]);
  });

  console.log(actionsTable.toString());
  console.log("");
}
