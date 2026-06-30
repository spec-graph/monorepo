import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  runSense,
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
  stack?: string;
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

    // Inject agent constraints (prevents workflow bypass)
    await injectAgentConstraints(projectRoot, specGraphDir);

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

    // Run initial sense (scan only — no inference)
    spinner.text = "Scanning project structure...";
    const { profile, warnings } = await runSense(projectRoot, {
      description: options.description,
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

    // Determine tech stack: must be provided by agent via --stack
    const { generateCommandsFromStack } =
      await import("../engine/project-commands");

    if (!options.stack) {
      // No stack provided - this is a configuration error.
      // The AI agent (not spec-graph) should analyze the project and pass --stack.
      spinner.fail("No tech stack provided");
      console.log(chalk.yellow("\n  Provide --stack <name> to specify."));
      console.log(chalk.gray("  Common options: typescript, python, go, rust, java, kotlin, cpp-cmake, dotnet, ruby, php, swift, generic"));
      console.log(chalk.gray("\n  AI agents should analyze the project (read files, spawn sub-agents) and pass --stack explicitly."));
      console.log(chalk.gray("  spec-graph does not scan or infer tech stack — that is the agent's responsibility."));
      process.exit(1);
    }

    // Generate commands.yaml based on provided stack
    await generateCommandsFromStack(projectRoot, options.stack);
    spinner.text = `Tech stack: ${options.stack}`;

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

    // Both --quick and normal: compose + prime, then guide to plan
    console.log(chalk.cyan("\n  Running compose + prime...\n"));

    const { composeCommand } = await import("./compose");
    const { primeCommand } = await import("./prime");

    await composeCommand(projectRoot, { changeType: "feature" });
    console.log("");
    await primeCommand(projectRoot, { bootstrap: true });

    console.log(chalk.green("\n  ✓ Infrastructure ready."));

    // Auto-run plan to guide agent
    console.log(chalk.cyan("\n  Starting plan stage...\n"));
    const { planCommand } = await import("./plan");
    await planCommand(projectRoot, {});
  } catch (e: any) {
    spinner.fail(`Initialization failed: ${e.message}`);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

/**
 * Inject agent constraints to prevent workflow bypass.
 * Copies agent-constraints.md template and injects reference into CLAUDE.md.
 */
async function injectAgentConstraints(
  projectRoot: string,
  specGraphDir: string,
): Promise<void> {
  // Find the template (search in packs/foundation.pack/templates/)
  const templatePaths = [
    path.resolve(__dirname, "../../packs/foundation.pack/templates/agent-constraints.md"),
    path.resolve(__dirname, "../../../packs/foundation.pack/templates/agent-constraints.md"),
  ];

  let templateContent: string | null = null;
  for (const p of templatePaths) {
    try {
      templateContent = await fs.readFile(p, "utf-8");
      break;
    } catch {
      // try next
    }
  }

  if (!templateContent) return; // Template not found, skip

  // Copy to .spec-graph/
  const destPath = path.join(specGraphDir, "agent-constraints.md");
  await fs.writeFile(destPath, templateContent, "utf-8");

  // Try to inject reference into CLAUDE.md
  const claudeMdPath = path.join(projectRoot, "CLAUDE.md");
  try {
    const existing = await fs.readFile(claudeMdPath, "utf-8");
    if (!existing.includes("agent-constraints.md")) {
      const injection = `\n## spec-graph Agent 约束\n\n> 所有 AI agent 必须遵守 \`.spec-graph/agent-constraints.md\` 中的规则。\n> **核心原则**: 所有文档生成必须通过 spec-graph 工作流，禁止绕过。\n`;
      await fs.writeFile(claudeMdPath, existing + injection, "utf-8");
    }
  } catch {
    // CLAUDE.md doesn't exist, skip injection
  }
}
