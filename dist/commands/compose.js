"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeCommand = composeCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/compose/index");
const yaml_1 = require("../utils/yaml");
async function composeCommand(projectRoot, options) {
    const spinner = (0, ora_1.default)("Composing workflow graph...").start();
    try {
        const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
        const profilePath = node_path_1.default.join(specGraphDir, "profile.yaml");
        const profile = await loadProfileOrExit(profilePath, spinner);
        const { graph, packsUsed, warnings, errors } = await (0, index_1.runCompose)(projectRoot, profile, options.changeType || "feature");
        spinner.succeed("Composition complete");
        renderSummary(graph, packsUsed, options.changeType || "feature");
        renderPacks(packsUsed);
        renderWarnings(warnings);
        renderErrors(errors);
        renderPipeline(graph);
        renderGates(graph);
        renderTracks(graph);
        const outputPath = options.output || node_path_1.default.join(specGraphDir, "graph.yaml");
        await (0, yaml_1.writeYaml)(outputPath, graph);
        console.log("");
        console.log(chalk_1.default.green(`  💾 Graph saved to: ${outputPath}`));
    }
    catch (e) {
        spinner.fail(`Composition failed: ${e.message}`);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
async function loadProfileOrExit(profilePath, spinner) {
    try {
        return await (0, yaml_1.readYaml)(profilePath);
    }
    catch {
        spinner.fail("Profile not found. Run `spec-graph init` first.");
        process.exit(1);
        throw new Error("unreachable");
    }
}
function renderSummary(graph, packsUsed, changeType) {
    console.log("");
    console.log(chalk_1.default.bold("  📋 Composition Summary"));
    console.log("");
    console.log(`  Change Type: ${changeType}`);
    console.log(`  Active packs: ${packsUsed.length}`);
    console.log(`  Artifacts: ${graph.artifacts.length}`);
    console.log(`  Actions: ${graph.actions.length}`);
    console.log(`  Checks: ${graph.checks.length}`);
    console.log(`  Gates: ${graph.gates.length}`);
    console.log(`  Tracks: ${graph.tracks.length}`);
}
function renderPacks(packsUsed) {
    console.log("");
    console.log(chalk_1.default.bold("  📦 Packs used:"));
    for (const pack of packsUsed) {
        const matchStr = typeof pack.matched === "string"
            ? pack.matched
            : JSON.stringify(pack.matched).replace(/"/g, "");
        console.log(`    • ${pack.name} ${chalk_1.default.gray(`(${matchStr})`)}`);
    }
}
function renderWarnings(warnings) {
    if (warnings.length === 0)
        return;
    console.log("");
    console.log(chalk_1.default.yellow("  ⚠️  Warnings:"));
    for (const w of warnings)
        console.log(chalk_1.default.yellow(`    • ${w}`));
}
function renderErrors(errors) {
    if (errors.length === 0)
        return;
    console.log("");
    console.log(chalk_1.default.red("  ❌ Errors:"));
    for (const e of errors)
        console.log(chalk_1.default.red(`    • ${e}`));
}
function renderPipeline(graph) {
    console.log("");
    console.log(chalk_1.default.bold("  🚀 Pipeline Stages:"));
    const stages = graph.pipeline_skeleton.stages.join(" → ");
    console.log(`    ${stages}`);
}
function renderGates(graph) {
    if (graph.gates.length === 0)
        return;
    console.log("");
    console.log(chalk_1.default.bold("  🚧 Gates:"));
    const gateTable = new cli_table3_1.default({
        head: ["ID", "On Transition", "Requirements", "Fail Mode"],
        style: { head: ["cyan"] },
    });
    for (const gate of graph.gates) {
        const reqCount = (gate.require_artifacts?.length || 0) +
            (gate.require_checks?.length || 0) +
            (gate.require_traces?.length || 0) +
            (gate.forbid?.length || 0);
        gateTable.push([
            gate.id,
            (gate.on_transition || []).join(", "),
            reqCount.toString(),
            gate.fail_mode,
        ]);
    }
    console.log(gateTable.toString());
}
function renderTracks(graph) {
    if (graph.tracks.length === 0)
        return;
    console.log("");
    console.log(chalk_1.default.bold("  🛤️  Parallel Tracks:"));
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
}
//# sourceMappingURL=compose.js.map