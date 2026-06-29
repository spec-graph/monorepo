import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { generateDot, generateMermaid, generateSummary } from "../engine/visualize/index";

export interface VisualizeOptions {
  format?: string;
  output?: string;
}

export async function visualizeCommand(
  projectRoot: string,
  options: VisualizeOptions,
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

    const format = options.format || "dot";

    if (format === "json") {
      const summary = generateSummary(graph);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (format === "mermaid") {
      const mermaid = await generateMermaid(projectRoot, graph);

      if (options.output) {
        const outputPath = path.isAbsolute(options.output)
          ? options.output
          : path.join(projectRoot, options.output);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, mermaid, "utf-8");
        console.log(chalk.green(`✓ Mermaid file written: ${outputPath}`));
        console.log(chalk.gray(`  Paste into GitHub/GitLab for inline rendering.`));
      } else {
        console.log(mermaid);
      }
      return;
    }

    // Generate DOT (default)
    const dot = await generateDot(projectRoot, graph);

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.join(projectRoot, options.output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, dot, "utf-8");
      console.log(chalk.green(`✓ DOT file written: ${outputPath}`));
      console.log(
        chalk.gray(`  Render with: dot -Tpng ${outputPath} -o workflow.png`),
      );
    } else {
      console.log(dot);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
