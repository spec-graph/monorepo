"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.constitutionCommand = constitutionCommand;
exports.loadConstitution = loadConstitution;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const CONSTITUTION_PATH = ".spec-graph/constitution.yaml";
const DEFAULT_THRESHOLDS = {
    test_coverage: 0.8,
    cyclomatic_complexity: 15,
    ambiguity_score: 0,
    placeholder_count: 0,
    non_measurable_count: 5,
    lint_warnings: 0,
};
// Default command safety rules — inherit wdf-method SPEC §5.
// Whitelist: allowed command prefixes. Builtin sentinels `<...>` are always
// safe (dispatched to TS functions, not shell) and exempt from this list.
// Forbidden patterns: banned substrings — checked against the whole command
// string after the whitelist match. Covers shell metacharacters, network
// fetches, privilege escalation, and destructive globs.
const DEFAULT_COMMAND_WHITELIST = [
    "npm test",
    "npm run",
    "npx",
    "node",
    "jest",
    "vitest",
    "tsc",
    "eslint",
];
const DEFAULT_FORBIDDEN_PATTERNS = [
    "&&",
    "||",
    ";",
    "|",
    "$(",
    "`",
    ">",
    "<",
    "curl",
    "wget",
    "sudo",
    "su ",
    "eval",
    "rm -rf",
];
// Default constitutional articles — qualitative invariants (inherit spec-kit 9 Articles).
// These are sensible defaults; projects should customize to their needs.
const DEFAULT_ARTICLES = [
    {
        id: "story-has-ac",
        description: "Every story must have acceptance criteria",
        rule: {
            type: "required_section",
            artifact_kind: "plan/story",
            section: "Acceptance Criteria",
        },
    },
    {
        id: "c4-has-context",
        description: "C4 diagram must include a Context section",
        rule: {
            type: "required_section",
            artifact_kind: "design/c4",
            section: "Context",
        },
    },
];
async function constitutionCommand(projectRoot, options) {
    const subcommand = options.subcommand || "show";
    try {
        switch (subcommand) {
            case "init":
                await initConstitution(projectRoot, options);
                break;
            case "show":
                await showConstitution(projectRoot, options);
                break;
            case "validate":
                await validateConstitution(projectRoot, options);
                break;
            case "diff-packs":
                await diffAgainstPacks(projectRoot, options);
                break;
            case "bump":
                await bumpConstitution(projectRoot, options);
                break;
            case "diff":
                await diffConstitution(projectRoot, options);
                break;
            default:
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: init, show, validate, diff-packs, bump, diff");
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
// ============ init ============
async function initConstitution(projectRoot, options) {
    const constPath = node_path_1.default.join(projectRoot, CONSTITUTION_PATH);
    if (!options.force) {
        const existing = await (0, yaml_1.tryReadYaml)(constPath);
        if (existing) {
            console.log(chalk_1.default.yellow(`\n⚠ Constitution already exists at ${CONSTITUTION_PATH}`));
            console.log(chalk_1.default.gray("  Use --force to overwrite, or edit the file directly.\n"));
            return;
        }
    }
    const profile = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(projectRoot, ".spec-graph", "profile.yaml"));
    const pkg = await tryReadPackageJson(projectRoot);
    const projectName = pkg?.name || profile?.meta?.source?.prompt || node_path_1.default.basename(projectRoot);
    const projectDescription = pkg?.description || "No description set";
    const now = new Date().toISOString();
    const constitution = {
        version: "0.1.0",
        project_name: projectName,
        project_description: projectDescription,
        effective_date: now.split("T")[0],
        last_revised: now,
        quality: {
            thresholds: { ...DEFAULT_THRESHOLDS },
            required_linters: ["lint", "typecheck"],
            require_review_approvers: 1,
            articles: [...DEFAULT_ARTICLES],
        },
        traceability: {
            required_traces: defaultTraceRules(),
            require_ac_test_binding: true,
            require_commit_story_ref: true,
        },
        semver: {
            major_bump_on: [
                "contract-removed",
                "contract-breaking-change",
                "public-api-removed",
            ],
            minor_bump_on: ["contract-added", "feature-added"],
            patch_bump_on: ["bugfix", "internal-refactor"],
            deprecation_grace_releases: 2,
        },
        security: {
            command_whitelist: [...DEFAULT_COMMAND_WHITELIST],
            forbidden_patterns: [...DEFAULT_FORBIDDEN_PATTERNS],
        },
    };
    await (0, yaml_1.writeYaml)(constPath, constitution);
    console.log(chalk_1.default.green(`\n✓ Constitution initialized at ${CONSTITUTION_PATH}`));
    console.log(`  Project: ${projectName}`);
    console.log(`  Version: ${constitution.version}`);
    console.log(`  Effective: ${constitution.effective_date}`);
    console.log(chalk_1.default.gray(`\n  Edit ${CONSTITUTION_PATH} to customize thresholds, traces, and semver policy.`));
    console.log(chalk_1.default.gray("  Run `spec-graph constitution validate` to check internal consistency."));
    console.log(chalk_1.default.gray("  Run `spec-graph constitution diff-packs` to find pack thresholds that diverge.\n"));
}
function defaultTraceRules() {
    return [
        {
            name: "story_to_prd",
            from_kind: "plan/story",
            to_kind: "requirement/prd",
            via: ["derives"],
            cardinality: "every",
        },
        {
            name: "ac_to_test",
            from_kind: "plan/story",
            to_kind: "verification/test-report",
            via: ["verifies"],
            cardinality: "every",
        },
        {
            name: "design_to_req",
            from_kind: "design/c4",
            to_kind: "requirement/prd",
            via: ["derives"],
            cardinality: "every",
        },
    ];
}
async function tryReadPackageJson(projectRoot) {
    try {
        const content = await promises_1.default.readFile(node_path_1.default.join(projectRoot, "package.json"), "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
// ============ show ============
async function showConstitution(projectRoot, options) {
    const constitution = await loadConstitutionOrExit(projectRoot);
    if (options.json) {
        console.log(JSON.stringify(constitution, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n📜 Constitution: ${constitution.project_name}\n`));
    console.log(`  Version:        ${constitution.version}`);
    console.log(`  Effective:      ${constitution.effective_date}`);
    console.log(`  Last revised:   ${constitution.last_revised}`);
    if (constitution.project_description) {
        console.log(`  Description:    ${constitution.project_description}`);
    }
    console.log("");
    console.log(chalk_1.default.bold("  📐 Quality Thresholds:"));
    const t = constitution.quality.thresholds;
    const thresholdRows = [
        [
            "test_coverage",
            t.test_coverage !== undefined
                ? `${(t.test_coverage * 100).toFixed(0)}%`
                : "-",
        ],
        ["cyclomatic_complexity", t.cyclomatic_complexity?.toString() || "-"],
        ["ambiguity_score", t.ambiguity_score?.toString() || "-"],
        ["placeholder_count", t.placeholder_count?.toString() || "-"],
        ["non_measurable_count", t.non_measurable_count?.toString() || "-"],
        ["lint_warnings", t.lint_warnings?.toString() || "-"],
    ];
    const tt = new cli_table3_1.default({
        head: ["Threshold", "Value"],
        style: { head: ["cyan"] },
    });
    for (const r of thresholdRows)
        tt.push(r);
    console.log(tt.toString());
    console.log(`  Required linters:        ${constitution.quality.required_linters.join(", ")}`);
    console.log(`  Required review approvers: ${constitution.quality.require_review_approvers}`);
    console.log("");
    console.log(chalk_1.default.bold("  🔗 Traceability:"));
    console.log(`    AC↔Test binding required: ${constitution.traceability.require_ac_test_binding}`);
    console.log(`    Commit→Story ref required: ${constitution.traceability.require_commit_story_ref}`);
    console.log(`    Required traces:`);
    for (const r of constitution.traceability.required_traces) {
        console.log(`      • ${r.name}: ${r.from_kind} → ${r.to_kind} via ${r.via.join(",")} [${r.cardinality}]`);
    }
    console.log("");
    console.log(chalk_1.default.bold("  📦 Semver Policy:"));
    console.log(`    MAJOR on: ${constitution.semver.major_bump_on.join(", ")}`);
    console.log(`    MINOR on: ${constitution.semver.minor_bump_on.join(", ")}`);
    console.log(`    PATCH on: ${constitution.semver.patch_bump_on.join(", ")}`);
    console.log(`    Deprecation grace: ${constitution.semver.deprecation_grace_releases} releases`);
    console.log("");
    if (constitution.quality.articles &&
        constitution.quality.articles.length > 0) {
        console.log(chalk_1.default.bold("  📜 Constitutional Articles:"));
        for (const a of constitution.quality.articles) {
            const rule = a.rule;
            let ruleDesc = "";
            if (rule.type === "required_section")
                ruleDesc = `${rule.artifact_kind} must have section "${rule.section}"`;
            else if (rule.type === "min_length")
                ruleDesc = `${rule.artifact_kind} must have ≥${rule.min_chars} chars`;
            else if (rule.type === "co_completed")
                ruleDesc = `if ${rule.from_kind} done → ${rule.to_kind} must be done`;
            console.log(`    • ${a.id}: ${a.description} [${ruleDesc}]`);
        }
        console.log("");
    }
    if (constitution.waivers && constitution.waivers.length > 0) {
        console.log(chalk_1.default.bold(chalk_1.default.yellow("  ⚠ Active Waivers:")));
        for (const w of constitution.waivers) {
            console.log(`    • ${w.rule_id}: ${w.reason} (expires ${w.expires_at}, approved by ${w.approved_by.join(", ")})`);
        }
        console.log("");
    }
}
// ============ validate ============
async function validateConstitution(projectRoot, options) {
    const constitution = await loadConstitutionOrExit(projectRoot);
    const errors = [];
    const warnings = [];
    validateSchema(constitution, errors, warnings);
    const packDrift = await detectPackThresholdDrift(projectRoot, constitution);
    warnings.push(...packDrift);
    if (options.json) {
        console.log(JSON.stringify({
            valid: errors.length === 0,
            errors,
            warnings,
        }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n🔍 Constitution Validation\n"));
    if (errors.length === 0 && warnings.length === 0) {
        console.log(chalk_1.default.green("  ✓ Constitution is valid and consistent with packs.\n"));
        return;
    }
    if (errors.length > 0) {
        console.log(chalk_1.default.red("  ❌ Errors:"));
        for (const e of errors)
            console.log(chalk_1.default.red(`    • ${e}`));
    }
    if (warnings.length > 0) {
        console.log(chalk_1.default.yellow("  ⚠ Warnings:"));
        for (const w of warnings)
            console.log(chalk_1.default.yellow(`    • ${w}`));
    }
    console.log("");
    if (errors.length > 0)
        process.exit(1);
}
function validateSchema(c, errors, warnings) {
    if (!c.version)
        errors.push("missing top-level: version");
    if (!c.project_name)
        errors.push("missing top-level: project_name");
    if (!c.effective_date)
        errors.push("missing top-level: effective_date");
    const t = c.quality?.thresholds;
    if (t) {
        if (t.test_coverage !== undefined &&
            (t.test_coverage < 0 || t.test_coverage > 1)) {
            errors.push(`quality.thresholds.test_coverage must be 0..1, got ${t.test_coverage}`);
        }
        if (t.cyclomatic_complexity !== undefined && t.cyclomatic_complexity < 1) {
            errors.push(`quality.thresholds.cyclomatic_complexity must be ≥1, got ${t.cyclomatic_complexity}`);
        }
        if (t.placeholder_count !== undefined && t.placeholder_count < 0) {
            warnings.push(`quality.thresholds.placeholder_count is negative — set to 0 to disable`);
        }
    }
    else {
        errors.push("missing section: quality.thresholds");
    }
    if (!c.quality?.required_linters || c.quality.required_linters.length === 0) {
        warnings.push("quality.required_linters is empty — at least one linter should be enforced");
    }
    if (c.quality?.require_review_approvers === undefined ||
        c.quality.require_review_approvers < 0) {
        errors.push("quality.require_review_approvers must be ≥0");
    }
    if (c.traceability?.required_traces) {
        for (const r of c.traceability.required_traces) {
            if (!["exists", "every", "single"].includes(r.cardinality)) {
                errors.push(`traceability.required_traces[${r.name}].cardinality invalid: ${r.cardinality}`);
            }
        }
    }
    if (c.semver?.deprecation_grace_releases !== undefined &&
        c.semver.deprecation_grace_releases < 0) {
        errors.push("semver.deprecation_grace_releases must be ≥0");
    }
    if (c.quality?.articles) {
        const validRuleTypes = ["required_section", "min_length", "co_completed"];
        for (const a of c.quality.articles) {
            if (!a.id)
                errors.push("quality.articles: missing id");
            if (!a.description)
                warnings.push(`quality.articles[${a.id}]: missing description`);
            if (!a.rule || !validRuleTypes.includes(a.rule.type)) {
                errors.push(`quality.articles[${a.id}]: invalid rule type (must be one of: ${validRuleTypes.join(", ")})`);
            }
            else {
                if ((a.rule.type === "required_section" ||
                    a.rule.type === "min_length") &&
                    !a.rule.artifact_kind) {
                    errors.push(`quality.articles[${a.id}]: missing artifact_kind`);
                }
                if (a.rule.type === "required_section" && !a.rule.section) {
                    errors.push(`quality.articles[${a.id}]: missing section`);
                }
                if (a.rule.type === "min_length" &&
                    (a.rule.min_chars === undefined || a.rule.min_chars < 1)) {
                    errors.push(`quality.articles[${a.id}]: min_chars must be ≥1`);
                }
                if (a.rule.type === "co_completed" &&
                    (!a.rule.from_kind || !a.rule.to_kind)) {
                    errors.push(`quality.articles[${a.id}]: co_completed requires from_kind and to_kind`);
                }
            }
        }
    }
    if (c.waivers) {
        for (const w of c.waivers) {
            if (!w.expires_at)
                errors.push(`waiver ${w.rule_id}: missing expires_at`);
            if (!w.approved_by || w.approved_by.length === 0) {
                errors.push(`waiver ${w.rule_id}: must have at least one approver`);
            }
        }
    }
}
async function detectPackThresholdDrift(projectRoot, constitution) {
    const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    const graph = await (0, yaml_1.tryReadYaml)(graphPath);
    if (!graph)
        return [];
    const warnings = [];
    const checks = graph.checks || [];
    const constT = constitution.quality.thresholds;
    const candidates = [
        {
            id: "complexity-budget",
            packValue: findCheck(checks, "complexity-budget")?.threshold
                ?.cyclomatic,
            constValue: constT.cyclomatic_complexity,
            label: "threshold.cyclomatic",
        },
        {
            id: "clarify-scan",
            packValue: findCheck(checks, "clarify-scan")?.threshold
                ?.ambiguity,
            constValue: constT.ambiguity_score,
            label: "threshold.ambiguity",
        },
    ];
    for (const c of candidates) {
        if (c.constValue !== undefined &&
            c.packValue !== undefined &&
            c.constValue !== c.packValue) {
            warnings.push(`${c.id}: pack declares ${c.label}=${c.packValue}, constitution says ${c.constValue} — constitution wins`);
        }
    }
    return warnings;
}
// ============ diff-packs ============
async function diffAgainstPacks(projectRoot, options) {
    const constitution = await loadConstitutionOrExit(projectRoot);
    const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    const graph = await (0, yaml_1.tryReadYaml)(graphPath);
    if (!graph) {
        console.log(chalk_1.default.red("✗ graph.yaml not found. Run `spec-graph compose` first."));
        process.exit(1);
        return;
    }
    const drifts = collectPackDrift(graph, constitution);
    if (options.json) {
        console.log(JSON.stringify({ drifts }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold("\n📊 Constitution vs Pack Thresholds\n"));
    if (drifts.length === 0) {
        console.log(chalk_1.default.green("  ✓ All pack-declared thresholds match the constitution.\n"));
        return;
    }
    const table = new cli_table3_1.default({
        head: ["Check ID", "Pack Value", "Constitution Value", "Action"],
        style: { head: ["cyan"] },
    });
    for (const d of drifts) {
        table.push([
            d.check_id,
            d.pack_value?.toString() || "-",
            d.constitution_value?.toString() || "-",
            chalk_1.default.yellow("constitution wins"),
        ]);
    }
    console.log(table.toString());
    console.log(chalk_1.default.gray("\n  Constitution is the source of truth at runtime."));
    console.log(chalk_1.default.gray("  To silence this warning, align pack thresholds with the constitution (or vice versa).\n"));
}
function collectPackDrift(graph, constitution) {
    const drifts = [];
    const checks = graph.checks || [];
    const constT = constitution.quality.thresholds;
    const candidates = [
        {
            id: "complexity-budget",
            packValue: findCheck(checks, "complexity-budget")?.threshold
                ?.cyclomatic,
            constValue: constT.cyclomatic_complexity,
        },
        {
            id: "clarify-scan",
            packValue: findCheck(checks, "clarify-scan")?.threshold?.ambiguity,
            constValue: constT.ambiguity_score,
        },
        {
            id: "clarify-scan",
            packValue: findCheck(checks, "clarify-scan")?.threshold?.placeholder,
            constValue: constT.placeholder_count,
        },
        {
            id: "clarify-scan",
            packValue: findCheck(checks, "clarify-scan")?.threshold
                ?.non_measurable,
            constValue: constT.non_measurable_count,
        },
    ];
    for (const c of candidates) {
        if (c.constValue !== undefined &&
            c.packValue !== undefined &&
            c.constValue !== c.packValue) {
            drifts.push({
                check_id: c.id,
                pack_value: c.packValue,
                constitution_value: c.constValue,
            });
        }
    }
    return drifts;
}
function findCheck(checks, id) {
    return checks.find((c) => c.id === id);
}
const SNAPSHOT_PATH = ".spec-graph/.constitution-snapshot.json";
async function bumpConstitution(projectRoot, options) {
    const constitution = await loadConstitutionOrExit(projectRoot);
    const constPath = node_path_1.default.join(projectRoot, CONSTITUTION_PATH);
    const snapshotPath = node_path_1.default.join(projectRoot, SNAPSHOT_PATH);
    // Parse bump type from options (default: patch)
    const bumpType = options.type || "patch";
    if (!["major", "minor", "patch"].includes(bumpType)) {
        console.log(chalk_1.default.red(`✗ Invalid bump type: ${bumpType}. Must be major, minor, or patch.`));
        process.exit(1);
        return;
    }
    // Save current state as snapshot before bumping
    const snapshot = {
        version: constitution.version,
        snapshot_at: new Date().toISOString(),
        constitution: { ...constitution },
    };
    await (0, yaml_1.writeYaml)(snapshotPath, snapshot);
    // Bump version
    const newVersion = bumpSemver(constitution.version, bumpType);
    constitution.version = newVersion;
    constitution.last_revised = new Date().toISOString();
    await (0, yaml_1.writeYaml)(constPath, constitution);
    console.log(chalk_1.default.green(`\n✓ Constitution bumped: ${snapshot.version} → ${newVersion}`));
    console.log(`  Snapshot saved: ${SNAPSHOT_PATH}`);
    console.log(chalk_1.default.gray(`\n  Run \`spec-graph constitution diff\` to see what changed since the snapshot.`));
}
function bumpSemver(version, type) {
    const parts = version.split(".").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`Invalid semver: ${version}`);
    }
    const [major, minor, patch] = parts;
    switch (type) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
    }
}
// ============ diff ============
async function diffConstitution(projectRoot, options) {
    const snapshotPath = node_path_1.default.join(projectRoot, SNAPSHOT_PATH);
    const snapshot = await (0, yaml_1.tryReadYaml)(snapshotPath);
    if (!snapshot) {
        console.log(chalk_1.default.yellow("\n⚠ No constitution snapshot found."));
        console.log(chalk_1.default.gray("  Run `spec-graph constitution bump` to create a snapshot.\n"));
        return;
    }
    const constitution = await loadConstitutionOrExit(projectRoot);
    const diff = computeConstitutionDiff(snapshot.constitution, constitution);
    if (options.json) {
        console.log(JSON.stringify({
            from_version: snapshot.version,
            to_version: constitution.version,
            snapshot_at: snapshot.snapshot_at,
            diff,
        }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n📊 Constitution Diff: ${snapshot.version} → ${constitution.version}\n`));
    console.log(chalk_1.default.gray(`  Snapshot taken: ${snapshot.snapshot_at}\n`));
    if (diff.thresholds.added.length > 0 ||
        diff.thresholds.removed.length > 0 ||
        diff.thresholds.changed.length > 0) {
        console.log(chalk_1.default.bold("  📐 Quality Thresholds:"));
        for (const t of diff.thresholds.added)
            console.log(chalk_1.default.green(`    + ${t.key}: ${t.value}`));
        for (const t of diff.thresholds.removed)
            console.log(chalk_1.default.red(`    - ${t.key}: ${t.value}`));
        for (const t of diff.thresholds.changed)
            console.log(chalk_1.default.yellow(`    ~ ${t.key}: ${t.old} → ${t.new}`));
        console.log("");
    }
    if (diff.articles.added.length > 0 ||
        diff.articles.removed.length > 0 ||
        diff.articles.changed.length > 0) {
        console.log(chalk_1.default.bold("  📜 Constitutional Articles:"));
        for (const a of diff.articles.added)
            console.log(chalk_1.default.green(`    + ${a.id}: ${a.description}`));
        for (const a of diff.articles.removed)
            console.log(chalk_1.default.red(`    - ${a.id}: ${a.description}`));
        for (const a of diff.articles.changed)
            console.log(chalk_1.default.yellow(`    ~ ${a.id}: ${a.description}`));
        console.log("");
    }
    if (diff.traces.added.length > 0 ||
        diff.traces.removed.length > 0 ||
        diff.traces.changed.length > 0) {
        console.log(chalk_1.default.bold("  🔗 Traceability Rules:"));
        for (const t of diff.traces.added)
            console.log(chalk_1.default.green(`    + ${t.name}: ${t.from_kind} → ${t.to_kind}`));
        for (const t of diff.traces.removed)
            console.log(chalk_1.default.red(`    - ${t.name}: ${t.from_kind} → ${t.to_kind}`));
        for (const t of diff.traces.changed)
            console.log(chalk_1.default.yellow(`    ~ ${t.name}: ${t.from_kind} → ${t.to_kind}`));
        console.log("");
    }
    if (diff.waivers.added.length > 0 || diff.waivers.removed.length > 0) {
        console.log(chalk_1.default.bold("  ⚠ Waivers:"));
        for (const w of diff.waivers.added)
            console.log(chalk_1.default.green(`    + ${w.rule_id}: ${w.reason}`));
        for (const w of diff.waivers.removed)
            console.log(chalk_1.default.red(`    - ${w.rule_id}: ${w.reason}`));
        console.log("");
    }
    const totalChanges = diff.thresholds.added.length +
        diff.thresholds.removed.length +
        diff.thresholds.changed.length +
        diff.articles.added.length +
        diff.articles.removed.length +
        diff.articles.changed.length +
        diff.traces.added.length +
        diff.traces.removed.length +
        diff.traces.changed.length +
        diff.waivers.added.length +
        diff.waivers.removed.length;
    if (totalChanges === 0) {
        console.log(chalk_1.default.green("  ✓ No changes detected since snapshot.\n"));
    }
    else {
        console.log(chalk_1.default.yellow(`  ⚠ ${totalChanges} change(s) detected.`));
        console.log(chalk_1.default.gray(`  Run \`spec-graph change sync <change-id>\` to see which artifacts need re-validation.\n`));
    }
}
function computeConstitutionDiff(oldC, newC) {
    const diff = {
        thresholds: {
            added: [],
            removed: [],
            changed: [],
        },
        articles: {
            added: [],
            removed: [],
            changed: [],
        },
        traces: { added: [], removed: [], changed: [] },
        waivers: { added: [], removed: [] },
    };
    // Thresholds
    const oldT = oldC.quality?.thresholds || {};
    const newT = newC.quality?.thresholds || {};
    const allKeys = new Set([...Object.keys(oldT), ...Object.keys(newT)]);
    for (const key of allKeys) {
        const oldVal = oldT[key];
        const newVal = newT[key];
        if (oldVal === undefined && newVal !== undefined) {
            diff.thresholds.added.push({ key, value: newVal });
        }
        else if (oldVal !== undefined && newVal === undefined) {
            diff.thresholds.removed.push({ key, value: oldVal });
        }
        else if (oldVal !== newVal) {
            diff.thresholds.changed.push({ key, old: oldVal, new: newVal });
        }
    }
    // Articles
    const oldArticles = new Map((oldC.quality?.articles || []).map((a) => [a.id, a]));
    const newArticles = new Map((newC.quality?.articles || []).map((a) => [a.id, a]));
    for (const [id, article] of newArticles) {
        if (!oldArticles.has(id)) {
            diff.articles.added.push(article);
        }
        else if (JSON.stringify(oldArticles.get(id)) !== JSON.stringify(article)) {
            diff.articles.changed.push(article);
        }
    }
    for (const [id, article] of oldArticles) {
        if (!newArticles.has(id)) {
            diff.articles.removed.push(article);
        }
    }
    // Traces
    const oldTraces = new Map((oldC.traceability?.required_traces || []).map((t) => [t.name, t]));
    const newTraces = new Map((newC.traceability?.required_traces || []).map((t) => [t.name, t]));
    for (const [name, trace] of newTraces) {
        if (!oldTraces.has(name)) {
            diff.traces.added.push(trace);
        }
        else if (JSON.stringify(oldTraces.get(name)) !== JSON.stringify(trace)) {
            diff.traces.changed.push(trace);
        }
    }
    for (const [name, trace] of oldTraces) {
        if (!newTraces.has(name)) {
            diff.traces.removed.push(trace);
        }
    }
    // Waivers
    const oldWaivers = new Set((oldC.waivers || []).map((w) => w.rule_id));
    const newWaivers = new Set((newC.waivers || []).map((w) => w.rule_id));
    for (const w of newC.waivers || []) {
        if (!oldWaivers.has(w.rule_id))
            diff.waivers.added.push(w);
    }
    for (const w of oldC.waivers || []) {
        if (!newWaivers.has(w.rule_id))
            diff.waivers.removed.push(w);
    }
    return diff;
}
// ============ helpers ============
async function loadConstitution(projectRoot) {
    return (0, yaml_1.tryReadYaml)(node_path_1.default.join(projectRoot, CONSTITUTION_PATH));
}
async function loadConstitutionOrExit(projectRoot) {
    const c = await loadConstitution(projectRoot);
    if (!c) {
        console.log(chalk_1.default.red("✗ Constitution not found. Run `spec-graph constitution init` first."));
        process.exit(1);
        throw new Error("unreachable");
    }
    return c;
}
//# sourceMappingURL=constitution.js.map