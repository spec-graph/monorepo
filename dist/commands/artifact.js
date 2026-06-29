"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.artifactCommand = artifactCommand;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/machine/index");
const yaml_1 = require("../utils/yaml");
async function artifactCommand(projectRoot, subcommand, id, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
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
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        switch (subcommand || "list") {
            case "list":
                await listArtifacts(graph, engine, options);
                break;
            case "show":
                await showArtifact(graph, engine, id, options);
                break;
            case "ready":
                await markArtifactReady(graph, engine, id);
                break;
            case "block":
                await markArtifactBlocked(graph, engine, id);
                break;
            case "update":
            case "complete":
            case "register":
                await updateArtifact(graph, engine, projectRoot, id, options);
                break;
            default:
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: list, show, update, complete, register, ready, block");
                process.exit(1);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
async function listArtifacts(graph, engine, options) {
    const artifacts = await buildArtifactViews(graph, engine);
    if (options.json) {
        console.log(JSON.stringify({ artifacts }, null, 2));
        return;
    }
    if (artifacts.length === 0) {
        console.log(chalk_1.default.yellow("\nNo artifacts declared in the graph.\n"));
        return;
    }
    console.log(chalk_1.default.bold("\n📦 Artifacts\n"));
    const table = new cli_table3_1.default({
        head: ["ID", "Kind", "Status", "Optional", "Producer"],
        style: { head: ["cyan"] },
        wordWrap: true,
    });
    for (const artifact of artifacts) {
        table.push([
            artifact.id,
            artifact.kind,
            colorStatus(artifact.status),
            artifact.optional ? "yes" : "no",
            artifact.produced_by || artifact.default_producer || "-",
        ]);
    }
    console.log(table.toString());
    console.log("");
}
async function showArtifact(graph, engine, id, options) {
    if (!id) {
        console.log(chalk_1.default.red("✗ Missing artifact ID."));
        process.exit(1);
        return;
    }
    const artifact = (await buildArtifactViews(graph, engine)).find((candidate) => candidate.id === id);
    if (!artifact) {
        console.log(chalk_1.default.red(`✗ Artifact not found: ${id}`));
        process.exit(1);
        return;
    }
    if (options.json) {
        console.log(JSON.stringify(artifact, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n📦 Artifact: ${artifact.id}\n`));
    console.log(`  Kind:      ${artifact.kind}`);
    console.log(`  Status:    ${colorStatus(artifact.status)}`);
    console.log(`  Optional:  ${artifact.optional ? "yes" : "no"}`);
    console.log(`  Tracked:   ${artifact.tracked ? "yes" : "no"}`);
    console.log(`  Producer:  ${artifact.produced_by || artifact.default_producer || "-"}`);
    console.log(`  Consumers: ${artifact.consumed_by?.join(", ") || "-"}`);
    console.log(`  Schema:    ${artifact.schema_ref || "-"}`);
    console.log("");
}
async function updateArtifact(graph, engine, projectRoot, id, options) {
    if (!id) {
        console.log(chalk_1.default.red("✗ Missing artifact ID."));
        process.exit(1);
        return;
    }
    const status = parseArtifactStatus(options.status || "completed");
    await engine.updateArtifact(id, {
        status,
        produced_by: options.producer,
    });
    // Auto-wire traces: when an artifact is completed, fill matching
    // trace entries that still have placeholder from/to values.
    if (status === "completed") {
        const artifactDecl = (graph.artifacts || []).find((a) => a.id === id);
        if (artifactDecl) {
            const wired = await autoWireTraces(projectRoot, id, artifactDecl.kind);
            if (wired > 0 && !options.json) {
                console.log(chalk_1.default.gray(`  ↳ auto-wired ${wired} trace file(s)`));
            }
        }
    }
    if (options.json) {
        console.log(JSON.stringify({ id, status, produced_by: options.producer }, null, 2));
        return;
    }
    console.log(chalk_1.default.green(`✓ Artifact ${id} updated to ${status}`));
}
async function markArtifactReady(graph, engine, id) {
    if (!id) {
        console.log(chalk_1.default.red("✗ Missing artifact ID."));
        process.exit(1);
        return;
    }
    await engine.updateArtifact(id, {
        status: "ready",
    });
    console.log(chalk_1.default.green(`✓ Artifact ${id} marked as ready`));
}
async function markArtifactBlocked(graph, engine, id) {
    if (!id) {
        console.log(chalk_1.default.red("✗ Missing artifact ID."));
        process.exit(1);
        return;
    }
    await engine.updateArtifact(id, {
        status: "blocked",
    });
    console.log(chalk_1.default.red(`✗ Artifact ${id} marked as blocked`));
}
async function buildArtifactViews(graph, engine) {
    const trackedArtifacts = await engine.getArtifacts();
    const byId = new Map();
    for (const declaration of graph.artifacts || []) {
        const tracked = trackedArtifacts[declaration.id];
        byId.set(declaration.id, toArtifactView(declaration, tracked));
    }
    for (const [id, tracked] of Object.entries(trackedArtifacts)) {
        if (byId.has(id))
            continue;
        byId.set(id, {
            id,
            kind: "tracked",
            optional: false,
            status: tracked.status,
            produced_by: tracked.produced_by,
            consumed_by: tracked.consumed_by,
            tracked: true,
        });
    }
    return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}
function toArtifactView(declaration, tracked) {
    return {
        id: declaration.id,
        kind: declaration.kind,
        optional: declaration.optional || false,
        schema_ref: declaration.schema_ref,
        default_producer: declaration.default_producer,
        status: tracked?.status || "pending",
        produced_by: tracked?.produced_by,
        consumed_by: tracked?.consumed_by || declaration.default_consumers,
        tracked: Boolean(tracked),
    };
}
function parseArtifactStatus(status) {
    if (status === "pending" ||
        status === "in_progress" ||
        status === "ready" ||
        status === "completed" ||
        status === "failed" ||
        status === "blocked") {
        return status;
    }
    console.log(chalk_1.default.red(`✗ Invalid artifact status: ${status}`));
    console.log("Available: pending, in_progress, ready, completed, failed, blocked");
    process.exit(1);
}
function colorStatus(status) {
    if (status === "completed")
        return chalk_1.default.green(status);
    if (status === "failed")
        return chalk_1.default.red(status);
    if (status === "blocked")
        return chalk_1.default.red(status);
    if (status === "ready")
        return chalk_1.default.blue(status);
    if (status === "in_progress")
        return chalk_1.default.yellow(status);
    return chalk_1.default.gray(status);
}
/**
 * After an artifact is completed, scan trace files and replace placeholder
 * from/to values with the real artifact ID when the kind matches.
 * Returns the number of trace files updated.
 */
async function autoWireTraces(projectRoot, artifactId, artifactKind) {
    const tracesDir = node_path_1.default.join(projectRoot, ".spec-graph", "traces");
    let wired = 0;
    let entries;
    try {
        entries = await promises_1.default.readdir(tracesDir);
    }
    catch {
        return 0;
    }
    for (const entry of entries) {
        if (!entry.endsWith(".yaml"))
            continue;
        const traceFile = node_path_1.default.join(tracesDir, entry);
        let traceData;
        try {
            traceData = await (0, yaml_1.readYaml)(traceFile);
        }
        catch {
            continue;
        }
        if (!traceData.traces || !Array.isArray(traceData.traces))
            continue;
        let changed = false;
        for (const t of traceData.traces) {
            // Match by artifact kind OR artifact id (trace queries may use either)
            if (isPlaceholder(t.from) &&
                (t.from_kind === artifactKind || t.from_kind === artifactId)) {
                t.from = artifactId;
                changed = true;
            }
            if (isPlaceholder(t.to) &&
                (t.to_kind === artifactKind || t.to_kind === artifactId)) {
                t.to = artifactId;
                changed = true;
            }
        }
        if (changed) {
            await (0, yaml_1.writeYaml)(traceFile, traceData);
            wired++;
        }
    }
    return wired;
}
function isPlaceholder(value) {
    if (!value)
        return true;
    return value.startsWith("<") && value.endsWith(">");
}
//# sourceMappingURL=artifact.js.map