"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateCommand = migrateCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const index_1 = require("../engine/migration/index");
const yaml_1 = require("../utils/yaml");
async function migrateCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    try {
        console.log(chalk_1.default.gray("Analyzing codebase structure..."));
        console.log("");
        let graph;
        try {
            graph = await (0, yaml_1.readYaml)(graphPath);
        }
        catch {
            console.log(chalk_1.default.yellow("⚠ Graph not found. Run `spec-graph compose` first."));
            console.log(chalk_1.default.gray("Continuing with codebase analysis only..."));
            console.log("");
            // Create minimal graph for migration planning
            graph = {
                version: "1",
                meta: {
                    composed_at: new Date().toISOString(),
                    profile_hash: "migration",
                    packs_used: [],
                },
                artifacts: [],
                actions: [],
                checks: [],
                gates: [],
                tracks: [],
                pipeline_skeleton: {
                    stages: ["propose", "specify", "design", "implement"],
                    max_retries: 3,
                    on_exhausted: "escalate",
                },
                acceptance_layers: {},
                agents: [],
                agent_bindings: [],
                meetings: [],
            };
        }
        const plan = await (0, index_1.generateMigrationPlan)(projectRoot, graph);
        if (options.json) {
            console.log(JSON.stringify(plan, null, 2));
            return;
        }
        console.log((0, index_1.formatMigrationPlan)(plan));
        // Summary
        const totalSteps = plan.steps.length;
        const highPriority = plan.steps.filter((s) => s.priority === "high").length;
        console.log(chalk_1.default.green(`\n✓ Migration plan generated`));
        console.log(chalk_1.default.gray(`  ${totalSteps} steps (${highPriority} high priority)`));
        console.log(chalk_1.default.gray(`\n  Run each step to migrate your project incrementally.`));
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=migrate.js.map