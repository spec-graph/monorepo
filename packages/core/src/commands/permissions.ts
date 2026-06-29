import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  PermissionConfig,
  PermissionLevel,
  loadPermissions,
  savePermissions,
  getPreset,
  writeAgentConfigs,
  PRESETS,
} from "../engine/permissions/index";

export interface PermissionsOptions {
  subcommand?: string; // 'show' | 'set' | 'list-agents' | 'sync'
  level?: string;
  force?: boolean;
  json?: boolean;
}

export async function permissionsCommand(
  projectRoot: string,
  options: PermissionsOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");

  try {
    // Verify initialized
    try {
      await fs.access(specGraphDir);
    } catch {
      console.log(
        chalk.red("✗ Project not initialized. Run `spec-graph init` first."),
      );
      process.exit(1);
      return;
    }

    const subcommand = options.subcommand || "show";

    switch (subcommand) {
      case "show":
        await showPermissions(projectRoot, options);
        break;
      case "set":
        await setPermissionLevel(projectRoot, options);
        break;
      case "list-agents":
        await listAgents(projectRoot, options);
        break;
      case "sync":
        await syncAgentConfigs(projectRoot, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
        console.log("Available: show, set, list-agents, sync");
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function showPermissions(
  projectRoot: string,
  options: PermissionsOptions,
): Promise<void> {
  const config = await loadPermissions(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(chalk.bold("\n🔐 Permission Configuration\n"));

  const levelColor =
    config.level === "full-auto"
      ? chalk.green
      : config.level === "semi-auto"
        ? chalk.cyan
        : config.level === "manual"
          ? chalk.yellow
          : chalk.magenta;

  console.log(`  Level: ${levelColor(config.level)}`);
  console.log("");

  // Auto-execute actions
  console.log(chalk.bold("  Auto-Execute (spec-graph run):"));
  if (config.allow.auto_execute.length === 0) {
    console.log(chalk.gray("    (none — manual mode)"));
  } else {
    for (const action of config.allow.auto_execute) {
      console.log(`    ✓ ${action}`);
    }
  }

  // Agent actions
  console.log("");
  console.log(chalk.bold("  Agent Actions (dispatch manifest):"));
  for (const action of config.allow.agent_actions) {
    const auto = config.allow.auto_execute.includes(action)
      ? chalk.green(" [auto]")
      : "";
    console.log(`    • ${action}${auto}`);
  }

  // File scope
  console.log("");
  console.log(chalk.bold("  File Scope:"));
  console.log(`    Read:  ${config.file_scope.read.join(", ")}`);
  console.log(`    Write: ${config.file_scope.write.join(", ")}`);

  // Agents
  console.log("");
  console.log(chalk.bold("  Registered Agents:"));
  for (const [name, agent] of Object.entries(config.agents)) {
    const status = agent.enabled
      ? chalk.green("enabled")
      : chalk.gray("disabled");
    console.log(`    ${name}: ${status}`);
    console.log(`      Auto-approve: ${agent.auto_approve_tools.join(", ")}`);
    if (agent.note) console.log(chalk.gray(`      ${agent.note}`));
  }

  console.log("");
}

async function setPermissionLevel(
  projectRoot: string,
  options: PermissionsOptions,
): Promise<void> {
  if (!options.level) {
    console.log(
      chalk.red(
        "✗ Missing --level option. Usage: spec-graph permissions set --level <full-auto|semi-auto|manual>",
      ),
    );
    process.exit(1);
    return;
  }

  const level = options.level as PermissionLevel;
  const validLevels: PermissionLevel[] = [
    "full-auto",
    "semi-auto",
    "manual",
    "custom",
  ];

  if (!validLevels.includes(level)) {
    console.log(chalk.red(`✗ Invalid level: ${level}`));
    console.log(`Valid: ${validLevels.join(", ")}`);
    process.exit(1);
    return;
  }

  if (level === "custom") {
    console.log(
      chalk.yellow(
        "Custom level must be configured by editing .spec-graph/permissions.yaml directly.",
      ),
    );
    process.exit(1);
    return;
  }

  const config = getPreset(level as Exclude<PermissionLevel, "custom">);
  await savePermissions(projectRoot, config);

  console.log(chalk.green(`✓ Permission level set to: ${level}`));
  console.log(
    chalk.gray(`  Auto-execute: [${config.allow.auto_execute.join(", ")}]`),
  );
  console.log(chalk.gray(`  Config: .spec-graph/permissions.yaml`));
}

async function listAgents(
  projectRoot: string,
  options: PermissionsOptions,
): Promise<void> {
  const config = await loadPermissions(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(config.agents, null, 2));
    return;
  }

  console.log(chalk.bold("\n🤖 Registered Agents\n"));

  const table = new Table({
    head: ["Agent", "Status", "Auto-Approve Tools"],
    style: { head: ["cyan"] },
  });

  for (const [name, agent] of Object.entries(config.agents)) {
    table.push([
      name,
      agent.enabled ? chalk.green("enabled") : chalk.gray("disabled"),
      agent.auto_approve_tools.join(", "),
    ]);
  }

  console.log(table.toString());
  console.log("");
}

async function syncAgentConfigs(
  projectRoot: string,
  options: PermissionsOptions,
): Promise<void> {
  const config = await loadPermissions(projectRoot);
  const { created, skipped } = await writeAgentConfigs(projectRoot, config, {
    force: options.force,
  });

  console.log(chalk.bold("\n🔧 Agent Config Sync\n"));

  for (const c of created) {
    console.log(chalk.green(`  ✓ ${c}`));
  }
  for (const s of skipped) {
    console.log(chalk.gray(`  - ${s}`));
  }

  if (created.length === 0 && skipped.length === 0) {
    console.log(chalk.gray("  No agent configs generated."));
  }

  if (skipped.length > 0) {
    console.log(chalk.gray("\n  Use --force to overwrite existing configs."));
  }

  console.log("");
}
