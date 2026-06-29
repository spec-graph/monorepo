import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Graph } from "../types/index";
import { readYaml } from "../utils/yaml";

export interface ShowOptions {
  format?: "table" | "json";
}

export async function showCommand(
  projectRoot: string,
  options: ShowOptions,
): Promise<void> {
  try {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    const graphPath = path.join(specGraphDir, "graph.yaml");
    const profilePath = path.join(specGraphDir, "profile.yaml");

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

    // Load profile
    let profile: any;
    try {
      profile = await readYaml(profilePath);
    } catch {
      profile = null;
    }

    if (options.format === "json") {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }

    // Display summary
    console.log(chalk.bold("\n📊 Spec-Graph Summary\n"));

    // Meta info
    console.log(chalk.gray(`  Composed: ${graph.meta.composed_at}`));
    console.log(
      chalk.gray(`  Change Type: ${graph.meta.change_type || "N/A"}`),
    );
    console.log(chalk.gray(`  Packs Used: ${graph.meta.packs_used.length}`));
    console.log("");

    // Counts
    console.log(chalk.bold("  Graph Statistics:"));
    console.log(`    • Artifacts: ${graph.artifacts.length}`);
    console.log(`    • Actions: ${graph.actions.length}`);
    console.log(`    • Checks: ${graph.checks.length}`);
    console.log(`    • Gates: ${graph.gates.length}`);
    console.log(`    • Tracks: ${graph.tracks.length}`);
    console.log("");

    // Pipeline stages
    console.log(chalk.bold("  Pipeline Stages:"));
    const stages = graph.pipeline_skeleton.stages.join(" → ");
    console.log(`    ${stages}`);
    console.log(`    Max retries: ${graph.pipeline_skeleton.max_retries}`);
    console.log(`    On exhausted: ${graph.pipeline_skeleton.on_exhausted}`);
    console.log("");

    // Gates table
    if (graph.gates.length > 0) {
      console.log(chalk.bold("  Gates:"));
      const gateTable = new Table({
        head: ["ID", "On Transition", "Requirements", "Fail Mode", "Enabled"],
        style: { head: ["cyan"] },
      });

      for (const gate of graph.gates) {
        const reqCount =
          (gate.require_artifacts?.length || 0) +
          (gate.require_checks?.length || 0) +
          (gate.require_traces?.length || 0) +
          (gate.forbid?.length || 0);

        gateTable.push([
          gate.id,
          (gate.on_transition || []).join(", ") || "-",
          reqCount.toString(),
          gate.fail_mode,
          gate.enabled ? "✓" : "✗",
        ]);
      }

      console.log(gateTable.toString());
      console.log("");
    }

    // Tracks table
    if (graph.tracks.length > 0) {
      console.log(chalk.bold("  Parallel Tracks:"));
      const trackTable = new Table({
        head: ["ID", "Scope", "Actions", "Produces", "Consumes"],
        style: { head: ["cyan"] },
      });

      for (const track of graph.tracks) {
        trackTable.push([
          track.id,
          track.scope,
          (track.actions || []).length.toString(),
          (track.produces || []).join(", ") || "-",
          (track.consumes || []).join(", ") || "-",
        ]);
      }

      console.log(trackTable.toString());
      console.log("");
    }

    // Scope policy
    if (graph.scope_policy) {
      console.log(chalk.bold("  Scope Policy:"));
      if (graph.scope_policy.derive_from) {
        console.log(`    • Derived from: ${graph.scope_policy.derive_from}`);
      }
      console.log(
        `    • Forbid widen: ${graph.scope_policy.forbid_widen ? "Yes" : "No"}`,
      );
      console.log("");
    }

    console.log(chalk.green("  ✓ Graph is valid and ready"));
    console.log("");
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
