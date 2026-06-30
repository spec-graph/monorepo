import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
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

    // Write simple profile skeleton (all dimensions = unknown)
    // Agent fills dimensions later via --profile-override or spec-graph profile
    spinner.text = "Writing profile...";
    const profile = {
      version: "1",
      meta: {
        created_at: new Date().toISOString(),
        description: options.description || "",
        build: options.build || "",
      },
      facts: {
        has_ui: { value: "unknown", confidence: "low", source: "fallback" },
        boundary: { value: "unknown", confidence: "low", source: "fallback" },
        topology: { value: "unknown", confidence: "low", source: "fallback" },
        deployment: { value: "unknown", confidence: "low", source: "fallback" },
        consumers: { value: "unknown", confidence: "low", source: "fallback" },
        field: { value: "unknown", confidence: "low", source: "fallback" },
        criticality: { value: "unknown", confidence: "low", source: "fallback" },
        team: { value: "unknown", confidence: "low", source: "fallback" },
        persistence: { value: "unknown", confidence: "low", source: "fallback" },
      },
    };
    if (options.profileOverride) {
      (profile as any).overrides = parseOverride(options.profileOverride);
    }
    await writeYaml(path.join(specGraphDir, "profile.yaml"), profile);

    // Generate commands.yaml from --stack
    if (!options.stack) {
      spinner.fail("No tech stack provided");
      console.log(chalk.yellow("\n  Provide --stack <name>."));
      console.log(chalk.gray("  Options: typescript, python, go, rust, java, kotlin, cpp-cmake, dotnet, ruby, php, swift, generic"));
      console.log(chalk.gray("  AI agent should analyze the project and pass --stack."));
      process.exit(1);
    }
    const { generateCommandsFromStack } = await import("../engine/project-commands");
    await generateCommandsFromStack(projectRoot, options.stack);

    // Compose workflow graph
    spinner.text = "Composing workflow graph...";
    const { composeCommand } = await import("./compose");
    await composeCommand(projectRoot, { changeType: "feature" });

    // Prime machine state
    spinner.text = "Priming machine state...";
    const { primeCommand } = await import("./prime");
    await primeCommand(projectRoot, { bootstrap: true });

    // Write README
    await fs.writeFile(
      path.join(specGraphDir, "README.md"),
      `# ${options.description || "Spec-Graph Project"}\n\nInitialized at ${new Date().toISOString()}\n`,
    );

    spinner.succeed("Project initialized successfully!");

    for (const c of created) console.log(chalk.green(`  ✓ ${c}`));
    for (const s of skipped) console.log(chalk.gray(`  - ${s}`));

    // Inline plan status (no nested dispatch call)
    await printInitPlanStatus(projectRoot);
  } catch (e: any) {
    spinner.fail(`Initialization failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Print plan status from the just-created graph + state.
 * No nested command calls — reads files directly.
 */
async function printInitPlanStatus(projectRoot: string): Promise<void> {
  try {
    const { readYaml } = await import("../utils/yaml");
    const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
    const statePath = path.join(projectRoot, ".spec-graph", "machine-state.yaml");

    const graph = await readYaml<any>(graphPath);
    const state = await readYaml<any>(statePath);

    const allArtifacts = graph.artifacts || [];
    const artifactStates = state.artifacts || {};
    const pending = allArtifacts.filter((a: any) => {
      const s = artifactStates[a.id];
      return !s || s.status !== "completed";
    });

    console.log(chalk.green("\n  ✓ Infrastructure ready."));
    console.log(chalk.bold(`\n  Plan Stage: ${pending.length} artifacts to produce\n`));

    if (pending.length === 0) {
      console.log(chalk.green("  All artifacts completed."));
      return;
    }

    // Show by priority kind
    const kindOrder = ["requirement", "design", "plan", "contract", "verification", "implementation", "meta"];
    for (const kind of kindOrder) {
      const items = pending.filter((a: any) => a.kind === kind);
      if (items.length === 0) continue;
      console.log(chalk.gray(`  ${kind}:`));
      for (const a of items) {
        console.log(chalk.yellow(`    ⬜ ${a.id}`));
      }
    }

    console.log(chalk.gray("\n  ─────────────────────────────────────────"));
    console.log(chalk.bold("\n  Agent — produce these artifacts:"));
    console.log(chalk.gray("\n    For each artifact:"));
    console.log(chalk.gray("      1. spec-graph dispatch --json  (get context)"));
    console.log(chalk.gray("      2. Produce document at suggested path"));
    console.log(chalk.gray("      3. spec-graph artifact complete <id> --producer agent"));
    console.log(chalk.gray("      4. spec-graph plan              (check progress)"));
  } catch {
    // Skip on error
  }
}

function parseOverride(profileOverride?: string): Record<string, string> | undefined {
  if (!profileOverride) return undefined;
  const overrides: Record<string, string> = {};
  for (const pair of profileOverride.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) overrides[k.trim()] = v.trim();
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function injectAgentConstraints(
  projectRoot: string,
  specGraphDir: string,
): Promise<void> {
  const destPath = path.join(specGraphDir, "agent-constraints.md");

  // Try to find template
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

  if (!templateContent) return;

  await fs.writeFile(destPath, templateContent, "utf-8");

  // Inject reference into CLAUDE.md
  const claudeMdPath = path.join(projectRoot, "CLAUDE.md");
  try {
    const existing = await fs.readFile(claudeMdPath, "utf-8");
    if (!existing.includes("agent-constraints.md")) {
      const injection = `\n## spec-graph Agent 约束\n\n> 所有 AI agent 必须遵守 \`.spec-graph/agent-constraints.md\` 中的规则。\n> **核心原则**: 所有文档生成必须通过 spec-graph 工作流，禁止绕过。\n`;
      await fs.writeFile(claudeMdPath, existing + injection, "utf-8");
    }
  } catch {
    // CLAUDE.md doesn't exist
  }
}
