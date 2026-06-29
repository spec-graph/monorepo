import { spawn } from "node:child_process";
import {
  isBuiltinCheck,
  extractBuiltinName,
  runBuiltinCheck,
  BuiltinCheckContext,
} from "../checks/builtin";
import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";
import { CheckDecl } from "../../types/index";

export interface CheckRunResult {
  id: string;
  command: string;
  status: "passed" | "failed";
  exit_code: number | null;
  stdout: string;
  stderr: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

export interface RunCheckOptions {
  cwd: string;
  timeoutMs?: number;
  dryRun?: boolean;
  graph?: Graph;
  state?: MachineState;
}

export async function runCheck(
  check: CheckDecl,
  options: RunCheckOptions,
): Promise<CheckRunResult> {
  const startedAt = new Date();

  if (options.dryRun) {
    return {
      id: check.id,
      command: check.command,
      status: "passed",
      exit_code: 0,
      stdout: "",
      stderr: "",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
    };
  }

  // Detect and route builtin checks
  if (isBuiltinCheck(check.command) && options.graph && options.state) {
    const builtinName = extractBuiltinName(check.command)!;
    const ctx: BuiltinCheckContext = {
      projectRoot: options.cwd,
      graph: options.graph,
      state: options.state,
    };
    const builtinResult = await runBuiltinCheck(builtinName, ctx);
    const finishedAt = new Date();
    return {
      id: check.id,
      command: check.command,
      status: builtinResult.passed ? "passed" : "failed",
      exit_code: builtinResult.exit_code,
      stdout: builtinResult.stdout,
      stderr: builtinResult.stderr,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    };
  }

  const result = await runShellCommand(check.command, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs || 120_000,
  });

  const finishedAt = new Date();

  return {
    id: check.id,
    command: check.command,
    status: result.exitCode === 0 ? "passed" : "failed",
    exit_code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
  };
}

function runShellCommand(
  command: string,
  options: { cwd: string; timeoutMs: number },
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGTERM");
      resolve({
        exitCode: 124,
        stdout,
        stderr: stderr + `\nCommand timed out after ${options.timeoutMs}ms`,
      });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ exitCode: code, stdout, stderr });
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ exitCode: 1, stdout, stderr: stderr + error.message });
    });
  });
}
