import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { StateMachineEngine, TransitionRequest } from "../engine/machine/index";
import { readYaml } from "../utils/yaml";
import { executeHooks } from "../engine/hooks";

export interface MachineOptions {
  stage?: string;
  from?: string;
  to?: string;
  action?: string;
  artifact?: string;
  check?: string;
  status?: string;
  restartStage?: boolean;
  projectRoot?: string;
}

export async function machineCommand(
  projectRoot: string,
  subcommand: string,
  options: MachineOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    // Load graph
    let graph: any;
    try {
      graph = await readYaml(graphPath);
    } catch {
      console.log(
        chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
      );
      process.exit(1);
      return;
    }

    // Create engine
    const engine = new StateMachineEngine(graph, statePath, projectRoot);

    // Handle restart-stage subcommand
    if (subcommand === "restart-stage" || options.restartStage) {
      const state = await engine.restartStage(projectRoot);
      console.log(chalk.yellow("⚠ Stage restarted (incomplete items reset to pending)"));
      console.log(chalk.gray(`  Current stage: ${state.current_stage}`));
      console.log(chalk.gray(`  Added to history: restart-stage`));
      return;
    }

    switch (subcommand) {
      case "init":
        await initMachine(engine, options);
        break;
      case "status":
        await showStatus(engine);
        break;
      case "transition":
        await executeHooks(projectRoot, "machine", "pre", [
          "transition",
          `--from=${options.from}`,
          `--to=${options.to}`,
        ]);
        await performTransition(engine, options);
        await executeHooks(projectRoot, "machine", "post", [
          "transition",
          `--from=${options.from}`,
          `--to=${options.to}`,
        ]);
        break;
      case "history":
        await showHistory(engine);
        break;
      case "artifacts":
        await showArtifacts(engine, options);
        break;
      case "update":
        await updateTrackedItem(engine, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
        console.log(
          "Available: init, status, transition, history, artifacts, update, restart-stage",
        );
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function initMachine(
  engine: StateMachineEngine,
  options: MachineOptions,
): Promise<void> {
  const state = await engine.initialize(options.stage);
  console.log(chalk.green("✓ State machine initialized"));
  console.log(chalk.gray(`  Starting stage: ${state.current_stage}`));
  console.log(chalk.gray(`  State file: .spec-graph/machine-state.yaml`));
}

async function showStatus(engine: StateMachineEngine): Promise<void> {
  const state = await engine.getState();

  console.log(chalk.bold("\n🤖 State Machine Status\n"));

  console.log(`  Current Stage: ${chalk.cyan(state.current_stage)}`);
  console.log(`  Total Transitions: ${state.stage_history.length}`);
  console.log(`  Created: ${state.metadata.created_at}`);
  console.log("");

  // Show artifacts
  const artifacts = await engine.getArtifacts();
  const artifactCount = Object.keys(artifacts).length;
  const completedArtifacts = Object.values(artifacts).filter(
    (a) => a.status === "completed",
  ).length;

  console.log(chalk.bold("  Artifacts:"));
  console.log(`    Total: ${artifactCount}`);
  console.log(`    Completed: ${completedArtifacts}`);

  if (artifactCount > 0) {
    console.log("");
    const artifactTable = new Table({
      head: ["ID", "Status", "Produced By"],
      style: { head: ["cyan"] },
    });

    for (const [id, artifact] of Object.entries(artifacts)) {
      const statusColor =
        artifact.status === "completed"
          ? chalk.green
          : artifact.status === "failed"
            ? chalk.red
            : chalk.yellow;

      artifactTable.push([
        id,
        statusColor(artifact.status),
        artifact.produced_by || "-",
      ]);
    }

    console.log(artifactTable.toString());
  }

  // Show checks
  const checks = await engine.getChecks();
  const checkCount = Object.keys(checks).length;
  const passedChecks = Object.values(checks).filter(
    (c) => c.status === "passed",
  ).length;

  console.log("");
  console.log(chalk.bold("  Checks:"));
  console.log(`    Total: ${checkCount}`);
  console.log(`    Passed: ${passedChecks}`);

  if (checkCount > 0) {
    console.log("");
    const checkTable = new Table({
      head: ["ID", "Status", "Executed At"],
      style: { head: ["cyan"] },
    });

    for (const [id, check] of Object.entries(checks)) {
      const statusColor =
        check.status === "passed"
          ? chalk.green
          : check.status === "failed"
            ? chalk.red
            : chalk.yellow;

      checkTable.push([
        id,
        statusColor(check.status),
        check.executed_at ? new Date(check.executed_at).toLocaleString() : "-",
      ]);
    }

    console.log(checkTable.toString());
  }

  console.log("");
}

async function performTransition(
  engine: StateMachineEngine,
  options: MachineOptions,
): Promise<void> {
  if (!options.from || !options.to) {
    console.log(chalk.red("✗ Missing required options: --from and --to"));
    process.exit(1);
    return;
  }

  const request: TransitionRequest = {
    from_stage: options.from,
    to_stage: options.to,
    triggered_by: options.action || "manual",
  };

  const result = await engine.transition(request);

  if (result.success) {
    console.log(
      chalk.green(`✓ Transition successful: ${options.from} → ${options.to}`),
    );

    if (result.gate_evaluation) {
      console.log(chalk.gray(`  Gate: ${result.gate_evaluation.gate_id}`));
      console.log(chalk.gray(`  Passed: ${result.gate_evaluation.passed}`));

      if (result.gate_evaluation.warnings.length > 0) {
        console.log(chalk.yellow("  Warnings:"));
        for (const warning of result.gate_evaluation.warnings) {
          console.log(chalk.yellow(`    • ${warning}`));
        }
      }
    }
  } else {
    console.log(chalk.red(`✗ Transition failed: ${result.error}`));

    if (result.gate_evaluation) {
      console.log(chalk.gray(`  Gate: ${result.gate_evaluation.gate_id}`));

      if (result.gate_evaluation.missing_artifacts.length > 0) {
        console.log(chalk.red("  Missing artifacts:"));
        for (const artifact of result.gate_evaluation.missing_artifacts) {
          console.log(chalk.red(`    • ${artifact}`));
        }
      }

      if (result.gate_evaluation.failed_checks.length > 0) {
        console.log(chalk.red("  Failed checks:"));
        for (const check of result.gate_evaluation.failed_checks) {
          console.log(chalk.red(`    • ${check}`));
        }
      }

      if (result.gate_evaluation.missing_traces.length > 0) {
        console.log(chalk.red("  Missing traces:"));
        for (const trace of result.gate_evaluation.missing_traces) {
          console.log(chalk.red(`    • ${trace}`));
        }
      }

      if (result.gate_evaluation.missing_contracts.length > 0) {
        console.log(chalk.red("  Stale/broken contracts:"));
        for (const contract of result.gate_evaluation.missing_contracts) {
          console.log(chalk.red(`    • ${contract}`));
        }
      }

      if (result.gate_evaluation.forbidden_violations.length > 0) {
        console.log(chalk.red("  Forbidden invariant violations:"));
        for (const violation of result.gate_evaluation.forbidden_violations) {
          console.log(chalk.red(`    • ${violation}`));
        }
      }
    }

    process.exit(1);
  }
}

async function showHistory(engine: StateMachineEngine): Promise<void> {
  const history = await engine.getHistory();

  if (history.length === 0) {
    console.log(chalk.yellow("\nNo transitions recorded yet.\n"));
    return;
  }

  console.log(chalk.bold("\n📜 Transition History\n"));

  const table = new Table({
    head: ["#", "From", "To", "When", "Triggered By", "Gate Passed"],
    style: { head: ["cyan"] },
  });

  history.forEach((transition, index) => {
    const gateStatus = transition.gate_evaluation.passed
      ? chalk.green("✓")
      : chalk.red("✗");

    table.push([
      index + 1,
      transition.from_stage,
      transition.to_stage,
      new Date(transition.timestamp).toLocaleString(),
      transition.triggered_by,
      gateStatus,
    ]);
  });

  console.log(table.toString());
  console.log("");
}

async function showArtifacts(
  engine: StateMachineEngine,
  options: MachineOptions,
): Promise<void> {
  const artifacts = await engine.getArtifacts();

  if (Object.keys(artifacts).length === 0) {
    console.log(chalk.yellow("\nNo artifacts tracked yet.\n"));
    return;
  }

  console.log(chalk.bold("\n📦 Tracked Artifacts\n"));

  const table = new Table({
    head: ["ID", "Status", "Produced By", "Consumed By"],
    style: { head: ["cyan"] },
  });

  for (const [id, artifact] of Object.entries(artifacts)) {
    const statusColor =
      artifact.status === "completed"
        ? chalk.green
        : artifact.status === "failed"
          ? chalk.red
          : chalk.yellow;

    table.push([
      id,
      statusColor(artifact.status),
      artifact.produced_by || "-",
      artifact.consumed_by?.join(", ") || "-",
    ]);
  }

  console.log(table.toString());
  console.log("");
}

async function updateTrackedItem(
  engine: StateMachineEngine,
  options: MachineOptions,
): Promise<void> {
  const status = (options.status || "completed") as any;

  if (options.artifact) {
    await engine.updateArtifact(options.artifact, { status });
    console.log(
      chalk.green(`✓ Artifact ${options.artifact} updated to ${status}`),
    );
    return;
  }

  if (options.check) {
    await engine.updateCheck(options.check, {
      status,
      executed_at: new Date().toISOString(),
    });
    console.log(chalk.green(`✓ Check ${options.check} updated to ${status}`));
    return;
  }

  console.log(chalk.red("✗ Missing required option: --artifact or --check"));
  process.exit(1);
}
