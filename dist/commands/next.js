"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextCommand = nextCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/machine/index");
const index_2 = require("../engine/next/index");
const index_3 = require("../engine/trace/index");
async function nextCommand(projectRoot, options) {
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
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        const state = await engine.getState();
        const traceIndex = await (0, index_3.buildTraceIndex)(projectRoot, graph);
        const plan = await (0, index_2.computeNextPlan)(graph, state, traceIndex, projectRoot);
        if (options.json) {
            console.log(JSON.stringify(plan, null, 2));
            return;
        }
        renderNextPlan(plan);
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
function renderNextPlan(plan) {
    console.log(chalk_1.default.bold("\n🧭 Next Step\n"));
    console.log(`  Current Stage: ${chalk_1.default.cyan(plan.current_stage)}`);
    if (plan.done) {
        console.log(chalk_1.default.green("  Workflow is complete."));
        console.log("");
        return;
    }
    console.log(`  Next Stage:    ${chalk_1.default.cyan(plan.next_stage || "-")}`);
    console.log(`  Transition:    ${plan.transition || "-"}`);
    console.log(`  Gate:          ${plan.blocking_gate || "no gate"}`);
    console.log(`  Gate Passed:   ${plan.gate_passed ? chalk_1.default.green("yes") : chalk_1.default.red("no")}`);
    console.log("");
    if (!plan.gate_passed) {
        const blockersTable = new cli_table3_1.default({
            head: ["Type", "ID"],
            style: { head: ["cyan"] },
        });
        for (const id of plan.missing_artifacts)
            blockersTable.push(["missing artifact", id]);
        for (const id of plan.failed_checks)
            blockersTable.push(["failed/missing check", id]);
        for (const id of plan.missing_traces)
            blockersTable.push(["missing trace", id]);
        for (const id of plan.missing_contracts)
            blockersTable.push(["contract drift", id]);
        for (const id of plan.forbidden_violations)
            blockersTable.push(["forbidden violation", id]);
        console.log(chalk_1.default.bold("  Blocking Items:"));
        console.log(blockersTable.toString());
        console.log("");
    }
    console.log(chalk_1.default.bold("  Suggested Actions:"));
    const actionsTable = new cli_table3_1.default({
        head: ["#", "Type", "ID", "Command / Description"],
        style: { head: ["cyan"] },
        wordWrap: true,
    });
    plan.suggested_actions.forEach((action, index) => {
        actionsTable.push([
            index + 1,
            action.type,
            action.id,
            action.command || action.description,
        ]);
    });
    console.log(actionsTable.toString());
    console.log("");
}
//# sourceMappingURL=next.js.map