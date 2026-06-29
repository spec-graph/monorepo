"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHooks = loadHooks;
exports.executeHooks = executeHooks;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_path_1 = __importDefault(require("node:path"));
const yaml_1 = require("../utils/yaml");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
/**
 * Load hooks configuration from .spec-graph/hooks.yaml.
 * Returns empty hooks list if file doesn't exist or is invalid.
 */
async function loadHooks(projectRoot) {
    try {
        const hooksPath = node_path_1.default.join(projectRoot, ".spec-graph", "hooks.yaml");
        const config = await (0, yaml_1.readYaml)(hooksPath);
        return config || { version: "1", hooks: [] };
    }
    catch {
        return { version: "1", hooks: [] };
    }
}
/**
 * Execute hooks for a given command and timing (pre/post).
 *
 * @param projectRoot Project root directory
 * @param commandName Name of the spec-graph command (e.g., 'dispatch')
 * @param when 'pre' or 'post'
 * @param args Optional command arguments for pattern matching
 * @returns Array of hook execution results
 */
async function executeHooks(projectRoot, commandName, when, args = []) {
    const config = await loadHooks(projectRoot);
    const results = [];
    const applicableHooks = config.hooks.filter((hook) => {
        // Check timing
        if (hook.when !== when)
            return false;
        // Check command name
        if (hook.command_name && hook.command_name !== commandName) {
            return false;
        }
        // Check args pattern (simple substring match for now)
        if (hook.args_pattern) {
            const argsStr = args.join(" ");
            if (!argsStr.includes(hook.args_pattern)) {
                return false;
            }
        }
        return true;
    });
    for (const hook of applicableHooks) {
        const result = await executeHook(projectRoot, commandName, hook);
        results.push(result);
        // If pre hook failed and abort_on_failure is true, stop executing more hooks
        if (when === "pre" && !result.success && hook.abort_on_failure) {
            break;
        }
    }
    return results;
}
async function executeHook(projectRoot, commandName, hook) {
    const startTime = Date.now();
    const timeoutMs = hook.timeout_ms || 10000;
    // Set environment variables for hook
    const env = {
        ...process.env,
        SPEC_GRAPH_PROJECT_ROOT: projectRoot,
        SPEC_GRAPH_COMMAND: commandName,
    };
    try {
        const { stdout, stderr } = await execAsync(hook.command, {
            cwd: projectRoot,
            env,
            timeout: timeoutMs,
        });
        return {
            hook,
            success: true,
            exit_code: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            hook,
            success: false,
            exit_code: error.code || 1,
            stdout: error.stdout?.trim() || "",
            stderr: error.stderr?.trim() || error.message,
            duration_ms: Date.now() - startTime,
        };
    }
}
//# sourceMappingURL=hooks.js.map