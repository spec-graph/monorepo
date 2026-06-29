import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Graph, CheckDecl } from "../types/index";
import { readYaml } from "../utils/yaml";
import { StateMachineEngine } from "../engine/machine/index";
import { runCheck, CheckRunResult } from "../engine/check/index";
import { isBuiltinCheck } from "../engine/checks/builtin";

export interface CheckOptions {
  id?: string;
  layer?: string;
  dryRun?: boolean;
  timeout?: string;
  json?: boolean;
}

export async function checkCommand(
  projectRoot: string,
  options: CheckOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(
        chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
      );
      process.exit(1);
      return;
    }

    const checks = selectChecks(graph.checks || [], options);
    if (checks.length === 0) {
      console.log(chalk.yellow("No checks matched."));
      return;
    }

    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    await engine.getState();

    const results: CheckRunResult[] = [];
    for (const check of checks) {
      if (!options.json) {
        console.log(chalk.gray(`Running ${check.id}: ${check.command}`));
      }

      const state = await engine.getState();
      const result = await runCheck(check, {
        cwd: projectRoot,
        dryRun:
          options.dryRun ||
          (isPlaceholderCommand(check.command) &&
            !isBuiltinCheck(check.command)),
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
    } else {
      renderResults(results);
    }

    if (results.some((result) => result.status === "failed")) {
      process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

function selectChecks(checks: CheckDecl[], options: CheckOptions): CheckDecl[] {
  return checks.filter((check) => {
    if (options.id && check.id !== options.id) return false;
    if (options.layer && check.layer !== options.layer) return false;
    return true;
  });
}

function parseTimeout(timeout?: string): number {
  if (!timeout) return 120_000;
  const parsed = Number(timeout);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

function isPlaceholderCommand(command: string): boolean {
  return /^<[^>]+>$/.test(command.trim());
}

function renderResults(results: CheckRunResult[]): void {
  console.log("");
  console.log(chalk.bold("🧪 Check Results"));
  console.log("");

  const table = new Table({
    head: ["ID", "Status", "Exit", "Duration", "Command"],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  for (const result of results) {
    const status =
      result.status === "passed" ? chalk.green("✓ PASS") : chalk.red("✗ FAIL");
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
      console.log(chalk.red.bold(`Failure: ${result.id}`));
      if (result.stdout.trim()) {
        console.log(chalk.gray("stdout:"));
        console.log(result.stdout.slice(-2000));
      }
      if (result.stderr.trim()) {
        console.log(chalk.gray("stderr:"));
        console.log(result.stderr.slice(-2000));
      }
    }
  }

  console.log("");
}
