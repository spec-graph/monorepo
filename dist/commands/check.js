"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCommand = checkCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/machine/index");
const index_2 = require("../engine/check/index");
const builtin_1 = require("../engine/checks/builtin");
async function checkCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
    try {
        let graph;
        try {
            graph = await (0, yaml_1.readYaml)(graphPath);
        }
        catch {
            console.log(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
            process.exit(1);
            return;
        }
        const checks = selectChecks(graph.checks || [], options);
        if (checks.length === 0) {
            console.log(chalk_1.default.yellow("No checks matched."));
            return;
        }
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        await engine.getState();
        const results = [];
        for (const check of checks) {
            if (!options.json) {
                console.log(chalk_1.default.gray(`Running ${check.id}: ${check.command}`));
            }
            const state = await engine.getState();
            const result = await (0, index_2.runCheck)(check, {
                cwd: projectRoot,
                dryRun: options.dryRun ||
                    (isPlaceholderCommand(check.command) &&
                        !(0, builtin_1.isBuiltinCheck)(check.command)),
                timeoutMs: parseTimeout(options.timeout),
                graph,
                state,
            });
            await engine.updateCheck(check.id, {
                status: result.status,
                result: {
                    command: result.command,
                    exit_code: result.exit_code,
                    duration_ms: result.duration_ms,
                    stdout: result.stdout.slice(-4000),
                    stderr: result.stderr.slice(-4000),
                },
                executed_at: result.finished_at,
            });
            results.push(result);
        }
        if (options.json) {
            console.log(JSON.stringify({ results }, null, 2));
        }
        else {
            renderResults(results);
        }
        if (results.some((result) => result.status === "failed")) {
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
function selectChecks(checks, options) {
    return checks.filter((check) => {
        if (options.id && check.id !== options.id)
            return false;
        if (options.layer && check.layer !== options.layer)
            return false;
        return true;
    });
}
function parseTimeout(timeout) {
    if (!timeout)
        return 120_000;
    const parsed = Number(timeout);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}
function isPlaceholderCommand(command) {
    return /^<[^>]+>$/.test(command.trim());
}
function renderResults(results) {
    console.log("");
    console.log(chalk_1.default.bold("🧪 Check Results"));
    console.log("");
    const table = new cli_table3_1.default({
        head: ["ID", "Status", "Exit", "Duration", "Command"],
        style: { head: ["cyan"] },
        wordWrap: true,
    });
    for (const result of results) {
        const status = result.status === "passed" ? chalk_1.default.green("✓ PASS") : chalk_1.default.red("✗ FAIL");
        table.push([
            result.id,
            status,
            result.exit_code === null ? "-" : String(result.exit_code),
            `${result.duration_ms}ms`,
            result.command,
        ]);
    }
    console.log(table.toString());
    for (const result of results) {
        if (result.status === "failed") {
            console.log("");
            console.log(chalk_1.default.red.bold(`Failure: ${result.id}`));
            if (result.stdout.trim()) {
                console.log(chalk_1.default.gray("stdout:"));
                console.log(result.stdout.slice(-2000));
            }
            if (result.stderr.trim()) {
                console.log(chalk_1.default.gray("stderr:"));
                console.log(result.stderr.slice(-2000));
            }
        }
    }
    console.log("");
}
//# sourceMappingURL=check.js.map