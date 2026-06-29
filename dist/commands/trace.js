"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.traceCommand = traceCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/trace/index");
const yaml_1 = require("../utils/yaml");
const SUBCOMMANDS = ["add", "list", "show"];
function isSubcommand(arg) {
    return !!arg && SUBCOMMANDS.includes(arg);
}
async function traceCommand(projectRoot, arg, options) {
    try {
        // Route to subcommands. If `arg` is a known subcommand, dispatch.
        // Otherwise treat `arg` as a node-id for the legacy trace view.
        if (isSubcommand(arg)) {
            if (arg === "add") {
                await traceAddCommand(projectRoot, options);
                return;
            }
            // 'list' and 'show' fall through to legacy view (with arg cleared)
            arg = undefined;
        }
        await traceViewCommand(projectRoot, arg, options);
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exitCode = 1;
    }
}
/**
 * `spec-graph trace add --from <artifact-id> --to <artifact-id> --via <relation>`
 *
 * Creates a trace entry in .spec-graph/traces/. The trace file is named after
 * the gate's require_traces query that this trace satisfies (looked up by
 * matching from_kind/to_kind/via against graph gates). If no matching query
 * is found, a fallback file is created based on the from artifact id.
 *
 * This command is referenced by:
 * - verify_trace actions in dispatch.ts (manifest hint)
 * - run.ts (blocked message)
 * - coordinator-protocol.md
 *
 * After trace add, the coordinator re-runs `spec-graph dispatch` to re-evaluate
 * the gate.
 */
async function traceAddCommand(projectRoot, options) {
    if (!options.from || !options.to) {
        console.log(chalk_1.default.red("✗ --from and --to are required."));
        console.log(chalk_1.default.gray("Usage: spec-graph trace add --from <artifact-id> --to <artifact-id> [--via <relation>] [--relation <name>] [--json]"));
        process.exitCode = 1;
        return;
    }
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    let graph;
    try {
        graph = await (0, yaml_1.readYaml)(graphPath);
    }
    catch {
        console.log(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
        process.exitCode = 1;
        return;
    }
    // Look up artifact declarations to get kinds (used for trace queries)
    const fromArt = (graph.artifacts || []).find((a) => a.id === options.from);
    const toArt = (graph.artifacts || []).find((a) => a.id === options.to);
    if (!fromArt) {
        console.log(chalk_1.default.red(`✗ --from artifact not found in graph: ${options.from}`));
        console.log(chalk_1.default.gray("Available artifacts: " +
            (graph.artifacts || []).map((a) => a.id).join(", ")));
        process.exitCode = 1;
        return;
    }
    if (!toArt) {
        console.log(chalk_1.default.red(`✗ --to artifact not found in graph: ${options.to}`));
        console.log(chalk_1.default.gray("Available artifacts: " +
            (graph.artifacts || []).map((a) => a.id).join(", ")));
        process.exitCode = 1;
        return;
    }
    // Determine the relation — explicit --relation takes precedence, else --via
    const relation = options.relation || options.via || "satisfies";
    // Find the gate trace query that matches this from/to pair
    const matchingQuery = findMatchingTraceQuery(graph, fromArt.kind, toArt.kind, relation);
    const traceName = matchingQuery?.name || `${fromArt.kind}-to-${toArt.kind}`;
    const traceFile = node_path_1.default.join(specGraphDir, "traces", `${kebabToSnake(traceName)}.yaml`);
    // Load or create the trace file
    let traceData;
    try {
        traceData = await (0, yaml_1.readYaml)(traceFile);
        if (!traceData.traces || !Array.isArray(traceData.traces)) {
            traceData = { traces: [] };
        }
    }
    catch {
        traceData = { traces: [] };
    }
    // Check for duplicate entry
    const exists = traceData.traces.some((t) => t.from === options.from && t.to === options.to && t.relation === relation);
    if (exists) {
        if (options.json) {
            console.log(JSON.stringify({ added: false, reason: "duplicate", trace_file: traceFile }, null, 2));
            return;
        }
        console.log(chalk_1.default.yellow(`↳ Trace entry already exists: ${options.from} → ${options.to} (${relation})`));
        console.log(chalk_1.default.gray(`  File: ${traceFile}`));
        return;
    }
    // Add the entry
    traceData.traces.push({
        from: options.from,
        from_kind: fromArt.kind,
        to: options.to,
        to_kind: toArt.kind,
        relation,
    });
    await promises_1.default.mkdir(node_path_1.default.dirname(traceFile), { recursive: true });
    await (0, yaml_1.writeYaml)(traceFile, traceData);
    if (options.json) {
        console.log(JSON.stringify({
            added: true,
            trace_file: traceFile,
            trace_name: traceName,
            from: options.from,
            to: options.to,
            relation,
            matching_gate_query: matchingQuery?.name || null,
        }, null, 2));
        return;
    }
    console.log(chalk_1.default.green(`✓ Trace entry added: ${options.from} → ${options.to} (${relation})`));
    console.log(chalk_1.default.gray(`  File: ${traceFile}`));
    if (matchingQuery) {
        console.log(chalk_1.default.gray(`  Satisfies gate query: ${matchingQuery.name}`));
    }
    console.log(chalk_1.default.gray(`  Re-run: spec-graph dispatch --json`));
}
function findMatchingTraceQuery(graph, fromKind, toKind, relation) {
    for (const gate of graph.gates || []) {
        for (const trace of gate.require_traces || []) {
            if (trace.from_kind === fromKind && trace.to_kind === toKind) {
                // Match if relation is in the via list, or via is unspecified
                if (!trace.via ||
                    trace.via.length === 0 ||
                    trace.via.includes(relation)) {
                    return trace;
                }
            }
        }
    }
    return undefined;
}
async function traceViewCommand(projectRoot, nodeId, options) {
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
        process.exitCode = 1;
        return;
    }
    // Load profile
    let profile;
    try {
        profile = await (0, yaml_1.readYaml)(profilePath);
    }
    catch {
        console.log(chalk_1.default.red("✗ Profile not found. Run `spec-graph init` first."));
        process.exitCode = 1;
        return;
    }
    // Build trace index
    const index = await (0, index_1.buildTraceIndex)(projectRoot, graph);
    // If no nodeId provided, list all nodes
    if (!nodeId) {
        console.log(chalk_1.default.bold("\n📊 Traceable Nodes\n"));
        const nodes = (0, index_1.listTraceNodes)(index);
        if (nodes.length === 0) {
            console.log(chalk_1.default.yellow("No traceable nodes found."));
            console.log("Add artifacts to your packs or create trace files in .spec-graph/traces/\n");
            return;
        }
        const table = new cli_table3_1.default({
            head: ["ID", "Type", "Metadata"],
            style: { head: ["cyan"] },
        });
        for (const node of nodes) {
            const metadataStr = Object.entries(node.metadata)
                .slice(0, 2)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
            table.push([node.id, node.type, metadataStr || "-"]);
        }
        console.log(table.toString());
        console.log("");
        console.log(chalk_1.default.gray("Usage: spec-graph trace <node-id> [--direction=forward|backward]"));
        console.log(chalk_1.default.gray("       spec-graph trace add --from <artifact-id> --to <artifact-id> [--via <relation>]"));
        console.log("");
        return;
    }
    // Perform trace
    const direction = options.direction || "backward";
    const result = direction === "backward"
        ? (0, index_1.traceBackward)(index, nodeId)
        : (0, index_1.traceForward)(index, nodeId);
    if (!result.found) {
        console.log(chalk_1.default.yellow(`\n✗ Node not found: ${nodeId}`));
        console.log("Run `spec-graph trace` to see available nodes.\n");
        process.exitCode = 1;
        return;
    }
    // Display trace path
    console.log(chalk_1.default.bold(`\n🔍 Trace ${direction} from ${nodeId}\n`));
    if (result.path.length === 0) {
        console.log(chalk_1.default.gray("No trace path found.\n"));
        return;
    }
    // Display as a chain
    for (let i = 0; i < result.path.length; i++) {
        const node = result.path[i];
        const isLast = i === result.path.length - 1;
        const typeColor = node.node_type === "requirement"
            ? chalk_1.default.blue
            : node.node_type === "artifact"
                ? chalk_1.default.green
                : node.node_type === "check"
                    ? chalk_1.default.yellow
                    : node.node_type === "gate"
                        ? chalk_1.default.magenta
                        : chalk_1.default.cyan;
        console.log(`${typeColor(`[${node.node_type}]`)} ${chalk_1.default.bold(node.node_id)}`);
        // Show metadata
        const metadataEntries = Object.entries(node.metadata).filter(([_, v]) => v !== undefined && v !== null);
        if (metadataEntries.length > 0) {
            for (const [key, value] of metadataEntries.slice(0, 3)) {
                const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
                console.log(chalk_1.default.gray(`  ${key}: ${valueStr.slice(0, 60)}`));
            }
        }
        if (!isLast) {
            console.log(chalk_1.default.gray("  ↓"));
        }
    }
    console.log("");
    console.log(chalk_1.default.gray(`Total nodes in path: ${result.path.length}`));
    console.log("");
}
function kebabToSnake(name) {
    return name.replace(/-/g, "_");
}
//# sourceMappingURL=trace.js.map