"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeCommand = scopeCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const scope_lock_1 = require("../engine/isolation/scope-lock");
const yaml_1 = require("../utils/yaml");
const SCOPE_DIR = ".spec-graph/isolation";
async function scopeCommand(projectRoot, options) {
    const sub = options.subcommand || "show";
    const scopeDir = node_path_1.default.join(projectRoot, SCOPE_DIR);
    await promises_1.default.mkdir(scopeDir, { recursive: true });
    try {
        switch (sub) {
            case "lock":
                await lockCmd(projectRoot, options);
                break;
            case "check":
                await checkCmd(projectRoot, options);
                break;
            case "show":
                await showCmd(projectRoot, options);
                break;
            case "list":
                await listCmd(projectRoot, options);
                break;
            case "unlock":
                await unlockCmd(projectRoot, options);
                break;
            case "overlap":
                await overlapCmd(projectRoot, options);
                break;
            default:
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${sub}`));
                console.log("Available: lock, check, show, list, unlock, overlap");
                process.exit(1);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        process.exit(1);
    }
}
// ============ overlap ============
async function overlapCmd(projectRoot, options) {
    const scopeDir = node_path_1.default.join(projectRoot, SCOPE_DIR);
    const locks = {};
    // Load all active scope locks
    try {
        const entries = await promises_1.default.readdir(scopeDir);
        for (const entry of entries) {
            if (entry.endsWith(".yaml")) {
                const unitId = entry.replace(".yaml", "");
                const lock = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(scopeDir, entry));
                if (lock) {
                    locks[unitId] = lock;
                }
            }
        }
    }
    catch {
        // No scope locks exist
    }
    if (Object.keys(locks).length === 0) {
        console.log(chalk_1.default.yellow("No scope locks found."));
        return;
    }
    const overlaps = (0, scope_lock_1.detectScopeOverlaps)(locks);
    if (options.json) {
        console.log(JSON.stringify({ locks: Object.keys(locks).length, overlaps }, null, 2));
        return;
    }
    if (overlaps.length === 0) {
        console.log(chalk_1.default.green("✓ No scope overlaps detected."));
        console.log(chalk_1.default.gray(`  ${Object.keys(locks).length} active lock(s), all disjoint`));
        return;
    }
    console.log(chalk_1.default.yellow(`⚠ ${overlaps.length} scope overlap(s) detected:\n`));
    for (const overlap of overlaps) {
        const kindIcon = overlap.kind === "exact"
            ? chalk_1.default.red("✗")
            : chalk_1.default.yellow("⚠");
        console.log(`  ${kindIcon} [${chalk_1.default.bold(overlap.kind)}] ${overlap.lock_a} ↔ ${overlap.lock_b}`);
        console.log(chalk_1.default.gray(`    path: ${overlap.path}`));
    }
    console.log("");
}
async function lockCmd(projectRoot, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required. Usage: spec-graph scope lock <id> --allowed <globs> ..."));
        process.exit(1);
        return;
    }
    const lock = {
        unit_id: opts.unitId,
        allowed_paths: parseGlobs(opts.allowed),
        protected_paths: parseGlobs(opts.protected),
        forbidden_paths: parseGlobs(opts.forbidden),
        enforcement_mode: opts.mode || "strict",
        locked_at: new Date().toISOString(),
        locked_by: "cli",
    };
    const filePath = scopeFilePath(projectRoot, opts.unitId);
    await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
    await (0, yaml_1.writeYaml)(filePath, lock);
    console.log(chalk_1.default.green(`\n✓ Scope lock created for ${opts.unitId}`));
    console.log(`  Allowed:   ${lock.allowed_paths.join(", ") || "(none — anything goes)"}`);
    console.log(`  Protected: ${lock.protected_paths.join(", ") || "(none)"}`);
    console.log(`  Forbidden: ${lock.forbidden_paths.join(", ") || "(none)"}`);
    console.log(`  Mode:      ${lock.enforcement_mode}\n`);
}
// ============ check ============
async function checkCmd(projectRoot, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required. Usage: spec-graph scope check <id> --files <comma-list>"));
        process.exit(1);
        return;
    }
    if (!opts.files) {
        console.log(chalk_1.default.red("✗ Files required."));
        process.exit(1);
        return;
    }
    const lock = await loadLock(projectRoot, opts.unitId);
    const files = opts.files
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    const result = (0, scope_lock_1.validateScopeLock)(files, lock);
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n🔒 Scope Check\n"));
    console.log(`  Unit:   ${opts.unitId}`);
    console.log(`  Mode:   ${result.enforcement_mode}`);
    console.log(`  Files:  ${files.length}`);
    console.log(`  Result: ${result.passed ? chalk_1.default.green("PASS") : chalk_1.default.red("FAIL")}`);
    if (!result.passed) {
        console.log("");
        console.log(chalk_1.default.red(`  ${(0, scope_lock_1.summarizeViolations)(result)}`));
        for (const v of result.violations) {
            const icon = v.kind === "forbidden-touched"
                ? "✗"
                : v.kind === "protected-modified"
                    ? "⚠"
                    : "○";
            console.log(chalk_1.default.red(`    ${icon} ${v.file}: ${v.message}`));
        }
        if (result.enforcement_mode === "strict") {
            process.exit(1);
        }
    }
    console.log("");
}
// ============ show ============
async function showCmd(projectRoot, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required."));
        process.exit(1);
        return;
    }
    const lock = await loadLock(projectRoot, opts.unitId);
    if (opts.json) {
        console.log(JSON.stringify(lock, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n🔒 Scope Lock: ${lock.unit_id}\n`));
    console.log(`  Allowed:   ${lock.allowed_paths.join(", ") || "(none)"}`);
    console.log(`  Protected: ${lock.protected_paths.join(", ") || "(none)"}`);
    console.log(`  Forbidden: ${lock.forbidden_paths.join(", ") || "(none)"}`);
    console.log(`  Mode:      ${lock.enforcement_mode}`);
    console.log(`  Locked at: ${lock.locked_at}`);
    console.log(`  Locked by: ${lock.locked_by}\n`);
}
// ============ list ============
async function listCmd(projectRoot, opts) {
    const dir = node_path_1.default.join(projectRoot, SCOPE_DIR);
    let files = [];
    try {
        files = await promises_1.default.readdir(dir);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            files = [];
        }
        else
            throw e;
    }
    const locks = [];
    for (const f of files) {
        if (!f.startsWith("scope-") || !f.endsWith(".yaml"))
            continue;
        const lock = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(dir, f));
        if (lock)
            locks.push(lock);
    }
    if (locks.length === 0) {
        console.log(chalk_1.default.yellow("\nNo scope locks registered.\n"));
        return;
    }
    if (opts.json) {
        console.log(JSON.stringify(locks, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n🔒 Scope Locks\n"));
    for (const l of locks) {
        console.log(`  • ${l.unit_id} [${l.enforcement_mode}] allowed=${l.allowed_paths.length} protected=${l.protected_paths.length} forbidden=${l.forbidden_paths.length}`);
    }
    console.log("");
}
// ============ unlock ============
async function unlockCmd(projectRoot, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required."));
        process.exit(1);
        return;
    }
    const filePath = scopeFilePath(projectRoot, opts.unitId);
    try {
        await promises_1.default.unlink(filePath);
        console.log(chalk_1.default.green(`\n✓ Scope lock removed for ${opts.unitId}\n`));
    }
    catch (e) {
        if (e.code === "ENOENT") {
            console.log(chalk_1.default.yellow(`\n⚠ No scope lock found for ${opts.unitId}\n`));
        }
        else
            throw e;
    }
}
// ============ helpers ============
function parseGlobs(input) {
    if (!input)
        return [];
    return input
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
}
function scopeFilePath(projectRoot, unitId) {
    const safe = unitId.replace(/\//g, "_");
    return node_path_1.default.join(projectRoot, SCOPE_DIR, `scope-${safe}.yaml`);
}
async function loadLock(projectRoot, unitId) {
    const filePath = scopeFilePath(projectRoot, unitId);
    const lock = await (0, yaml_1.tryReadYaml)(filePath);
    if (!lock) {
        console.log(chalk_1.default.red(`✗ No scope lock found for ${unitId}. Run \`spec-graph scope lock\` first.`));
        process.exit(1);
        throw new Error("unreachable");
    }
    return lock;
}
//# sourceMappingURL=scope.js.map