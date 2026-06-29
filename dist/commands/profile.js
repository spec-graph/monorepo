"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileCommand = profileCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const overrides_1 = require("../engine/sense/overrides");
const PROFILE_PATH = ".spec-graph/profile.yaml";
const DIMENSIONS = [
    "has_ui",
    "boundary",
    "topology",
    "deployment",
    "consumers",
    "field",
    "criticality",
    "team",
    "persistence",
];
async function profileCommand(projectRoot, options) {
    const subcommand = options.subcommand || "show";
    switch (subcommand) {
        case "show":
            return showProfile(projectRoot);
        case "review":
            return reviewProfile(projectRoot);
        case "override":
            return applyOverride(projectRoot, options.pairs);
        default:
            console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
            console.log("Available: show, review, override");
            process.exit(1);
    }
}
async function loadProfile(projectRoot) {
    return (0, yaml_1.tryReadYaml)(node_path_1.default.join(projectRoot, PROFILE_PATH));
}
async function loadOrExit(projectRoot) {
    const p = await loadProfile(projectRoot);
    if (!p) {
        console.log(chalk_1.default.red(`✗ Profile not found at ${PROFILE_PATH}. Run \`spec-graph sense\` first.`));
        process.exit(1);
        throw new Error("unreachable");
    }
    return p;
}
async function showProfile(projectRoot) {
    const profile = await loadOrExit(projectRoot);
    console.log(chalk_1.default.bold(`\n📊 Profile: ${profile.meta?.source?.prompt || "(unnamed)"}\n`));
    const reviewed = profile.meta?.source?.reviewed_at;
    console.log(`  Reviewed: ${reviewed ? chalk_1.default.green(reviewed) : chalk_1.default.yellow("NOT REVIEWED (frozen)")}`);
    console.log(`  Created:  ${profile.meta?.created_at || "-"}`);
    console.log("");
    const t = new cli_table3_1.default({
        head: ["Dimension", "Value", "Confidence", "Source", "Evidence"],
        style: { head: ["cyan"] },
    });
    for (const dim of DIMENSIONS) {
        const f = profile.facts[dim];
        if (!f)
            continue;
        const isOverride = profile.overrides?.[dim] !== undefined;
        t.push([
            isOverride ? chalk_1.default.magenta(`${dim} (override)`) : dim,
            f.value,
            f.confidence === "high"
                ? chalk_1.default.green(f.confidence)
                : chalk_1.default.yellow(f.confidence),
            f.source === "override" ? chalk_1.default.magenta(f.source) : f.source,
            (f.evidence || "").slice(0, 40),
        ]);
    }
    console.log(t.toString());
    if (profile.overrides && Object.keys(profile.overrides).length > 0) {
        console.log(chalk_1.default.bold("\n  🛠  Active Overrides:"));
        for (const [dim, value] of Object.entries(profile.overrides)) {
            console.log(`    • ${dim} = ${value}`);
        }
        console.log("");
    }
    if (!reviewed) {
        console.log(chalk_1.default.gray("  Run `spec-graph profile review` to freeze after human check."));
    }
}
async function reviewProfile(projectRoot) {
    const profile = await loadOrExit(projectRoot);
    const now = new Date().toISOString();
    profile.meta = profile.meta || {
        created_at: now,
        source: { repo_scan: true, llm_classified: false },
    };
    profile.meta.source = profile.meta.source || {
        repo_scan: true,
        llm_classified: false,
    };
    profile.meta.source.reviewed_at = now;
    await (0, yaml_1.writeYaml)(node_path_1.default.join(projectRoot, PROFILE_PATH), profile);
    console.log(chalk_1.default.green(`\n✓ Profile frozen at ${now}`));
    console.log(chalk_1.default.gray("  `compose` will no longer warn about an unreviewed profile.\n"));
}
async function applyOverride(projectRoot, pairs) {
    if (!pairs) {
        console.log(chalk_1.default.red("✗ No overrides provided. Usage: spec-graph profile override criticality=compliance,team=multi"));
        process.exit(1);
    }
    const { overrides, warnings } = (0, overrides_1.parseProfileOverrides)(pairs);
    if (Object.keys(overrides).length === 0) {
        console.log(chalk_1.default.red("✗ No valid overrides parsed."));
        process.exit(1);
    }
    const profile = await loadOrExit(projectRoot);
    profile.overrides = { ...profile.overrides, ...overrides };
    await (0, yaml_1.writeYaml)(node_path_1.default.join(projectRoot, PROFILE_PATH), profile);
    console.log(chalk_1.default.green(`\n✓ Applied ${Object.keys(overrides).length} override(s):`));
    for (const [dim, value] of Object.entries(overrides)) {
        console.log(`    • ${dim} = ${value}`);
    }
    console.log(chalk_1.default.gray("\n  Run `spec-graph profile review` to freeze, or `spec-graph compose` to re-compose.\n"));
    if (warnings.length > 0) {
        console.log(chalk_1.default.yellow("  Warnings:"));
        for (const w of warnings)
            console.log(chalk_1.default.yellow(`    • ${w}`));
    }
}
//# sourceMappingURL=profile.js.map