import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { runEnforce, GateEvaluationResult } from "../engine/enforce/index";
import { Graph } from "../types/index";
import { readYaml } from "../utils/yaml";

export interface GateOptions {
  phase?: string;
}

export async function gateCommand(
  projectRoot: string,
  options: GateOptions,
): Promise<void> {
  try {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    const graphPath = path.join(specGraphDir, "graph.yaml");

    // Load graph
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

    console.log(chalk.bold("\n🚧 Gate Evaluation\n"));

    // Run enforce engine
    const result = await runEnforce(projectRoot, graph, {
      phase: options.phase,
    });

    if (result.evaluated_gates.length === 0) {
      console.log(chalk.yellow("No gates defined in graph."));
      return;
    }

    // Display gate results
    const table = new Table({
      head: ["Gate ID", "Status", "Missing"],
      style: { head: ["cyan"] },
    });

    for (const gate of result.evaluated_gates) {
      const status = gate.passed ? chalk.green("✓ PASS") : chalk.red("✗ FAIL");
      const missing = [];
      if (gate.missing_artifacts.length > 0) {
        missing.push(`${gate.missing_artifacts.length} artifacts`);
      }
      if (gate.missing_checks.length > 0) {
        missing.push(`${gate.missing_checks.length} checks`);
      }
      if (gate.missing_traces.length > 0) {
        missing.push(`${gate.missing_traces.length} traces`);
      }
      if (gate.violated_forbids.length > 0) {
        missing.push(`${gate.violated_forbids.length} invariants`);
      }
      const missingStr = missing.length > 0 ? missing.join(", ") : "-";

      table.push([gate.gate_id, status, missingStr]);
    }

    console.log(table.toString());

    for (const gate of result.evaluated_gates) {
      if (gate.warnings.length === 0) continue;
      console.log("");
      console.log(chalk.yellow(`  Warnings for ${gate.gate_id}:`));
      for (const warning of gate.warnings) {
        console.log(chalk.yellow(`    • ${warning}`));
      }
    }

    // Summary
    console.log("");
    const passedCount = result.evaluated_gates.filter((g) => g.passed).length;
    const totalCount = result.evaluated_gates.length;
    console.log(
      chalk.bold(`  Summary: ${passedCount}/${totalCount} gates passed`),
    );

    if (result.blocking_gates.length > 0) {
      console.log("");
      console.log(chalk.red.bold("  ❌ BLOCKED by gates:"));
      for (const gateId of result.blocking_gates) {
        console.log(chalk.red(`    • ${gateId}`));
      }
      console.log("");
      process.exit(1);
    } else {
      console.log(chalk.green("\n  ✅ All gates passed!"));
      console.log("");
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
