"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusCommand = statusCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/machine/index");
const index_2 = require("../engine/next/index");
const index_3 = require("../engine/trace/index");
const index_4 = require("../engine/workflow/index");
const index_5 = require("../engine/permissions/index");
const yaml_1 = require("../utils/yaml");
async function statusCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
    const profilePath = node_path_1.default.join(specGraphDir, "profile.yaml");
    try {
        let graph;
        try {
            graph = await (0, yaml_1.readYaml)(graphPath);
        }
        catch {
            console.log(chalk_1.default.red("✗ Not composed. Run `spec-graph compose` first."));
            process.exit(1);
            return;
        }
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        const state = await engine.getState();
        const traceIndex = await (0, index_3.buildTraceIndex)(projectRoot, graph);
        const plan = await (0, index_2.computeNextPlan)(graph, state, traceIndex, projectRoot);
        const permissions = await (0, index_5.loadPermissions)(projectRoot);
        // Pipeline stage order
        const stageOrder = (0, index_4.inferStageOrder)(graph);
        if (options.json) {
            console.log(JSON.stringify({
                current_stage: state.current_stage,
                pipeline: stageOrder,
                artifacts: state.artifacts,
                checks: state.checks,
                plan: {
                    next_stage: plan.next_stage,
                    gate_passed: plan.gate_passed,
                    blocking_gate: plan.blocking_gate,
                    missing_artifacts: plan.missing_artifacts,
                    failed_checks: plan.failed_checks,
                    missing_traces: plan.missing_traces,
                    missing_contracts: plan.missing_contracts,
                    forbidden_violations: plan.forbidden_violations,
                    done: plan.done,
                    suggested_actions: plan.suggested_actions,
                },
                permissions: { level: permissions.level },
            }, null, 2));
            return;
        }
        // ── Header ──
        console.log(chalk_1.default.bold("\n📊 spec-graph Status\n"));
        // Pipeline progress bar
        const stageIndex = stageOrder.indexOf(state.current_stage);
        const stageParts = [];
        for (let i = 0; i < stageOrder.length; i++) {
            if (i < stageIndex) {
                stageParts.push(chalk_1.default.green("✓ " + stageOrder[i]));
            }
            else if (i === stageIndex) {
                stageParts.push(chalk_1.default.cyan.bold("▶ " + stageOrder[i]));
            }
            else {
                stageParts.push(chalk_1.default.gray("· " + stageOrder[i]));
            }
        }
        console.log("  " + stageParts.join(chalk_1.default.gray("  →  ")));
        console.log("");
        // Quick stats
        const totalArtifacts = Object.keys(state.artifacts).length;
        const completedArtifacts = Object.values(state.artifacts).filter((a) => a.status === "completed").length;
        const totalChecks = Object.keys(state.checks).length;
        const passedChecks = Object.values(state.checks).filter((c) => c.status === "passed").length;
        console.log(`  Change:  ${chalk_1.default.cyan(graph.meta.change_type || "N/A")}    Permissions: ${chalk_1.default.cyan(permissions.level)}`);
        console.log(`  Stage:   ${chalk_1.default.cyan(state.current_stage)}    Artifacts: ${chalk_1.default.green(String(completedArtifacts))}/${totalArtifacts}    Checks: ${chalk_1.default.green(String(passedChecks))}/${totalChecks}`);
        console.log("");
        // ── Artifacts ──
        if (totalArtifacts > 0) {
            console.log(chalk_1.default.bold("  Artifacts"));
            const artTable = new cli_table3_1.default({
                head: ["ID", "Status", "Producer"],
                style: { head: ["cyan"] },
                wordWrap: true,
            });
            for (const [id, a] of Object.entries(state.artifacts)) {
                artTable.push([id, colorStatus(a.status), a.produced_by || "-"]);
            }
            console.log(artTable.toString());
            console.log("");
        }
        // ── Checks ──
        if (totalChecks > 0) {
            console.log(chalk_1.default.bold("  Checks"));
            const checkTable = new cli_table3_1.default({
                head: ["ID", "Status"],
                style: { head: ["cyan"] },
                wordWrap: true,
            });
            for (const [id, c] of Object.entries(state.checks)) {
                checkTable.push([id, colorStatus(c.status)]);
            }
            console.log(checkTable.toString());
            console.log("");
        }
        // ── Gate Status ──
        if (plan.blocking_gate) {
            const gateStatus = plan.gate_passed
                ? chalk_1.default.green("PASSED")
                : chalk_1.default.red("BLOCKED");
            console.log(chalk_1.default.bold("  Gate Status"));
            console.log(`    Gate:  ${plan.blocking_gate}`);
            console.log(`    State: ${gateStatus}`);
            if (!plan.gate_passed) {
                if (plan.missing_artifacts.length)
                    console.log(chalk_1.default.red(`    Missing artifacts: ${plan.missing_artifacts.join(", ")}`));
                if (plan.failed_checks.length)
                    console.log(chalk_1.default.red(`    Failed checks: ${plan.failed_checks.join(", ")}`));
                if (plan.missing_traces.length)
                    console.log(chalk_1.default.red(`    Missing traces: ${plan.missing_traces.join(", ")}`));
                if (plan.missing_contracts.length)
                    console.log(chalk_1.default.red(`    Contract drift: ${plan.missing_contracts.length} consumer(s)`));
                if (plan.forbidden_violations.length)
                    console.log(chalk_1.default.red(`    Forbidden: ${plan.forbidden_violations.join(", ")}`));
            }
            console.log("");
        }
        // ── Next Action ──
        if (!plan.done) {
            const action = plan.suggested_actions[0];
            console.log(chalk_1.default.bold("  Next Action"));
            console.log(`    ${action?.description || "N/A"}`);
            // Deterministic actions can be auto-run; LLM-requiring actions need dispatch.
            const isDeterministic = action?.type === "run_check" ||
                action?.type === "verify_trace" ||
                action?.type === "transition";
            if (isDeterministic) {
                console.log(chalk_1.default.gray(`    Auto: spec-graph run`));
            }
            else {
                console.log(chalk_1.default.gray(`    Manual: spec-graph dispatch`));
            }
            console.log("");
        }
        else {
            console.log(chalk_1.default.green.bold("  ✓ Workflow complete\n"));
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
function colorStatus(status) {
    if (status === "completed" || status === "passed")
        return chalk_1.default.green(status);
    if (status === "failed" || status === "blocked")
        return chalk_1.default.red(status);
    if (status === "ready")
        return chalk_1.default.blue(status);
    if (status === "in_progress" || status === "running")
        return chalk_1.default.yellow(status);
    return chalk_1.default.gray(status);
}
//# sourceMappingURL=status.js.map