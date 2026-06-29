import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  runSense,
  RepoSignals,
  SenseClassifier,
  LlmClassifier,
  HttpLlmBackend,
} from "../engine/sense/index";
import { collectOverrides } from "../engine/sense/overrides";
import { Profile, FactDimension } from "../types/index";
import { writeYaml } from "../utils/yaml";

export interface SenseOptions {
  output?: string;
  showSignals?: boolean;
  build?: string;
  profileOverride?: string;
  description?: string;
  llmClassify?: boolean;
}

export async function senseCommand(
  projectRoot: string,
  options: SenseOptions,
): Promise<void> {
  const spinner = ora("Analyzing project...").start();

  try {
    // Construct classifier if --llm-classify is set
    let classifier: SenseClassifier | undefined;
    if (options.llmClassify) {
      const backend = new HttpLlmBackend();
      classifier = new LlmClassifier(backend);
    }

    const { profile, signals, warnings } = await runSense(projectRoot, {
      description: options.description,
      classifier,
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

    // Show repo signals if requested
    if (options.showSignals) {
      console.log("");
      console.log(chalk.bold("  🔍 Repo Signals Detected:"));
      console.log("");
      printSignals(signals);
    }

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

function printSignals(signals: RepoSignals): void {
  const items = [
    ["package.json", signals.hasPackageJson],
    ["exports field", signals.hasExportsField],
    ["React", signals.hasReact],
    ["Vue", signals.hasVue],
    ["Next.js", signals.hasNextConfig],
    ["Tailwind", signals.hasTailwind],
    ["OpenAPI", signals.hasOpenApiYaml],
    ["Prisma", signals.hasPrismaSchema],
    ["Docker", signals.hasDockerfile],
    ["GraphQL", signals.hasGraphqlSchema],
    ["gRPC", signals.hasGrpcProtos],
    ["PlatformIO", signals.hasPlatformioIni],
    ["CI Config", signals.hasCiConfig],
    [`src files`, signals.srcFileCount],
    [`test files`, signals.testFileCount],
  ];

  for (let i = 0; i < items.length; i += 3) {
    const row = items.slice(i, i + 3);
    const line = row
      .map(([name, val]) => {
        const icon = val ? chalk.green("✓") : chalk.gray("○");
        const count = typeof val === "boolean" ? "" : chalk.gray(`(${val})`);
        return `  ${icon} ${name} ${count}`;
      })
      .join("  ");
    console.log(line);
  }
}
