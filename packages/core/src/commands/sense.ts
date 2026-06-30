import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  runSense,
} from "../engine/sense/index";
import { collectOverrides } from "../engine/sense/overrides";
import { Profile, FactDimension } from "../types/index";
import { writeYaml } from "../utils/yaml";

export interface SenseOptions {
  output?: string;
  build?: string;
  profileOverride?: string;
  description?: string;
}

export async function senseCommand(
  projectRoot: string,
  options: SenseOptions,
): Promise<void> {
  const spinner = ora("Analyzing project...").start();

  try {
    const { profile, warnings } = await runSense(projectRoot, {
      description: options.description,
    });

    // Apply user overrides on top of sensed facts
    const { overrides, warnings: overrideWarnings } = collectOverrides(
      options.build,
      options.profileOverride,
    );
    if (Object.keys(overrides).length > 0) {
      profile.overrides = { ...profile.overrides, ...overrides };
    }
    warnings.push(...overrideWarnings);

    spinner.succeed("Analysis complete");

    // Display profile summary
    console.log("");
    console.log(chalk.bold("  📊 Profile Summary"));
    console.log("");

    const table = new Table({
      head: ["Dimension", "Value", "Confidence", "Source", "Evidence"],
      style: { head: ["cyan"] },
    });

    const dimensions: FactDimension[] = [
      "has_ui",
      "boundary",
      "topology",
      "deployment",
      "consumers",
      "field",
      "criticality",
      "team",
      "persistence",
    ];

    for (const dim of dimensions) {
      const fact = profile.facts[dim];
      if (!fact) continue;

      const confColor = fact.confidence === "high" ? chalk.green : chalk.yellow;
      const sourceColor = fact.source === "repo" ? chalk.blue : chalk.gray;

      table.push([
        dim,
        fact.value,
        confColor(fact.confidence),
        sourceColor(fact.source),
        (fact.evidence || "").slice(0, 40),
      ]);
    }

    console.log(table.toString());

    if (warnings.length > 0) {
      console.log("");
      console.log(chalk.yellow("  ⚠️  Warnings:"));
      for (const w of warnings) {
        console.log(chalk.yellow(`     • ${w}`));
      }
    }

    // Save if output specified or .spec-graph exists
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    try {
      await fs.access(specGraphDir);
      const profilePath = path.join(specGraphDir, "profile.yaml");
      await writeYaml(profilePath, profile);
      console.log("");
      console.log(
        chalk.green(`  💾 Profile saved to: .spec-graph/profile.yaml`),
      );
    } catch {
      // Not initialized yet - skip save
      if (options.output) {
        await writeYaml(options.output, profile);
        console.log(chalk.green(`  💾 Profile saved to: ${options.output}`));
      }
    }
  } catch (e: any) {
    spinner.fail(`Sense failed: ${e.message}`);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
