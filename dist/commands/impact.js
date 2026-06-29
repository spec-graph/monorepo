"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.impactCommand = impactCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const index_1 = require("../engine/impact/index");
const yaml_1 = require("../utils/yaml");
async function impactCommand(projectRoot, options) {
    if (!options.artifact) {
        console.log(chalk_1.default.red("✗ --artifact is required. Usage: spec-graph impact --artifact <id>"));
        process.exit(1);
    }
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
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
        // Verify artifact exists in graph
        const artifactExists = graph.artifacts.some((a) => a.id === options.artifact);
        if (!artifactExists) {
            console.log(chalk_1.default.red(`✗ Artifact '${options.artifact}' not found in graph.`));
            console.log(chalk_1.default.gray(`Available artifacts:`));
            for (const a of graph.artifacts) {
                console.log(chalk_1.default.gray(`  - ${a.id}`));
            }
            process.exit(1);
            return;
        }
        const impact = await (0, index_1.analyzeImpact)(projectRoot, graph, options.artifact);
        if (options.json) {
            console.log(JSON.stringify(impact, null, 2));
            return;
        }
        console.log(chalk_1.default.gray(`Analyzing impact of changes to: ${options.artifact}`));
        console.log("");
        console.log((0, index_1.formatImpactAnalysis)(impact));
        // Mark affected artifacts as stale if requested
        const allAffected = [...new Set([...impact.directDependencies, ...impact.transitiveDependencies])];
        if (options.markStale && allAffected.length > 0) {
            const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
            const state = await (0, yaml_1.readYaml)(statePath);
            let marked = 0;
            for (const id of allAffected) {
                if (state.artifacts[id] && state.artifacts[id].status !== "stale") {
                    state.artifacts[id].status = "stale";
                    marked++;
                }
            }
            if (marked > 0) {
                await (0, yaml_1.writeYaml)(statePath, state);
                console.log(chalk_1.default.yellow(`\n⚠ Marked ${marked} artifact(s) as stale.`));
            }
        }
        // Summary
        const totalImpact = impact.directDependencies.length +
            impact.transitiveDependencies.length +
            impact.affectedChecks.length +
            impact.affectedGates.length;
        if (totalImpact === 0) {
            console.log(chalk_1.default.green("\n✓ No downstream impact detected."));
        }
        else {
            console.log(chalk_1.default.yellow(`\n⚠ Total impact: ${totalImpact} downstream item(s)`));
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=impact.js.map