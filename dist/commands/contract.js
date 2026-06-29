"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractCommand = contractCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const CONTRACTS_DIR = ".spec-graph/contracts";
async function contractCommand(projectRoot, options) {
    const contractsDir = node_path_1.default.join(projectRoot, CONTRACTS_DIR);
    await promises_1.default.mkdir(contractsDir, { recursive: true });
    const subcommand = options.subcommand || "list";
    try {
        switch (subcommand) {
            case "list":
                await listContracts(contractsDir, options);
                break;
            case "publish":
                await publishContract(contractsDir, options);
                break;
            case "bind":
                await bindContract(contractsDir, options);
                break;
            case "unbind":
                await unbindContract(contractsDir, options);
                break;
            case "reverify":
                await reverifyContract(contractsDir, options);
                break;
            case "show":
                await showContract(contractsDir, options);
                break;
            case "drift":
                await driftAllContracts(contractsDir, options);
                break;
            case "init-from-graph":
                await initFromGraph(projectRoot, contractsDir, options);
                break;
            default:
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: list, publish, bind, unbind, reverify, show, drift, init-from-graph");
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
// ============ list ============
async function listContracts(contractsDir, options) {
    const entries = await loadAllContracts(contractsDir);
    if (entries.length === 0) {
        console.log(chalk_1.default.yellow("\nNo contracts registered."));
        console.log(chalk_1.default.gray("  Run `spec-graph contract init-from-graph` to seed from the composed graph,"));
        console.log(chalk_1.default.gray("  or `spec-graph contract publish <id> --version <v>` to add one.\n"));
        return;
    }
    if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n📜 Contract Registry\n"));
    const table = new cli_table3_1.default({
        head: ["Contract ID", "Producer", "Version", "Consumers", "Stale"],
        style: { head: ["cyan"] },
    });
    for (const entry of entries) {
        const staleCount = (entry.drift?.stale_consumers || []).length;
        table.push([
            entry.contract_id,
            entry.producer,
            entry.current_version,
            entry.consumers.length.toString(),
            staleCount > 0 ? chalk_1.default.red(staleCount.toString()) : "0",
        ]);
    }
    console.log(table.toString());
    console.log("");
}
// ============ publish ============
async function publishContract(contractsDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Contract ID required. Usage: spec-graph contract publish <id> --version <v>"));
        process.exit(1);
        return;
    }
    if (!options.version) {
        console.log(chalk_1.default.red("✗ Version required. Usage: spec-graph contract publish <id> --version <v>"));
        process.exit(1);
        return;
    }
    const entry = await loadOrCreateEntry(contractsDir, options.id, options.producer || "unknown");
    const producer = options.producer || entry.producer;
    const existing = entry.versions.find((v) => v.version === options.version);
    if (existing) {
        console.log(chalk_1.default.yellow(`\n⚠ Version ${options.version} already published at ${existing.published_at}`));
        return;
    }
    entry.versions.push({
        version: options.version,
        published_at: new Date().toISOString(),
        producer,
        notes: options.notes,
    });
    entry.current_version = options.version;
    entry.producer = producer;
    // Recompute drift: all consumers on older versions become stale
    recomputeDrift(entry);
    await saveEntry(contractsDir, entry);
    console.log(chalk_1.default.green(`\n✓ Published ${entry.contract_id} v${options.version}`));
    console.log(`  Producer: ${producer}`);
    console.log(`  Total versions: ${entry.versions.length}`);
    const stale = entry.drift?.stale_consumers || [];
    if (stale.length > 0) {
        console.log(chalk_1.default.yellow(`  ⚠ ${stale.length} consumer(s) now stale:`));
        for (const c of stale)
            console.log(chalk_1.default.yellow(`    • ${c}`));
    }
    console.log("");
}
// ============ bind ============
async function bindContract(contractsDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Contract ID required. Usage: spec-graph contract bind <id> --consumer <track> --version <v>"));
        process.exit(1);
        return;
    }
    if (!options.consumer) {
        console.log(chalk_1.default.red("✗ Consumer required. Usage: spec-graph contract bind <id> --consumer <track> --version <v>"));
        process.exit(1);
        return;
    }
    if (!options.version) {
        console.log(chalk_1.default.red("✗ Version required."));
        process.exit(1);
        return;
    }
    const entry = await loadOrCreateEntry(contractsDir, options.id, options.producer || "unknown");
    const existing = entry.consumers.find((c) => c.consumer === options.consumer);
    if (existing) {
        existing.bound_version = options.version;
        existing.bound_at = new Date().toISOString();
        existing.notes = options.notes || existing.notes;
    }
    else {
        entry.consumers.push({
            consumer: options.consumer,
            bound_version: options.version,
            bound_at: new Date().toISOString(),
            status: "current",
            notes: options.notes,
        });
    }
    recomputeDrift(entry);
    await saveEntry(contractsDir, entry);
    const status = entry.consumers.find((c) => c.consumer === options.consumer).status;
    const statusColored = status === "current" ? chalk_1.default.green(status) : chalk_1.default.yellow(status);
    console.log(chalk_1.default.green(`\n✓ Bound ${options.consumer} → ${entry.contract_id}@${options.version}`));
    console.log(`  Status: ${statusColored}\n`);
}
// ============ unbind ============
async function unbindContract(contractsDir, options) {
    if (!options.id || !options.consumer) {
        console.log(chalk_1.default.red("✗ Both --id and --consumer required."));
        process.exit(1);
        return;
    }
    const entry = await loadEntryOrExit(contractsDir, options.id);
    const before = entry.consumers.length;
    entry.consumers = entry.consumers.filter((c) => c.consumer !== options.consumer);
    if (entry.consumers.length === before) {
        console.log(chalk_1.default.yellow(`\n⚠ Consumer ${options.consumer} was not bound to ${options.id}\n`));
        return;
    }
    recomputeDrift(entry);
    await saveEntry(contractsDir, entry);
    console.log(chalk_1.default.green(`\n✓ Unbound ${options.consumer} from ${options.id}\n`));
}
// ============ reverify ============
// The consumer's half of the ripple loop: producer publishes → consumer
// re-verifies → consumer marks current via `reverify`. Bumps the consumer's
// bound_version up to the producer's current_version and stamps reverified_at,
// clearing the stale/broken marker that gates check.
async function reverifyContract(contractsDir, options) {
    if (!options.id || !options.consumer) {
        console.log(chalk_1.default.red("✗ Contract ID and consumer required. Usage: spec-graph contract reverify <id> --consumer <track>"));
        process.exit(1);
        return;
    }
    const entry = await loadEntryOrExit(contractsDir, options.id);
    const c = entry.consumers.find((b) => b.consumer === options.consumer);
    if (!c) {
        console.log(chalk_1.default.red(`✗ Consumer ${options.consumer} is not bound to ${entry.contract_id}. Run \`bind\` first.`));
        process.exit(1);
        return;
    }
    const previous = c.bound_version;
    c.bound_version = entry.current_version;
    c.bound_at = new Date().toISOString();
    c.reverified_at = c.bound_at;
    c.status = "current";
    if (options.notes)
        c.notes = options.notes;
    recomputeDrift(entry);
    await saveEntry(contractsDir, entry);
    const bumped = previous !== entry.current_version;
    console.log(chalk_1.default.green(`\n✓ ${options.consumer} reverified against ${entry.contract_id}@${entry.current_version}`));
    if (bumped) {
        console.log(chalk_1.default.gray(`  Bumped bound_version ${previous} → ${entry.current_version}`));
    }
    console.log(chalk_1.default.gray(`  reverified_at: ${c.reverified_at}\n`));
}
// ============ show ============
async function showContract(contractsDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Contract ID required. Usage: spec-graph contract show <id>"));
        process.exit(1);
        return;
    }
    const entry = await loadEntryOrExit(contractsDir, options.id);
    if (options.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n📜 Contract: ${entry.contract_id}\n`));
    console.log(`  Producer:        ${entry.producer}`);
    console.log(`  Current version: ${entry.current_version}`);
    console.log(`  Total versions:  ${entry.versions.length}`);
    console.log("");
    console.log(chalk_1.default.bold("  Versions:"));
    for (const v of [...entry.versions].reverse()) {
        const marker = v.version === entry.current_version ? chalk_1.default.green(" (current)") : "";
        console.log(`    • v${v.version}${marker}  — ${new Date(v.published_at).toLocaleString()}  by ${v.producer}`);
        if (v.notes)
            console.log(chalk_1.default.gray(`        ${v.notes}`));
    }
    console.log("");
    if (entry.consumers.length === 0) {
        console.log(chalk_1.default.gray("  No consumers bound.\n"));
        return;
    }
    console.log(chalk_1.default.bold("  Consumers:"));
    for (const c of entry.consumers) {
        const statusColor = c.status === "current"
            ? chalk_1.default.green
            : c.status === "stale"
                ? chalk_1.default.yellow
                : chalk_1.default.red;
        const staleNote = c.status === "stale"
            ? chalk_1.default.gray(` (current: ${entry.current_version})`)
            : "";
        console.log(`    • ${c.consumer} → v${c.bound_version}  [${statusColor(c.status)}]${staleNote}`);
    }
    console.log("");
}
// ============ drift ============
async function driftAllContracts(contractsDir, options) {
    const entries = await loadAllContracts(contractsDir);
    if (entries.length === 0) {
        console.log(chalk_1.default.yellow("\nNo contracts registered.\n"));
        return;
    }
    let totalStale = 0, totalBroken = 0;
    const report = [];
    for (const entry of entries) {
        recomputeDrift(entry);
        await saveEntry(contractsDir, entry);
        const stale = entry.drift?.stale_consumers || [];
        const broken = entry.drift?.broken_consumers || [];
        totalStale += stale.length;
        totalBroken += broken.length;
        if (stale.length > 0 || broken.length > 0) {
            report.push({ contract: entry.contract_id, stale, broken });
        }
    }
    if (options.json) {
        console.log(JSON.stringify({
            checked_at: new Date().toISOString(),
            contracts_checked: entries.length,
            stale_consumers: totalStale,
            broken_consumers: totalBroken,
            report,
        }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n🌊 Contract Drift Report\n`));
    console.log(`  Contracts checked: ${entries.length}`);
    console.log(`  Stale consumers:   ${totalStale === 0 ? chalk_1.default.green("0") : chalk_1.default.yellow(totalStale.toString())}`);
    console.log(`  Broken consumers:  ${totalBroken === 0 ? chalk_1.default.green("0") : chalk_1.default.red(totalBroken.toString())}`);
    console.log("");
    if (report.length === 0) {
        console.log(chalk_1.default.green("  ✓ All consumers on current versions.\n"));
        return;
    }
    for (const r of report) {
        console.log(chalk_1.default.bold(`  ${r.contract}:`));
        for (const c of r.stale)
            console.log(chalk_1.default.yellow(`    ⚠ stale: ${c}`));
        for (const c of r.broken)
            console.log(chalk_1.default.red(`    ✗ broken: ${c}`));
    }
    console.log("");
}
// ============ init-from-graph ============
async function initFromGraph(projectRoot, contractsDir, options) {
    const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    const graph = await (0, yaml_1.tryReadYaml)(graphPath);
    if (!graph) {
        console.log(chalk_1.default.red("✗ graph.yaml not found. Run `spec-graph compose` first."));
        process.exit(1);
        return;
    }
    const contractArtifacts = (graph.artifacts || []).filter((a) => a.id.startsWith("contract/"));
    if (contractArtifacts.length === 0) {
        console.log(chalk_1.default.yellow("\nNo contract artifacts found in graph. Nothing to seed.\n"));
        return;
    }
    let seeded = 0, skipped = 0;
    for (const art of contractArtifacts) {
        const existing = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(contractsDir, `${art.id}.yaml`));
        if (existing) {
            skipped++;
            continue;
        }
        const entry = await createSeedEntryFromArtifact(art, graph, projectRoot);
        await saveEntry(contractsDir, entry);
        seeded++;
    }
    console.log(chalk_1.default.green(`\n✓ Seeded ${seeded} contract(s) from graph`));
    if (skipped > 0)
        console.log(chalk_1.default.gray(`  (${skipped} already existed, skipped)`));
    console.log(chalk_1.default.gray(`  Use 'spec-graph contract publish <id> --version <v>' to record a published version.`));
    console.log("");
}
async function createSeedEntryFromArtifact(art, graph, projectRoot) {
    const producerTrack = (graph.tracks || []).find((t) => (t.produces || []).includes(art.id));
    const consumerTracks = (graph.tracks || []).filter((t) => (t.consumes || []).includes(art.id));
    const entry = {
        contract_id: art.id,
        producer: producerTrack?.id || "unassigned",
        current_version: "0.0.0",
        versions: [
            {
                version: "0.0.0",
                published_at: new Date().toISOString(),
                producer: producerTrack?.id || "unassigned",
                notes: "initial seed from graph.yaml",
            },
        ],
        consumers: consumerTracks.map((t) => ({
            consumer: t.id,
            bound_version: "0.0.0",
            bound_at: new Date().toISOString(),
            status: "current",
        })),
    };
    return entry;
}
// ============ helpers ============
function recomputeDrift(entry) {
    const stale = [];
    const broken = [];
    for (const c of entry.consumers) {
        if (c.status === "broken") {
            broken.push(c.consumer);
            continue;
        }
        if (c.bound_version !== entry.current_version) {
            c.status = "stale";
            stale.push(c.consumer);
        }
        else {
            c.status = "current";
        }
    }
    entry.drift = {
        last_checked_at: new Date().toISOString(),
        stale_consumers: stale,
        broken_consumers: broken,
    };
}
async function loadOrCreateEntry(contractsDir, id, producer) {
    const filePath = entryPath(contractsDir, id);
    const existing = await (0, yaml_1.tryReadYaml)(filePath);
    if (existing)
        return existing;
    return {
        contract_id: id,
        producer,
        current_version: "0.0.0",
        versions: [],
        consumers: [],
    };
}
async function loadEntryOrExit(contractsDir, id) {
    const filePath = entryPath(contractsDir, id);
    const entry = await (0, yaml_1.tryReadYaml)(filePath);
    if (!entry) {
        console.log(chalk_1.default.red(`✗ Contract not found: ${id}`));
        console.log(chalk_1.default.gray("  Run `spec-graph contract init-from-graph` first, or `spec-graph contract publish <id> --version <v>`."));
        process.exit(1);
        throw new Error("unreachable");
    }
    return entry;
}
async function saveEntry(contractsDir, entry) {
    await promises_1.default.mkdir(contractsDir, { recursive: true });
    await (0, yaml_1.writeYaml)(entryPath(contractsDir, entry.contract_id), entry);
}
async function loadAllContracts(contractsDir) {
    const entries = [];
    try {
        const files = await promises_1.default.readdir(contractsDir);
        for (const f of files) {
            if (!f.endsWith(".yaml"))
                continue;
            const entry = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(contractsDir, f));
            if (entry)
                entries.push(entry);
        }
    }
    catch (e) {
        if (e.code !== "ENOENT")
            throw e;
    }
    return entries;
}
function entryPath(contractsDir, id) {
    // Convert contract IDs like "contract/openapi" to filename "contract_openapi.yaml"
    const safe = id.replace(/\//g, "_");
    return node_path_1.default.join(contractsDir, `${safe}.yaml`);
}
//# sourceMappingURL=contract.js.map