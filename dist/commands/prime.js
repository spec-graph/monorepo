"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.primeCommand = primeCommand;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = require("node:fs");
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/machine/index");
const yaml_1 = require("../utils/yaml");
async function primeCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
    try {
        const graph = await loadGraphOrExit(graphPath);
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        await engine.getState();
        const result = {
            artifacts_seeded: 0,
            checks_seeded: 0,
            checks_bootstrapped: 0,
            traces_seeded: 0,
            total_artifacts: (graph.artifacts || []).length,
            total_checks: (graph.checks || []).length,
        };
        await seedArtifacts(graph, engine, result);
        await seedChecks(graph, engine, options, result);
        await seedTraceSkeletons(graph, specGraphDir, result);
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            renderPrimeResult(result);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
async function loadGraphOrExit(graphPath) {
    try {
        return await (0, yaml_1.readYaml)(graphPath);
    }
    catch {
        console.log(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
        process.exit(1);
        throw new Error("unreachable");
    }
}
async function seedArtifacts(graph, engine, result) {
    for (const artifact of graph.artifacts || []) {
        const current = (await engine.getArtifacts())[artifact.id];
        if (!current) {
            await engine.updateArtifact(artifact.id, { status: "pending" });
            result.artifacts_seeded++;
        }
    }
}
async function seedChecks(graph, engine, options, result) {
    for (const check of graph.checks || []) {
        const current = (await engine.getChecks())[check.id];
        if (current)
            continue;
        if (options.bootstrap && isPlaceholderCommand(check.command)) {
            await engine.updateCheck(check.id, {
                status: "passed",
                executed_at: new Date().toISOString(),
            });
            result.checks_bootstrapped++;
        }
        else {
            await engine.updateCheck(check.id, { status: "pending" });
            result.checks_seeded++;
        }
    }
}
async function seedTraceSkeletons(graph, specGraphDir, result) {
    const tracesDir = node_path_1.default.join(specGraphDir, "traces");
    await promises_1.default.mkdir(tracesDir, { recursive: true });
    for (const gate of graph.gates || []) {
        for (const trace of gate.require_traces || []) {
            const seeded = await seedTraceFile(tracesDir, trace, graph.artifacts || []);
            if (seeded)
                result.traces_seeded++;
        }
    }
}
async function seedTraceFile(tracesDir, trace, artifacts) {
    const traceFile = node_path_1.default.join(tracesDir, `${kebabToSnake(trace.name)}.yaml`);
    try {
        await promises_1.default.access(traceFile, node_fs_1.constants.F_OK);
        return false; // already exists
    }
    catch {
        // continue to create
    }
    const fromArtifacts = artifacts.filter((a) => a.kind === trace.from_kind || a.id === trace.from_kind);
    const toArtifacts = artifacts.filter((a) => a.kind === trace.to_kind || a.id === trace.to_kind);
    const relation = (trace.via || ["derives"])[0];
    const skeleton = buildTraceSkeleton(fromArtifacts, toArtifacts, trace, relation);
    await (0, yaml_1.writeYaml)(traceFile, skeleton);
    return true;
}
function buildTraceSkeleton(fromArtifacts, toArtifacts, trace, relation) {
    // If 1:1 match, use real IDs
    if (fromArtifacts.length === 1 && toArtifacts.length === 1) {
        return {
            traces: [
                {
                    from: fromArtifacts[0].id,
                    from_kind: trace.from_kind,
                    to: toArtifacts[0].id,
                    to_kind: trace.to_kind,
                    relation,
                },
            ],
        };
    }
    // Multiple or zero matches — enumerate possibilities
    const fromList = fromArtifacts.length > 0
        ? fromArtifacts
        : [{ id: "<source-artifact-id>", kind: trace.from_kind }];
    const toList = toArtifacts.length > 0
        ? toArtifacts
        : [{ id: "<target-artifact-id>", kind: trace.to_kind }];
    const entries = fromList.flatMap((fa) => toList.map((ta) => ({
        from: fa.id,
        from_kind: trace.from_kind,
        to: ta.id,
        to_kind: trace.to_kind,
        relation,
    })));
    return { traces: entries };
}
function isPlaceholderCommand(command) {
    return /^<[^>]+>$/.test(command.trim());
}
function kebabToSnake(name) {
    return name.replace(/-/g, "_");
}
function renderPrimeResult(result) {
    console.log(chalk_1.default.bold("\n✓ Machine state primed\n"));
    const table = new cli_table3_1.default({
        head: ["Resource", "Seeded", "Total"],
        style: { head: ["cyan"] },
    });
    const artifactLine = result.artifacts_seeded > 0
        ? `${result.artifacts_seeded} added`
        : "up to date";
    table.push(["Artifacts", artifactLine, result.total_artifacts]);
    const checkParts = [];
    if (result.checks_seeded > 0)
        checkParts.push(`${result.checks_seeded} pending`);
    if (result.checks_bootstrapped > 0)
        checkParts.push(`${result.checks_bootstrapped} bootstrapped`);
    const checkLine = checkParts.length > 0 ? checkParts.join(", ") : "up to date";
    table.push(["Checks", checkLine, result.total_checks]);
    table.push([
        "Trace files",
        result.traces_seeded > 0
            ? `${result.traces_seeded} skeletons`
            : "none needed",
        "-",
    ]);
    console.log(table.toString());
    if (result.checks_bootstrapped > 0) {
        console.log(chalk_1.default.gray("\n  Bootstrapped placeholder checks are marked passed."));
        console.log(chalk_1.default.gray("  Replace <placeholder> commands with real checks and re-run `spec-graph check`."));
    }
    if (result.traces_seeded > 0) {
        console.log(chalk_1.default.gray("\n  Trace skeleton files created in .spec-graph/traces/."));
        console.log(chalk_1.default.gray("  Edit them to link real artifact IDs, then re-run `spec-graph next`."));
    }
    console.log(chalk_1.default.bold("\n  Next: spec-graph next\n"));
}
//# sourceMappingURL=prime.js.map