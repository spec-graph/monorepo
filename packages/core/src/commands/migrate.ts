import path from "node:path";
import chalk from "chalk";
import { generateMigrationPlan, formatMigrationPlan } from "../engine/migration/index";
import { readYaml } from "../utils/yaml";
import { Graph } from "../types/index";

export interface MigrateOptions {
  json?: boolean;
}

export async function migrateCommand(
  projectRoot: string,
  options: MigrateOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");

  try {
    console.log(chalk.gray("Analyzing codebase structure..."));
    console.log("");

    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(chalk.yellow("⚠ Graph not found. Run `spec-graph compose` first."));
      console.log(chalk.gray("Continuing with codebase analysis only..."));
      console.log("");

      // Create minimal graph for migration planning
      graph = {
        version: "1",
        meta: {
          composed_at: new Date().toISOString(),
          profile_hash: "migration",
          packs_used: [],
        },
        artifacts: [],
        actions: [],
        checks: [],
        gates: [],
        tracks: [],
        pipeline_skeleton: {
          stages: ["propose", "specify", "design", "implement"],
          max_retries: 3,
          on_exhausted: "escalate",
        },
        acceptance_layers: {},
        agents: [],
        agent_bindings: [],
        meetings: [],
      };
    }

    const plan = await generateMigrationPlan(projectRoot, graph);

    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    console.log(formatMigrationPlan(plan));

    // Summary
    const totalSteps = plan.steps.length;
    const highPriority = plan.steps.filter((s) => s.priority === "high").length;

    console.log(chalk.green(`\n✓ Migration plan generated`));
    console.log(chalk.gray(`  ${totalSteps} steps (${highPriority} high priority)`));
    console.log(chalk.gray(`\n  Run each step to migrate your project incrementally.`));
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
