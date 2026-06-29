import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { runCompose } from "../engine/compose/index";
import { Profile } from "../types/index";
import { readYaml, writeYaml } from "../utils/yaml";

export interface ComposeOptions {
  changeType?: string;
  output?: string;
}

export async function composeCommand(
  projectRoot: string,
  options: ComposeOptions,
): Promise<void> {
  const spinner = ora("Composing workflow graph...").start();

  try {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    const profilePath = path.join(specGraphDir, "profile.yaml");

    const profile = await loadProfileOrExit(profilePath, spinner);

    const { graph, packsUsed, warnings, errors } = await runCompose(
      projectRoot,
      profile,
      options.changeType || "feature",
    );

    spinner.succeed("Composition complete");

    renderSummary(graph, packsUsed, options.changeType || "feature");
    renderPacks(packsUsed);
    renderWarnings(warnings);
    renderErrors(errors);
    renderPipeline(graph);
    renderGates(graph);
    renderTracks(graph);

    const outputPath = options.output || path.join(specGraphDir, "graph.yaml");
    await writeYaml(outputPath, graph);
    console.log("");
    console.log(chalk.green(`  💾 Graph saved to: ${outputPath}`));
  } catch (e: any) {
    spinner.fail(`Composition failed: ${e.message}`);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function loadProfileOrExit(
  profilePath: string,
  spinner: any,
): Promise<Profile> {
  try {
    return await readYaml<Profile>(profilePath);
  } catch {
    spinner.fail("Profile not found. Run `spec-graph init` first.");
    process.exit(1);
    throw new Error("unreachable");
  }
}

function renderSummary(graph: any, packsUsed: any[], changeType: string): void {
  console.log("");
  console.log(chalk.bold("  📋 Composition Summary"));
  console.log("");
  console.log(`  Change Type: ${changeType}`);
  console.log(`  Active packs: ${packsUsed.length}`);
  console.log(`  Artifacts: ${graph.artifacts.length}`);
  console.log(`  Actions: ${graph.actions.length}`);
  console.log(`  Checks: ${graph.checks.length}`);
  console.log(`  Gates: ${graph.gates.length}`);
  console.log(`  Tracks: ${graph.tracks.length}`);
}

function renderPacks(packsUsed: any[]): void {
  console.log("");
  console.log(chalk.bold("  📦 Packs used:"));
  for (const pack of packsUsed) {
    const matchStr =
      typeof pack.matched === "string"
        ? pack.matched
        : JSON.stringify(pack.matched).replace(/"/g, "");
    console.log(`    • ${pack.name} ${chalk.gray(`(${matchStr})`)}`);
  }
}

function renderWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  console.log("");
  console.log(chalk.yellow("  ⚠️  Warnings:"));
  for (const w of warnings) console.log(chalk.yellow(`    • ${w}`));
}

function renderErrors(errors: string[]): void {
  if (errors.length === 0) return;
  console.log("");
  console.log(chalk.red("  ❌ Errors:"));
  for (const e of errors) console.log(chalk.red(`    • ${e}`));
}

function renderPipeline(graph: any): void {
  console.log("");
  console.log(chalk.bold("  🚀 Pipeline Stages:"));
  const stages = graph.pipeline_skeleton.stages.join(" → ");
  console.log(`    ${stages}`);
}

function renderGates(graph: any): void {
  if (graph.gates.length === 0) return;
  console.log("");
  console.log(chalk.bold("  🚧 Gates:"));

  const gateTable = new Table({
    head: ["ID", "On Transition", "Requirements", "Fail Mode"],
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
      (gate.on_transition || []).join(", "),
      reqCount.toString(),
      gate.fail_mode,
    ]);
  }
  console.log(gateTable.toString());
}

function renderTracks(graph: any): void {
  if (graph.tracks.length === 0) return;
  console.log("");
  console.log(chalk.bold("  🛤️  Parallel Tracks:"));

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
}
