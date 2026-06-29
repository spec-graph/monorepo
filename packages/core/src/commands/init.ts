import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  runSense,
  SenseClassifier,
  LlmClassifier,
  HttpLlmBackend,
} from "../engine/sense/index";
import { collectOverrides } from "../engine/sense/overrides";
import { writeYaml } from "../utils/yaml";
import {
  getPreset,
  savePermissions,
  writeAgentConfigs,
} from "../engine/permissions/index";

export interface InitOptions {
  force?: boolean;
  description?: string;
  permissionLevel?: string;
  quick?: boolean;
  build?: string;
  profileOverride?: string;
  llmClassify?: boolean;
}

export async function initCommand(
  projectRoot: string,
  options: InitOptions,
): Promise<void> {
  const spinner = ora("Initializing spec-graph project...").start();

  try {
    const specGraphDir = path.join(projectRoot, ".spec-graph");

    // Check if already initialized
    try {
      await fs.access(specGraphDir);
      if (!options.force) {
        spinner.fail("Project already initialized");
        console.log(chalk.yellow("  Use --force to re-initialize"));
        process.exit(1);
      }
    } catch {
      // Doesn't exist - proceed
    }

    // Create directory structure
    await fs.mkdir(path.join(specGraphDir, "changes"), { recursive: true });
    await fs.mkdir(path.join(specGraphDir, "artifacts"), { recursive: true });
    await fs.mkdir(path.join(specGraphDir, "traces"), { recursive: true });

    // Create permissions with chosen level (default: semi-auto)
    const permLevel = (options.permissionLevel || "semi-auto") as
      | "full-auto"
      | "semi-auto"
      | "manual";
    const permConfig = getPreset(permLevel);
    await savePermissions(projectRoot, permConfig);

    // Auto-generate agent config files (.claude/settings.json, .opencode.json)
    const { created, skipped } = await writeAgentConfigs(
      projectRoot,
      permConfig,
    );

    // Run initial sense
    spinner.text = "Analyzing project structure...";
    let classifier: SenseClassifier | undefined;
    if (options.llmClassify) {
      const backend = new HttpLlmBackend();
      classifier = new LlmClassifier(backend);
    }
    const { profile, warnings } = await runSense(projectRoot, {
      description: options.description,
      classifier,
    });

    // Apply user overrides (--build / --profile-override) on top of sensed facts
    const { overrides, warnings: overrideWarnings } = collectOverrides(
      options.build,
      options.profileOverride,
    );
    if (Object.keys(overrides).length > 0) {
      profile.overrides = { ...profile.overrides, ...overrides };
    }
    warnings.push(...overrideWarnings);

    // Write profile
    spinner.text = "Writing profile.yaml...";
    await writeYaml(path.join(specGraphDir, "profile.yaml"), profile);

    // Write initial graph
    spinner.text = "Composing initial graph...";

    // Write README
    const readme = `# ${options.description || "Spec-Graph Project"}

Initialized at ${new Date().toISOString()}

## Commands

\`\`\`bash
spec-graph sense    # Re-analyze project, update profile
spec-graph compose  # Compose workflow graph
spec-graph gate     # Evaluate gates, show blocking items
spec-graph show     # Display current graph summary
spec-graph change   # Manage changes (create/list/...)
\`\`\`
`;
    await fs.writeFile(path.join(specGraphDir, "README.md"), readme);

    spinner.succeed("Project initialized successfully!");

    // Report created agent configs
    for (const c of created) {
      console.log(chalk.green(`  ✓ ${c}`));
    }
    for (const s of skipped) {
      console.log(chalk.gray(`  - ${s}`));
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow("\n  Warnings:"));
      for (const w of warnings) {
        console.log(chalk.yellow(`   • ${w}`));
      }
    }

    console.log(chalk.green("\n  Next steps:"));
    console.log("   1. Review .spec-graph/profile.yaml");
    console.log(
      "   2. Review .spec-graph/permissions.yaml (level: " + permLevel + ")",
    );
    console.log("   3. Run `spec-graph compose` to generate workflow graph");
    console.log("   4. Run `spec-graph gate` to evaluate entry gates");

    // --quick: full bootstrap (init + compose + prime)
    if (options.quick) {
      console.log(
        chalk.cyan("\n  ⚡ Quick mode: running compose + prime...\n"),
      );

      const { composeCommand } = await import("./compose");
      const { primeCommand } = await import("./prime");

      await composeCommand(projectRoot, { changeType: "feature" });
      console.log("");
      await primeCommand(projectRoot, { bootstrap: true });

      console.log(chalk.green("\n  ✓ Full bootstrap complete."));
      console.log(chalk.gray("  Next: spec-graph status"));
      console.log(chalk.gray("  Next: spec-graph next"));
    }
  } catch (e: any) {
    spinner.fail(`Initialization failed: ${e.message}`);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
