"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.visualizeCommand = visualizeCommand;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const chalk_1 = __importDefault(require("chalk"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/visualize/index");
async function visualizeCommand(projectRoot, options) {
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
        const format = options.format || "dot";
        if (format === "json") {
            const summary = (0, index_1.generateSummary)(graph);
            console.log(JSON.stringify(summary, null, 2));
            return;
        }
        if (format === "mermaid") {
            const mermaid = await (0, index_1.generateMermaid)(projectRoot, graph);
            if (options.output) {
                const outputPath = node_path_1.default.isAbsolute(options.output)
                    ? options.output
                    : node_path_1.default.join(projectRoot, options.output);
                await promises_1.default.mkdir(node_path_1.default.dirname(outputPath), { recursive: true });
                await promises_1.default.writeFile(outputPath, mermaid, "utf-8");
                console.log(chalk_1.default.green(`✓ Mermaid file written: ${outputPath}`));
                console.log(chalk_1.default.gray(`  Paste into GitHub/GitLab for inline rendering.`));
            }
            else {
                console.log(mermaid);
            }
            return;
        }
        // Generate DOT (default)
        const dot = await (0, index_1.generateDot)(projectRoot, graph);
        if (options.output) {
            const outputPath = node_path_1.default.isAbsolute(options.output)
                ? options.output
                : node_path_1.default.join(projectRoot, options.output);
            await promises_1.default.mkdir(node_path_1.default.dirname(outputPath), { recursive: true });
            await promises_1.default.writeFile(outputPath, dot, "utf-8");
            console.log(chalk_1.default.green(`✓ DOT file written: ${outputPath}`));
            console.log(chalk_1.default.gray(`  Render with: dot -Tpng ${outputPath} -o workflow.png`));
        }
        else {
            console.log(dot);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=visualize.js.map