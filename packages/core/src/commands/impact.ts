import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { analyzeImpact, formatImpactAnalysis } from "../engine/impact/index";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";

export interface ImpactOptions {
  artifact?: string;
  json?: boolean;
  markStale?: boolean;
}

export async function impactCommand(
  projectRoot: string,
  options: ImpactOptions,
): Promise<void> {
  if (!options.artifact) {
    console.log(
      chalk.red("✗ --artifact is required. Usage: spec-graph impact --artifact <id>"),
    );
    process.exit(1);
  }

  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");

  try {
    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(chalk.red("✗ Graph not found. Run `spec-graph compose` first."));
      process.exit(1);
      return;
    }

    // Verify artifact exists in graph
    const artifactExists = graph.artifacts.some(
      (a) => a.id === options.artifact,
    );
    if (!artifactExists) {
      console.log(chalk.red(`✗ Artifact '${options.artifact}' not found in graph.`));
      console.log(chalk.gray(`Available artifacts:`));
      for (const a of graph.artifacts) {
        console.log(chalk.gray(`  - ${a.id}`));
      }
      process.exit(1);
      return;
    }

    const impact = await analyzeImpact(projectRoot, graph, options.artifact!);

    if (options.json) {
      console.log(JSON.stringify(impact, null, 2));
      return;
    }

    console.log(chalk.gray(`Analyzing impact of changes to: ${options.artifact}`));
    console.log("");
    console.log(formatImpactAnalysis(impact));

    // Mark affected artifacts as stale if requested
    const allAffected = [...new Set([...impact.directDependencies, ...impact.transitiveDependencies])];
    if (options.markStale && allAffected.length > 0) {
      const statePath = path.join(specGraphDir, "machine-state.yaml");
      const state = await readYaml<any>(statePath);
      let marked = 0;
      for (const id of allAffected) {
        if (state.artifacts[id] && state.artifacts[id].status !== "stale") {
          state.artifacts[id].status = "stale";
          marked++;
        }
      }
      if (marked > 0) {
        await writeYaml(statePath, state);
        console.log(chalk.yellow(`\n⚠ Marked ${marked} artifact(s) as stale.`));
      }
    }

    // Summary
    const totalImpact =
      impact.directDependencies.length +
      impact.transitiveDependencies.length +
      impact.affectedChecks.length +
      impact.affectedGates.length;

    if (totalImpact === 0) {
      console.log(chalk.green("\n✓ No downstream impact detected."));
    } else {
      console.log(chalk.yellow(`\n⚠ Total impact: ${totalImpact} downstream item(s)`));
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
