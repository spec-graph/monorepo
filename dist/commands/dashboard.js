"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardCommand = dashboardCommand;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const chalk_1 = __importDefault(require("chalk"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/machine/index");
const index_2 = require("../engine/trace/index");
const index_3 = require("../engine/next/index");
const index_4 = require("../engine/workflow/index");
const index_5 = require("../engine/dashboard/index");
async function dashboardCommand(projectRoot, options) {
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
        const traceIndex = await (0, index_2.buildTraceIndex)(projectRoot, graph);
        const plan = await (0, index_3.computeNextPlan)(graph, state, traceIndex, projectRoot);
        const stageOrder = (0, index_4.inferStageOrder)(graph);
        // Build profile info
        let profile = {};
        try {
            profile = await (0, yaml_1.readYaml)(profilePath);
        }
        catch {
            // ignore
        }
        // Gather gate evaluations
        const gates = (graph.gates || []).map((gate) => {
            const missing_artifacts = [];
            const failed_checks = [];
            const missing_traces = [];
            for (const artId of gate.require_artifacts || []) {
                const artState = state.artifacts[artId];
                if (!artState || artState.status !== "completed") {
                    missing_artifacts.push(artId);
                }
            }
            for (const chkId of gate.require_checks || []) {
                const chkState = state.checks[chkId];
                if (!chkState || chkState.status !== "passed") {
                    failed_checks.push(chkId);
                }
            }
            const passed = missing_artifacts.length === 0 &&
                failed_checks.length === 0 &&
                missing_traces.length === 0;
            return {
                id: gate.id,
                passed,
                missing_artifacts,
                failed_checks,
                missing_traces,
            };
        });
        // Trace coverage
        const totalEdges = traceIndex.edges.length;
        const satisfied = traceIndex.edges.filter((e) => {
            const fromState = state.artifacts[e.from];
            const toState = state.artifacts[e.to];
            return fromState?.status === "completed" && toState?.status === "completed";
        }).length;
        // Active change
        const changesDir = node_path_1.default.join(specGraphDir, "changes");
        let activeChange = null;
        try {
            const files = await promises_1.default.readdir(changesDir);
            const active = files.find((f) => f.endsWith(".json"));
            if (active) {
                const changeData = await (0, yaml_1.readYaml)(node_path_1.default.join(changesDir, active));
                if (changeData.status === "applied" || changeData.status === "in_progress") {
                    activeChange = {
                        id: changeData.id,
                        title: changeData.title || "Untitled",
                        type: changeData.type || "feature",
                        priority: changeData.priority || "medium",
                    };
                }
            }
        }
        catch {
            // no changes dir
        }
        // Constitution
        let constitutionVersion = "0.0.0";
        let constitutionPrinciples = 0;
        try {
            const constitutionPath = node_path_1.default.join(specGraphDir, "constitution.yaml");
            const constitution = await (0, yaml_1.readYaml)(constitutionPath);
            constitutionVersion = constitution.version || "0.0.0";
            constitutionPrinciples = constitution.principles?.length || 0;
        }
        catch {
            // no constitution
        }
        const projectName = profile.meta?.name || node_path_1.default.basename(projectRoot);
        const data = {
            project_name: projectName,
            current_stage: state.current_stage,
            stage_order: stageOrder,
            artifacts: Object.fromEntries(Object.entries(state.artifacts).map(([id, info]) => [
                id,
                {
                    status: info.status,
                    kind: graph.artifacts?.find((a) => a.id === id)?.kind,
                },
            ])),
            checks: Object.fromEntries(Object.entries(state.checks).map(([id, info]) => [
                id,
                {
                    status: info.status,
                    layer: graph.checks?.find((c) => c.id === id)?.layer,
                },
            ])),
            gates,
            trace_coverage: {
                total_edges: totalEdges,
                satisfied,
                pending: totalEdges - satisfied,
            },
            constitution: {
                version: constitutionVersion,
                principles: constitutionPrinciples,
            },
            active_change: activeChange,
            stats: {
                total_artifacts: Object.keys(state.artifacts).length,
                completed_artifacts: Object.values(state.artifacts).filter((a) => a.status === "completed").length,
                total_checks: Object.keys(state.checks).length,
                passed_checks: Object.values(state.checks).filter((c) => c.status === "passed").length,
                total_gates: gates.length,
                passed_gates: gates.filter((g) => g.passed).length,
            },
        };
        // JSON output
        if (options.json) {
            console.log(JSON.stringify(data, null, 2));
            return;
        }
        // HTML output
        if (options.html) {
            const html = (0, index_5.renderHtmlDashboard)(data);
            const outputPath = options.output
                ? node_path_1.default.isAbsolute(options.output)
                    ? options.output
                    : node_path_1.default.join(projectRoot, options.output)
                : node_path_1.default.join(specGraphDir, "dashboard.html");
            await promises_1.default.mkdir(node_path_1.default.dirname(outputPath), { recursive: true });
            await promises_1.default.writeFile(outputPath, html, "utf-8");
            console.log(chalk_1.default.green(`✓ HTML dashboard written: ${outputPath}`));
            console.log(chalk_1.default.gray(`  Open in browser to view.`));
            return;
        }
        // Terminal dashboard
        console.log((0, index_5.renderTerminalDashboard)(data));
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=dashboard.js.map