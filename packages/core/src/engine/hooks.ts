import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { readYaml } from "../utils/yaml";
import { HooksConfig, HookDecl, HookWhen } from "../types/hooks";

const execAsync = promisify(exec);

/**
 * Load hooks configuration from .spec-graph/hooks.yaml.
 * Returns empty hooks list if file doesn't exist or is invalid.
 */
export async function loadHooks(
  projectRoot: string,
): Promise<HooksConfig> {
  try {
    const hooksPath = path.join(projectRoot, ".spec-graph", "hooks.yaml");
    const config = await readYaml<HooksConfig>(hooksPath);
    return config || { version: "1", hooks: [] };
  } catch {
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
export async function executeHooks(
  projectRoot: string,
  commandName: string,
  when: HookWhen,
  args: string[] = [],
): Promise<HookResult[]> {
  const config = await loadHooks(projectRoot);
  const results: HookResult[] = [];

  const applicableHooks = config.hooks.filter((hook) => {
    // Check timing
    if (hook.when !== when) return false;

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

interface HookResult {
  hook: HookDecl;
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

async function executeHook(
  projectRoot: string,
  commandName: string,
  hook: HookDecl,
): Promise<HookResult> {
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
  } catch (error: any) {
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
