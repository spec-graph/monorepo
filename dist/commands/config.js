"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configCommand = configCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const yaml_1 = require("../utils/yaml");
async function configCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const configPath = node_path_1.default.join(specGraphDir, "config.yaml");
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
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${sub}`));
                console.log(chalk_1.default.gray("Available: show, init, set, clear"));
                process.exitCode = 1;
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        process.exitCode = 1;
    }
}
async function showConfig(configPath, options) {
    const config = await (0, yaml_1.tryReadYaml)(configPath);
    if (!config) {
        console.log(chalk_1.default.yellow("No project config found."));
        console.log(chalk_1.default.gray("Run `spec-graph config init` to create one."));
        return;
    }
    if (options.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n📋 Project Config\n"));
    console.log(chalk_1.default.gray(`  Version: ${config.version}\n`));
    if (config.context && Object.keys(config.context).length > 0) {
        console.log(chalk_1.default.bold("  Context (injected into pack context):"));
        for (const [k, v] of Object.entries(config.context)) {
            console.log(`    • ${k}: ${v}`);
        }
        console.log("");
    }
    if (config.rules && Object.keys(config.rules).length > 0) {
        console.log(chalk_1.default.bold("  Rules (per-artifact validation guidance):"));
        for (const [k, v] of Object.entries(config.rules)) {
            console.log(`    • ${k}: ${v}`);
        }
        console.log("");
    }
    if (config.references && Object.keys(config.references).length > 0) {
        console.log(chalk_1.default.bold("  External References:"));
        for (const [k, v] of Object.entries(config.references)) {
            console.log(`    • ${k}: ${v}`);
        }
        console.log("");
    }
    if (!config.context && !config.rules && !config.references) {
        console.log(chalk_1.default.gray("  (empty config)"));
    }
    console.log(chalk_1.default.gray("  Re-compose after changes: spec-graph compose"));
}
async function initConfig(configPath, options) {
    try {
        await promises_1.default.access(configPath);
        console.log(chalk_1.default.yellow("Project config already exists."));
        console.log(chalk_1.default.gray("Use `spec-graph config clear` to remove, or edit directly."));
        return;
    }
    catch {
        // Doesn't exist — create it
    }
    const config = {
        version: "1",
        context: {
            tech_stack: "TODO: e.g. React 18 + TypeScript + Vite",
            conventions: "TODO: e.g. use kebab-case for file names",
        },
        rules: {},
        references: {},
    };
    await (0, yaml_1.writeYaml)(configPath, config);
    console.log(chalk_1.default.green("\n✓ Project config initialized at .spec-graph/config.yaml"));
    console.log(chalk_1.default.gray("  Edit the file to customize context/rules/references."));
    console.log(chalk_1.default.gray("  Then: spec-graph compose (to rebuild graph with new config)"));
}
async function setConfig(configPath, options) {
    if (!options.pairs) {
        console.log(chalk_1.default.red("✗ No key=value pairs provided."));
        console.log(chalk_1.default.gray("Usage: spec-graph config set <section>.<key>=<value>"));
        console.log(chalk_1.default.gray('Example: spec-graph config set context.tech_stack="React 18 + TS"'));
        process.exitCode = 1;
        return;
    }
    const config = (await (0, yaml_1.tryReadYaml)(configPath)) || {
        version: "1",
    };
    const pairs = options.pairs.split(",");
    for (const pair of pairs) {
        const [fullKey, ...valueParts] = pair.split("=");
        if (!fullKey || valueParts.length === 0) {
            console.log(chalk_1.default.yellow(`⚠ Skipping malformed pair: ${pair}`));
            continue;
        }
        const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Strip surrounding quotes
        const [section, key] = fullKey.split(".");
        if (!section || !key) {
            console.log(chalk_1.default.yellow(`⚠ Skipping pair without section: ${pair}`));
            continue;
        }
        if (!["context", "rules", "references"].includes(section)) {
            console.log(chalk_1.default.yellow(`⚠ Unknown section '${section}' (must be context|rules|references)`));
            continue;
        }
        const sectionKey = section;
        config[sectionKey] = config[sectionKey] || {};
        config[sectionKey][key] = value;
        console.log(chalk_1.default.green(`✓ Set ${section}.${key} = ${value}`));
    }
    await (0, yaml_1.writeYaml)(configPath, config);
    console.log(chalk_1.default.gray("\n  Re-compose: spec-graph compose"));
}
async function clearConfig(configPath, options) {
    try {
        await promises_1.default.access(configPath);
    }
    catch {
        console.log(chalk_1.default.yellow("No config to clear."));
        return;
    }
    await promises_1.default.unlink(configPath);
    console.log(chalk_1.default.green("\n✓ Project config removed."));
    console.log(chalk_1.default.gray("  Re-compose to rebuild graph without project config: spec-graph compose"));
}
//# sourceMappingURL=config.js.map