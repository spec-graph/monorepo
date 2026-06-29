import path from "node:path";
import chalk from "chalk";
import { readYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { analyzeArtifacts, formatAnalysisResult } from "../engine/analyze/index";

export interface AnalyzeOptions {
  json?: boolean;
}

export async function analyzeCommand(
  projectRoot: string,
  options: AnalyzeOptions,
): Promise<void> {
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

    console.log(chalk.gray("Analyzing artifacts for consistency issues..."));
    console.log("");

    const result = await analyzeArtifacts(projectRoot, graph);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(formatAnalysisResult(result));

    // Summary
    if (result.stats.critical > 0) {
      console.log(chalk.red(`\n❌ ${result.stats.critical} critical issue(s) must be fixed`));
    } else if (result.stats.high > 0) {
      console.log(chalk.yellow(`\n⚠ ${result.stats.high} high priority issue(s) should be addressed`));
    } else {
      console.log(chalk.green("\n✓ No critical issues found"));
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
