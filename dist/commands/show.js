"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showCommand = showCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
async function showCommand(projectRoot, options) {
    try {
        const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
        const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
        const profilePath = node_path_1.default.join(specGraphDir, "profile.yaml");
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
        // Load profile
        let profile;
        try {
            profile = await (0, yaml_1.readYaml)(profilePath);
        }
        catch {
            profile = null;
        }
        if (options.format === "json") {
            console.log(JSON.stringify(graph, null, 2));
            return;
        }
        // Display summary
        console.log(chalk_1.default.bold("\n📊 Spec-Graph Summary\n"));
        // Meta info
        console.log(chalk_1.default.gray(`  Composed: ${graph.meta.composed_at}`));
        console.log(chalk_1.default.gray(`  Change Type: ${graph.meta.change_type || "N/A"}`));
        console.log(chalk_1.default.gray(`  Packs Used: ${graph.meta.packs_used.length}`));
        console.log("");
        // Counts
        console.log(chalk_1.default.bold("  Graph Statistics:"));
        console.log(`    • Artifacts: ${graph.artifacts.length}`);
        console.log(`    • Actions: ${graph.actions.length}`);
        console.log(`    • Checks: ${graph.checks.length}`);
        console.log(`    • Gates: ${graph.gates.length}`);
        console.log(`    • Tracks: ${graph.tracks.length}`);
        console.log("");
        // Pipeline stages
        console.log(chalk_1.default.bold("  Pipeline Stages:"));
        const stages = graph.pipeline_skeleton.stages.join(" → ");
        console.log(`    ${stages}`);
        console.log(`    Max retries: ${graph.pipeline_skeleton.max_retries}`);
        console.log(`    On exhausted: ${graph.pipeline_skeleton.on_exhausted}`);
        console.log("");
        // Gates table
        if (graph.gates.length > 0) {
            console.log(chalk_1.default.bold("  Gates:"));
            const gateTable = new cli_table3_1.default({
                head: ["ID", "On Transition", "Requirements", "Fail Mode", "Enabled"],
                style: { head: ["cyan"] },
            });
            for (const gate of graph.gates) {
                const reqCount = (gate.require_artifacts?.length || 0) +
                    (gate.require_checks?.length || 0) +
                    (gate.require_traces?.length || 0) +
                    (gate.forbid?.length || 0);
                gateTable.push([
                    gate.id,
                    (gate.on_transition || []).join(", ") || "-",
                    reqCount.toString(),
                    gate.fail_mode,
                    gate.enabled ? "✓" : "✗",
                ]);
            }
            console.log(gateTable.toString());
            console.log("");
        }
        // Tracks table
        if (graph.tracks.length > 0) {
            console.log(chalk_1.default.bold("  Parallel Tracks:"));
            const trackTable = new cli_table3_1.default({
                head: ["ID", "Scope", "Actions", "Produces", "Consumes"],
                style: { head: ["cyan"] },
            });
            for (const track of graph.tracks) {
                trackTable.push([
                    track.id,
                    track.scope,
                    (track.actions || []).length.toString(),
                    (track.produces || []).join(", ") || "-",
                    (track.consumes || []).join(", ") || "-",
                ]);
            }
            console.log(trackTable.toString());
            console.log("");
        }
        // Scope policy
        if (graph.scope_policy) {
            console.log(chalk_1.default.bold("  Scope Policy:"));
            if (graph.scope_policy.derive_from) {
                console.log(`    • Derived from: ${graph.scope_policy.derive_from}`);
            }
            console.log(`    • Forbid widen: ${graph.scope_policy.forbid_widen ? "Yes" : "No"}`);
            console.log("");
        }
        console.log(chalk_1.default.green("  ✓ Graph is valid and ready"));
        console.log("");
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=show.js.map