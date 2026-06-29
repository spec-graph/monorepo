"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gateCommand = gateCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/enforce/index");
const yaml_1 = require("../utils/yaml");
async function gateCommand(projectRoot, options) {
    try {
        const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
        const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
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
        console.log(chalk_1.default.bold("\n🚧 Gate Evaluation\n"));
        // Run enforce engine
        const result = await (0, index_1.runEnforce)(projectRoot, graph, {
            phase: options.phase,
        });
        if (result.evaluated_gates.length === 0) {
            console.log(chalk_1.default.yellow("No gates defined in graph."));
            return;
        }
        // Display gate results
        const table = new cli_table3_1.default({
            head: ["Gate ID", "Status", "Missing"],
            style: { head: ["cyan"] },
        });
        for (const gate of result.evaluated_gates) {
            const status = gate.passed ? chalk_1.default.green("✓ PASS") : chalk_1.default.red("✗ FAIL");
            const missing = [];
            if (gate.missing_artifacts.length > 0) {
                missing.push(`${gate.missing_artifacts.length} artifacts`);
            }
            if (gate.missing_checks.length > 0) {
                missing.push(`${gate.missing_checks.length} checks`);
            }
            if (gate.missing_traces.length > 0) {
                missing.push(`${gate.missing_traces.length} traces`);
            }
            if (gate.violated_forbids.length > 0) {
                missing.push(`${gate.violated_forbids.length} invariants`);
            }
            const missingStr = missing.length > 0 ? missing.join(", ") : "-";
            table.push([gate.gate_id, status, missingStr]);
        }
        console.log(table.toString());
        for (const gate of result.evaluated_gates) {
            if (gate.warnings.length === 0)
                continue;
            console.log("");
            console.log(chalk_1.default.yellow(`  Warnings for ${gate.gate_id}:`));
            for (const warning of gate.warnings) {
                console.log(chalk_1.default.yellow(`    • ${warning}`));
            }
        }
        // Summary
        console.log("");
        const passedCount = result.evaluated_gates.filter((g) => g.passed).length;
        const totalCount = result.evaluated_gates.length;
        console.log(chalk_1.default.bold(`  Summary: ${passedCount}/${totalCount} gates passed`));
        if (result.blocking_gates.length > 0) {
            console.log("");
            console.log(chalk_1.default.red.bold("  ❌ BLOCKED by gates:"));
            for (const gateId of result.blocking_gates) {
                console.log(chalk_1.default.red(`    • ${gateId}`));
            }
            console.log("");
            process.exit(1);
        }
        else {
            console.log(chalk_1.default.green("\n  ✅ All gates passed!"));
            console.log("");
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=gate.js.map