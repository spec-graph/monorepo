"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCommand = analyzeCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/analyze/index");
async function analyzeCommand(projectRoot, options) {
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
        console.log(chalk_1.default.gray("Analyzing artifacts for consistency issues..."));
        console.log("");
        const result = await (0, index_1.analyzeArtifacts)(projectRoot, graph);
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log((0, index_1.formatAnalysisResult)(result));
        // Summary
        if (result.stats.critical > 0) {
            console.log(chalk_1.default.red(`\n❌ ${result.stats.critical} critical issue(s) must be fixed`));
        }
        else if (result.stats.high > 0) {
            console.log(chalk_1.default.yellow(`\n⚠ ${result.stats.high} high priority issue(s) should be addressed`));
        }
        else {
            console.log(chalk_1.default.green("\n✓ No critical issues found"));
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=analyze.js.map