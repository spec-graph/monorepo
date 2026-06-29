import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { ProjectConfig } from "../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../utils/yaml";

export interface ConfigOptions {
  subcommand?: string;
  pairs?: string;
  json?: boolean;
}

export async function configCommand(
  projectRoot: string,
  options: ConfigOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const configPath = path.join(specGraphDir, "config.yaml");
  const sub = options.subcommand || "show";

  try {
    switch (sub) {
      case "show":
        return showConfig(configPath, options);
      case "init":
        return initConfig(configPath, options);
      case "set":
        return setConfig(configPath, options);
      case "clear":
        return clearConfig(configPath, options);
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${sub}`));
        console.log(chalk.gray("Available: show, init, set, clear"));
        process.exitCode = 1;
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exitCode = 1;
  }
}

async function showConfig(
  configPath: string,
  options: ConfigOptions,
): Promise<void> {
  const config = await tryReadYaml<ProjectConfig>(configPath);
  if (!config) {
    console.log(chalk.yellow("No project config found."));
    console.log(chalk.gray("Run `spec-graph config init` to create one."));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(chalk.bold("\n📋 Project Config\n"));
  console.log(chalk.gray(`  Version: ${config.version}\n`));

  if (config.context && Object.keys(config.context).length > 0) {
    console.log(chalk.bold("  Context (injected into pack context):"));
    for (const [k, v] of Object.entries(config.context)) {
      console.log(`    • ${k}: ${v}`);
    }
    console.log("");
  }

  if (config.rules && Object.keys(config.rules).length > 0) {
    console.log(chalk.bold("  Rules (per-artifact validation guidance):"));
    for (const [k, v] of Object.entries(config.rules)) {
      console.log(`    • ${k}: ${v}`);
    }
    console.log("");
  }

  if (config.references && Object.keys(config.references).length > 0) {
    console.log(chalk.bold("  External References:"));
    for (const [k, v] of Object.entries(config.references)) {
      console.log(`    • ${k}: ${v}`);
    }
    console.log("");
  }

  if (!config.context && !config.rules && !config.references) {
    console.log(chalk.gray("  (empty config)"));
  }

  console.log(chalk.gray("  Re-compose after changes: spec-graph compose"));
}

async function initConfig(
  configPath: string,
  options: ConfigOptions,
): Promise<void> {
  try {
    await fs.access(configPath);
    console.log(chalk.yellow("Project config already exists."));
    console.log(
      chalk.gray("Use `spec-graph config clear` to remove, or edit directly."),
    );
    return;
  } catch {
    // Doesn't exist — create it
  }

  const config: ProjectConfig = {
    version: "1",
    context: {
      tech_stack: "TODO: e.g. React 18 + TypeScript + Vite",
      conventions: "TODO: e.g. use kebab-case for file names",
    },
    rules: {},
    references: {},
  };

  await writeYaml(configPath, config);
  console.log(
    chalk.green("\n✓ Project config initialized at .spec-graph/config.yaml"),
  );
  console.log(
    chalk.gray("  Edit the file to customize context/rules/references."),
  );
  console.log(
    chalk.gray("  Then: spec-graph compose (to rebuild graph with new config)"),
  );
}

async function setConfig(
  configPath: string,
  options: ConfigOptions,
): Promise<void> {
  if (!options.pairs) {
    console.log(chalk.red("✗ No key=value pairs provided."));
    console.log(
      chalk.gray("Usage: spec-graph config set <section>.<key>=<value>"),
    );
    console.log(
      chalk.gray(
        'Example: spec-graph config set context.tech_stack="React 18 + TS"',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const config = (await tryReadYaml<ProjectConfig>(configPath)) || {
    version: "1",
  };
  const pairs = options.pairs.split(",");

  for (const pair of pairs) {
    const [fullKey, ...valueParts] = pair.split("=");
    if (!fullKey || valueParts.length === 0) {
      console.log(chalk.yellow(`⚠ Skipping malformed pair: ${pair}`));
      continue;
    }

    const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Strip surrounding quotes
    const [section, key] = fullKey.split(".");

    if (!section || !key) {
      console.log(chalk.yellow(`⚠ Skipping pair without section: ${pair}`));
      continue;
    }

    if (!["context", "rules", "references"].includes(section)) {
      console.log(
        chalk.yellow(
          `⚠ Unknown section '${section}' (must be context|rules|references)`,
        ),
      );
      continue;
    }

    const sectionKey = section as "context" | "rules" | "references";
    config[sectionKey] = config[sectionKey] || {};
    config[sectionKey]![key] = value;
    console.log(chalk.green(`✓ Set ${section}.${key} = ${value}`));
  }

  await writeYaml(configPath, config);
  console.log(chalk.gray("\n  Re-compose: spec-graph compose"));
}

async function clearConfig(
  configPath: string,
  options: ConfigOptions,
): Promise<void> {
  try {
    await fs.access(configPath);
  } catch {
    console.log(chalk.yellow("No config to clear."));
    return;
  }

  await fs.unlink(configPath);
  console.log(chalk.green("\n✓ Project config removed."));
  console.log(
    chalk.gray(
      "  Re-compose to rebuild graph without project config: spec-graph compose",
    ),
  );
}
