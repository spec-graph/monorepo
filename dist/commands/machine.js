"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineCommand = machineCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/machine/index");
const yaml_1 = require("../utils/yaml");
const hooks_1 = require("../engine/hooks");
async function machineCommand(projectRoot, subcommand, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
    try {
        // Load graph
        let graph;
        try {
            graph = await (0, yaml_1.readYaml)(graphPath);
        }
        catch {
            console.log(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
            process.exit(1);
            return;
        }
        // Create engine
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        // Handle restart-stage subcommand
        if (subcommand === "restart-stage" || options.restartStage) {
            const state = await engine.restartStage(projectRoot);
            console.log(chalk_1.default.yellow("⚠ Stage restarted (incomplete items reset to pending)"));
            console.log(chalk_1.default.gray(`  Current stage: ${state.current_stage}`));
            console.log(chalk_1.default.gray(`  Added to history: restart-stage`));
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
                await (0, hooks_1.executeHooks)(projectRoot, "machine", "pre", [
                    "transition",
                    `--from=${options.from}`,
                    `--to=${options.to}`,
                ]);
                await performTransition(engine, options);
                await (0, hooks_1.executeHooks)(projectRoot, "machine", "post", [
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
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: init, status, transition, history, artifacts, update, restart-stage");
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
async function initMachine(engine, options) {
    const state = await engine.initialize(options.stage);
    console.log(chalk_1.default.green("✓ State machine initialized"));
    console.log(chalk_1.default.gray(`  Starting stage: ${state.current_stage}`));
    console.log(chalk_1.default.gray(`  State file: .spec-graph/machine-state.yaml`));
}
async function showStatus(engine) {
    const state = await engine.getState();
    console.log(chalk_1.default.bold("\n🤖 State Machine Status\n"));
    console.log(`  Current Stage: ${chalk_1.default.cyan(state.current_stage)}`);
    console.log(`  Total Transitions: ${state.stage_history.length}`);
    console.log(`  Created: ${state.metadata.created_at}`);
    console.log("");
    // Show artifacts
    const artifacts = await engine.getArtifacts();
    const artifactCount = Object.keys(artifacts).length;
    const completedArtifacts = Object.values(artifacts).filter((a) => a.status === "completed").length;
    console.log(chalk_1.default.bold("  Artifacts:"));
    console.log(`    Total: ${artifactCount}`);
    console.log(`    Completed: ${completedArtifacts}`);
    if (artifactCount > 0) {
        console.log("");
        const artifactTable = new cli_table3_1.default({
            head: ["ID", "Status", "Produced By"],
            style: { head: ["cyan"] },
        });
        for (const [id, artifact] of Object.entries(artifacts)) {
            const statusColor = artifact.status === "completed"
                ? chalk_1.default.green
                : artifact.status === "failed"
                    ? chalk_1.default.red
                    : chalk_1.default.yellow;
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
    const passedChecks = Object.values(checks).filter((c) => c.status === "passed").length;
    console.log("");
    console.log(chalk_1.default.bold("  Checks:"));
    console.log(`    Total: ${checkCount}`);
    console.log(`    Passed: ${passedChecks}`);
    if (checkCount > 0) {
        console.log("");
        const checkTable = new cli_table3_1.default({
            head: ["ID", "Status", "Executed At"],
            style: { head: ["cyan"] },
        });
        for (const [id, check] of Object.entries(checks)) {
            const statusColor = check.status === "passed"
                ? chalk_1.default.green
                : check.status === "failed"
                    ? chalk_1.default.red
                    : chalk_1.default.yellow;
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
async function performTransition(engine, options) {
    if (!options.from || !options.to) {
        console.log(chalk_1.default.red("✗ Missing required options: --from and --to"));
        process.exit(1);
        return;
    }
    const request = {
        from_stage: options.from,
        to_stage: options.to,
        triggered_by: options.action || "manual",
    };
    const result = await engine.transition(request);
    if (result.success) {
        console.log(chalk_1.default.green(`✓ Transition successful: ${options.from} → ${options.to}`));
        if (result.gate_evaluation) {
            console.log(chalk_1.default.gray(`  Gate: ${result.gate_evaluation.gate_id}`));
            console.log(chalk_1.default.gray(`  Passed: ${result.gate_evaluation.passed}`));
            if (result.gate_evaluation.warnings.length > 0) {
                console.log(chalk_1.default.yellow("  Warnings:"));
                for (const warning of result.gate_evaluation.warnings) {
                    console.log(chalk_1.default.yellow(`    • ${warning}`));
                }
            }
        }
    }
    else {
        console.log(chalk_1.default.red(`✗ Transition failed: ${result.error}`));
        if (result.gate_evaluation) {
            console.log(chalk_1.default.gray(`  Gate: ${result.gate_evaluation.gate_id}`));
            if (result.gate_evaluation.missing_artifacts.length > 0) {
                console.log(chalk_1.default.red("  Missing artifacts:"));
                for (const artifact of result.gate_evaluation.missing_artifacts) {
                    console.log(chalk_1.default.red(`    • ${artifact}`));
                }
            }
            if (result.gate_evaluation.failed_checks.length > 0) {
                console.log(chalk_1.default.red("  Failed checks:"));
                for (const check of result.gate_evaluation.failed_checks) {
                    console.log(chalk_1.default.red(`    • ${check}`));
                }
            }
            if (result.gate_evaluation.missing_traces.length > 0) {
                console.log(chalk_1.default.red("  Missing traces:"));
                for (const trace of result.gate_evaluation.missing_traces) {
                    console.log(chalk_1.default.red(`    • ${trace}`));
                }
            }
            if (result.gate_evaluation.missing_contracts.length > 0) {
                console.log(chalk_1.default.red("  Stale/broken contracts:"));
                for (const contract of result.gate_evaluation.missing_contracts) {
                    console.log(chalk_1.default.red(`    • ${contract}`));
                }
            }
            if (result.gate_evaluation.forbidden_violations.length > 0) {
                console.log(chalk_1.default.red("  Forbidden invariant violations:"));
                for (const violation of result.gate_evaluation.forbidden_violations) {
                    console.log(chalk_1.default.red(`    • ${violation}`));
                }
            }
        }
        process.exit(1);
    }
}
async function showHistory(engine) {
    const history = await engine.getHistory();
    if (history.length === 0) {
        console.log(chalk_1.default.yellow("\nNo transitions recorded yet.\n"));
        return;
    }
    console.log(chalk_1.default.bold("\n📜 Transition History\n"));
    const table = new cli_table3_1.default({
        head: ["#", "From", "To", "When", "Triggered By", "Gate Passed"],
        style: { head: ["cyan"] },
    });
    history.forEach((transition, index) => {
        const gateStatus = transition.gate_evaluation.passed
            ? chalk_1.default.green("✓")
            : chalk_1.default.red("✗");
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
async function showArtifacts(engine, options) {
    const artifacts = await engine.getArtifacts();
    if (Object.keys(artifacts).length === 0) {
        console.log(chalk_1.default.yellow("\nNo artifacts tracked yet.\n"));
        return;
    }
    console.log(chalk_1.default.bold("\n📦 Tracked Artifacts\n"));
    const table = new cli_table3_1.default({
        head: ["ID", "Status", "Produced By", "Consumed By"],
        style: { head: ["cyan"] },
    });
    for (const [id, artifact] of Object.entries(artifacts)) {
        const statusColor = artifact.status === "completed"
            ? chalk_1.default.green
            : artifact.status === "failed"
                ? chalk_1.default.red
                : chalk_1.default.yellow;
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
async function updateTrackedItem(engine, options) {
    const status = (options.status || "completed");
    if (options.artifact) {
        await engine.updateArtifact(options.artifact, { status });
        console.log(chalk_1.default.green(`✓ Artifact ${options.artifact} updated to ${status}`));
        return;
    }
    if (options.check) {
        await engine.updateCheck(options.check, {
            status,
            executed_at: new Date().toISOString(),
        });
        console.log(chalk_1.default.green(`✓ Check ${options.check} updated to ${status}`));
        return;
    }
    console.log(chalk_1.default.red("✗ Missing required option: --artifact or --check"));
    process.exit(1);
}
//# sourceMappingURL=machine.js.map