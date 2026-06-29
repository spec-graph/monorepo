"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsCommand = permissionsCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/permissions/index");
async function permissionsCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    try {
        // Verify initialized
        try {
            await promises_1.default.access(specGraphDir);
        }
        catch {
            console.log(chalk_1.default.red("✗ Project not initialized. Run `spec-graph init` first."));
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
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: show, set, list-agents, sync");
                process.exit(1);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
async function showPermissions(projectRoot, options) {
    const config = await (0, index_1.loadPermissions)(projectRoot);
    if (options.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n🔐 Permission Configuration\n"));
    const levelColor = config.level === "full-auto"
        ? chalk_1.default.green
        : config.level === "semi-auto"
            ? chalk_1.default.cyan
            : config.level === "manual"
                ? chalk_1.default.yellow
                : chalk_1.default.magenta;
    console.log(`  Level: ${levelColor(config.level)}`);
    console.log("");
    // Auto-execute actions
    console.log(chalk_1.default.bold("  Auto-Execute (spec-graph run):"));
    if (config.allow.auto_execute.length === 0) {
        console.log(chalk_1.default.gray("    (none — manual mode)"));
    }
    else {
        for (const action of config.allow.auto_execute) {
            console.log(`    ✓ ${action}`);
        }
    }
    // Agent actions
    console.log("");
    console.log(chalk_1.default.bold("  Agent Actions (dispatch manifest):"));
    for (const action of config.allow.agent_actions) {
        const auto = config.allow.auto_execute.includes(action)
            ? chalk_1.default.green(" [auto]")
            : "";
        console.log(`    • ${action}${auto}`);
    }
    // File scope
    console.log("");
    console.log(chalk_1.default.bold("  File Scope:"));
    console.log(`    Read:  ${config.file_scope.read.join(", ")}`);
    console.log(`    Write: ${config.file_scope.write.join(", ")}`);
    // Agents
    console.log("");
    console.log(chalk_1.default.bold("  Registered Agents:"));
    for (const [name, agent] of Object.entries(config.agents)) {
        const status = agent.enabled
            ? chalk_1.default.green("enabled")
            : chalk_1.default.gray("disabled");
        console.log(`    ${name}: ${status}`);
        console.log(`      Auto-approve: ${agent.auto_approve_tools.join(", ")}`);
        if (agent.note)
            console.log(chalk_1.default.gray(`      ${agent.note}`));
    }
    console.log("");
}
async function setPermissionLevel(projectRoot, options) {
    if (!options.level) {
        console.log(chalk_1.default.red("✗ Missing --level option. Usage: spec-graph permissions set --level <full-auto|semi-auto|manual>"));
        process.exit(1);
        return;
    }
    const level = options.level;
    const validLevels = [
        "full-auto",
        "semi-auto",
        "manual",
        "custom",
    ];
    if (!validLevels.includes(level)) {
        console.log(chalk_1.default.red(`✗ Invalid level: ${level}`));
        console.log(`Valid: ${validLevels.join(", ")}`);
        process.exit(1);
        return;
    }
    if (level === "custom") {
        console.log(chalk_1.default.yellow("Custom level must be configured by editing .spec-graph/permissions.yaml directly."));
        process.exit(1);
        return;
    }
    const config = (0, index_1.getPreset)(level);
    await (0, index_1.savePermissions)(projectRoot, config);
    console.log(chalk_1.default.green(`✓ Permission level set to: ${level}`));
    console.log(chalk_1.default.gray(`  Auto-execute: [${config.allow.auto_execute.join(", ")}]`));
    console.log(chalk_1.default.gray(`  Config: .spec-graph/permissions.yaml`));
}
async function listAgents(projectRoot, options) {
    const config = await (0, index_1.loadPermissions)(projectRoot);
    if (options.json) {
        console.log(JSON.stringify(config.agents, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n🤖 Registered Agents\n"));
    const table = new cli_table3_1.default({
        head: ["Agent", "Status", "Auto-Approve Tools"],
        style: { head: ["cyan"] },
    });
    for (const [name, agent] of Object.entries(config.agents)) {
        table.push([
            name,
            agent.enabled ? chalk_1.default.green("enabled") : chalk_1.default.gray("disabled"),
            agent.auto_approve_tools.join(", "),
        ]);
    }
    console.log(table.toString());
    console.log("");
}
async function syncAgentConfigs(projectRoot, options) {
    const config = await (0, index_1.loadPermissions)(projectRoot);
    const { created, skipped } = await (0, index_1.writeAgentConfigs)(projectRoot, config, {
        force: options.force,
    });
    console.log(chalk_1.default.bold("\n🔧 Agent Config Sync\n"));
    for (const c of created) {
        console.log(chalk_1.default.green(`  ✓ ${c}`));
    }
    for (const s of skipped) {
        console.log(chalk_1.default.gray(`  - ${s}`));
    }
    if (created.length === 0 && skipped.length === 0) {
        console.log(chalk_1.default.gray("  No agent configs generated."));
    }
    if (skipped.length > 0) {
        console.log(chalk_1.default.gray("\n  Use --force to overwrite existing configs."));
    }
    console.log("");
}
//# sourceMappingURL=permissions.js.map