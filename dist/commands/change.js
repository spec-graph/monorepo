"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeCommand = changeCommand;
exports.findActiveChange = findActiveChange;
exports.appendToActiveChangeAudit = appendToActiveChangeAudit;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
async function changeCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const changesDir = node_path_1.default.join(specGraphDir, "changes");
    try {
        await ensureInitialized(changesDir);
        const subcommand = options.subcommand || "list";
        switch (subcommand) {
            case "list":
                await listChanges(changesDir);
                break;
            case "create":
                await createChange(changesDir, options);
                break;
            case "show":
                await showChangeCmd(changesDir, options);
                break;
            case "apply":
                await applyChangeCmd(projectRoot, changesDir, options);
                break;
            case "complete":
                await completeChangeCmd(projectRoot, changesDir, options);
                break;
            case "discard":
                await discardChangeCmd(changesDir, options);
                break;
            case "sync":
                await syncChangeCmd(projectRoot, changesDir, options);
                break;
            case "archive":
                await archiveChangeCmd(projectRoot, changesDir, options);
                break;
            default:
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
                console.log("Available: list, create, show, apply, complete, discard, sync, archive");
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
async function ensureInitialized(changesDir) {
    try {
        await promises_1.default.access(changesDir);
    }
    catch {
        console.log(chalk_1.default.red("✗ Project not initialized. Run `spec-graph init` first."));
        process.exit(1);
    }
}
async function listChanges(changesDir) {
    const changes = await loadAllChanges(changesDir);
    if (changes.length === 0) {
        console.log(chalk_1.default.yellow("\nNo active changes found."));
        console.log("Create one with: spec-graph change create\n");
        return;
    }
    console.log(chalk_1.default.bold("\n📋 Active Changes\n"));
    const table = new cli_table3_1.default({
        head: ["ID", "Title", "Type", "Status", "Priority", "Created"],
        style: { head: ["cyan"] },
    });
    for (const change of changes) {
        table.push([
            change.id,
            change.title.slice(0, 40),
            change.type,
            change.status,
            change.priority,
            new Date(change.created_at).toLocaleDateString(),
        ]);
    }
    console.log(table.toString());
    console.log("");
}
async function createChange(changesDir, options) {
    const now = new Date().toISOString();
    // 生成带主题的文件名前缀（清理特殊字符，限制长度）
    const titleSlug = (options.title || "change")
        .replace(/[^a-zA-Z0-9一-龥]/g, "-") // 保留中文、字母、数字
        .replace(/-+/g, "-") // 合并多个 -
        .replace(/^-|-$/g, "") // 去除首尾 -
        .slice(0, 30); // 限制长度
    const filePrefix = `${titleSlug}-${Date.now()}`;
    const id = filePrefix; // ID 也使用带主题的前缀
    const change = {
        id,
        title: options.title || "New Change",
        description: options.description || "Description of the change",
        created_at: now,
        type: options.type || "feature",
        priority: options.priority || "medium",
        scope: { tracks: [] },
        impact: { risk_level: "medium" },
        status: "proposed",
    };
    // plan MD 带主题和时间戳
    const planRelPath = `.spec-graph/changes/${filePrefix}-plan.md`;
    change.plan_path = planRelPath;
    // JSON 也带主题和时间戳
    const changePath = node_path_1.default.join(changesDir, `${filePrefix}.json`);
    await promises_1.default.writeFile(changePath, JSON.stringify(change, null, 2));
    // 创建空的 plan MD（agent 填写实际内容）
    const planPath = node_path_1.default.join(changesDir, `${filePrefix}-plan.md`);
    await promises_1.default.writeFile(planPath, `# ${change.title}\n\n> Change ID: ${change.id}\n> Type: ${change.type} | Priority: ${change.priority}\n> Created: ${change.created_at}\n\n`, "utf-8");
    console.log(chalk_1.default.green(`\n✓ Change created: ${id}`));
    console.log(`  Title: ${change.title}`);
    console.log(chalk_1.default.cyan(`  📋 JSON: ${filePrefix}.json`));
    console.log(chalk_1.default.cyan(`  📋 Plan: ${filePrefix}-plan.md`));
    console.log(chalk_1.default.gray(`  AI agent 填写 plan MD 内容`));
    console.log(chalk_1.default.gray(`  Apply: spec-graph change apply ${id}`));
    console.log("");
}
async function lockChangeCmd(changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change lock <id>"));
        process.exit(1);
        return;
    }
    const planPath = node_path_1.default.join(changesDir, `${options.id}-plan.yaml`);
    const plan = await (0, yaml_1.tryReadYaml)(planPath);
    if (!plan) {
        console.log(chalk_1.default.red(`✗ Plan not found: ${planPath}`));
        process.exit(1);
        return;
    }
    if (plan.locked_at) {
        console.log(chalk_1.default.yellow(`⚠ Plan already locked at ${plan.locked_at}`));
        console.log(chalk_1.default.gray("  Use --force to re-lock after drift"));
        if (!options.force)
            return;
    }
    // Validate plan has required content before locking
    const required = ["background", "scope_in", "acceptance_criteria"];
    const missing = [];
    if (!plan.background || plan.background.trim() === "")
        missing.push("background");
    if (!plan.scope_in || plan.scope_in.length === 0)
        missing.push("scope_in");
    if (!plan.acceptance_criteria || plan.acceptance_criteria.length === 0)
        missing.push("acceptance_criteria");
    if (missing.length > 0 && !options.force) {
        console.log(chalk_1.default.red(`✗ Plan incomplete. Missing: ${missing.join(", ")}`));
        console.log(chalk_1.default.gray(`  Fill in ${planPath} then re-lock`));
        process.exit(1);
        return;
    }
    plan.locked_at = new Date().toISOString();
    await (0, yaml_1.writeYaml)(planPath, plan);
    console.log(chalk_1.default.green(`\n🔒 Plan locked: ${options.id}`));
    console.log(chalk_1.default.gray(`  Locked at: ${plan.locked_at}`));
    console.log(chalk_1.default.gray(`  Any modification to scope/AC will be recorded as drift.`));
    console.log(chalk_1.default.gray(`  Resume after interruption: spec-graph change resume ${options.id}`));
    console.log("");
}
async function planChangeCmd(changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change plan <id>"));
        process.exit(1);
        return;
    }
    const planPath = node_path_1.default.join(changesDir, `${options.id}-plan.yaml`);
    const plan = await (0, yaml_1.tryReadYaml)(planPath);
    if (!plan) {
        console.log(chalk_1.default.red(`✗ Plan not found: ${planPath}`));
        process.exit(1);
        return;
    }
    if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
    }
    const locked = plan.locked_at ? chalk_1.default.red("🔒 LOCKED") : chalk_1.default.yellow("📋 DRAFT");
    const driftCount = plan.drift_log?.length || 0;
    console.log(chalk_1.default.bold(`\n📋 Plan: ${options.id} ${locked}\n`));
    console.log(`  Version: ${plan.version}  |  Drift: ${driftCount} change(s)\n`);
    if (plan.background) {
        console.log(chalk_1.default.bold("  Background"));
        console.log(`    ${plan.background}`);
        console.log("");
    }
    if (plan.scope_in?.length > 0) {
        console.log(chalk_1.default.bold("  Scope (IN)"));
        for (const item of plan.scope_in)
            console.log(chalk_1.default.green(`    ✓ ${item}`));
        console.log("");
    }
    if (plan.scope_out?.length > 0) {
        console.log(chalk_1.default.bold("  Scope (OUT)"));
        for (const item of plan.scope_out)
            console.log(chalk_1.default.red(`    ✗ ${item}`));
        console.log("");
    }
    if (plan.acceptance_criteria?.length > 0) {
        console.log(chalk_1.default.bold("  Acceptance Criteria"));
        for (const item of plan.acceptance_criteria) {
            const done = plan.completed_items?.includes(item);
            console.log(`    ${done ? chalk_1.default.green("[✓]") : "[ ]"} ${item}`);
        }
        console.log("");
    }
    if (plan.remaining_items?.length > 0) {
        console.log(chalk_1.default.bold("  Remaining"));
        for (const item of plan.remaining_items)
            console.log(chalk_1.default.yellow(`    ○ ${item}`));
        console.log("");
    }
    if (plan.blockers?.length > 0) {
        console.log(chalk_1.default.red("  ⚠ Blockers"));
        for (const item of plan.blockers)
            console.log(chalk_1.default.red(`    ! ${item}`));
        console.log("");
    }
    if (plan.open_questions?.length > 0) {
        console.log(chalk_1.default.bold("  Open Questions"));
        for (const item of plan.open_questions)
            console.log(chalk_1.default.gray(`    ? ${item}`));
        console.log("");
    }
    if (driftCount > 0) {
        console.log(chalk_1.default.yellow(`  Drift Log (${driftCount})`));
        for (const d of plan.drift_log || []) {
            console.log(chalk_1.default.gray(`    ${d.timestamp}: ${d.field} — ${d.reason}`));
        }
        console.log("");
    }
}
async function resumeChangeCmd(changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change resume <id>"));
        process.exit(1);
        return;
    }
    const changePath = node_path_1.default.join(changesDir, `${options.id}.json`);
    const change = await (0, yaml_1.tryReadYaml)(changePath);
    if (!change) {
        console.log(chalk_1.default.red(`✗ Change not found: ${options.id}`));
        process.exit(1);
        return;
    }
    const planPath = node_path_1.default.join(changesDir, `${options.id}-plan.yaml`);
    const plan = await (0, yaml_1.tryReadYaml)(planPath);
    console.log(chalk_1.default.bold(`\n🔄 Resume: ${change.title}\n`));
    console.log(`  Status: ${change.status}  |  Type: ${change.type}`);
    if (plan) {
        console.log(`  Plan: ${plan.locked_at ? "🔒 locked" : "📋 draft"} v${plan.version}`);
        console.log("");
        if (plan.background) {
            console.log(chalk_1.default.cyan("  📖 Background"));
            console.log(`    ${plan.background}`);
            console.log("");
        }
        if (plan.scope_in?.length > 0) {
            console.log(chalk_1.default.green("  🎯 Scope"));
            for (const item of plan.scope_in)
                console.log(`    - ${item}`);
            console.log("");
        }
        if (plan.completed_items?.length > 0) {
            console.log(chalk_1.default.green("  ✅ Completed"));
            for (const item of plan.completed_items)
                console.log(`    ✓ ${item}`);
            console.log("");
        }
        if (plan.remaining_items?.length > 0) {
            console.log(chalk_1.default.yellow("  ⏳ Remaining"));
            for (const item of plan.remaining_items)
                console.log(`    ○ ${item}`);
            console.log("");
        }
        if (plan.blockers?.length > 0) {
            console.log(chalk_1.default.red("  🚫 Blockers"));
            for (const item of plan.blockers)
                console.log(`    ! ${item}`);
            console.log("");
        }
        console.log(chalk_1.default.gray("  Next: spec-graph dispatch --json"));
    }
    else {
        console.log(chalk_1.default.yellow("  ⚠ No plan found. Create one first."));
    }
    console.log("");
}
async function showChangeCmd(changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change show <id>"));
        process.exit(1);
        return;
    }
    await showChange(changesDir, options.id);
}
async function showChange(changesDir, id) {
    const change = await loadChangeOrExit(changesDir, id);
    console.log(chalk_1.default.bold(`\n📝 Change: ${change.id}\n`));
    console.log(`  Title:       ${change.title}`);
    console.log(`  Description: ${change.description}`);
    console.log(`  Type:        ${change.type}`);
    console.log(`  Status:      ${renderStatus(change.status)}`);
    console.log(`  Priority:    ${change.priority}`);
    console.log(`  Created:     ${new Date(change.created_at).toLocaleString()}`);
    console.log("");
    if (change.scope.tracks && change.scope.tracks.length > 0) {
        console.log(`  Scope Tracks: ${change.scope.tracks.join(", ")}`);
    }
    if (change.scope.files) {
        if (change.scope.files.include) {
            console.log(`  Include:     ${change.scope.files.include.join(", ")}`);
        }
        if (change.scope.files.exclude) {
            console.log(`  Exclude:     ${change.scope.files.exclude.join(", ")}`);
        }
    }
    console.log(`  Risk Level:  ${change.impact.risk_level}`);
    if (change.impact.acceptance_layers) {
        console.log("  Acceptance Layers:");
        for (const [layer, required] of Object.entries(change.impact.acceptance_layers)) {
            console.log(`    • ${layer}: ${required ? "required" : "optional"}`);
        }
    }
    if (change.profile_patch) {
        console.log("  Profile Patches:");
        for (const [dim, val] of Object.entries(change.profile_patch)) {
            console.log(`    • ${dim}: → ${val}`);
        }
        if (change.profile_patch_applied_at) {
            console.log(chalk_1.default.gray(`  (applied at ${change.profile_patch_applied_at})`));
        }
    }
    if (change.sync_impact) {
        console.log(`  Sync Impact (computed ${new Date(change.sync_impact.computed_at).toLocaleString()}):`);
        console.log(`    + artifacts: ${change.sync_impact.artifacts_added.join(", ") || "-"}`);
        console.log(`    - artifacts: ${change.sync_impact.artifacts_removed.join(", ") || "-"}`);
        console.log(`    + checks: ${change.sync_impact.checks_added.join(", ") || "-"}`);
        console.log(`    - checks: ${change.sync_impact.checks_removed.join(", ") || "-"}`);
        console.log(`    + gates: ${change.sync_impact.gates_added.join(", ") || "-"}`);
        console.log(`    - gates: ${change.sync_impact.gates_removed.join(", ") || "-"}`);
        if (change.sync_impact.consumer_ripple.length > 0) {
            console.log("    Consumer ripple:");
            for (const r of change.sync_impact.consumer_ripple) {
                console.log(`      • ${r.contract} → ${r.consumers.join(", ")}`);
            }
        }
    }
    if (change.archive) {
        console.log(`  Archive:`);
        console.log(`    Archived at: ${new Date(change.archive.archived_at).toLocaleString()}`);
        console.log(`    Snapshot:    ${change.archive.snapshot_dir}`);
        console.log(`    Final status: ${change.archive.final_status}`);
    }
    if (change.audit_log && change.audit_log.length > 0) {
        console.log("  Audit Log:");
        for (const entry of change.audit_log) {
            const ts = new Date(entry.timestamp).toLocaleString();
            const author = entry.author ? ` [${entry.author}]` : "";
            console.log(`    • ${ts} — ${entry.action}${author}${entry.message ? `: ${entry.message}` : ""}`);
        }
    }
    console.log("");
}
function renderStatus(status) {
    const colors = {
        proposed: chalk_1.default.yellow(status),
        in_progress: chalk_1.default.blue(status),
        suspended: chalk_1.default.gray(status),
        completed: chalk_1.default.green(status),
        discarded: chalk_1.default.gray(status),
        escalated: chalk_1.default.red(status),
    };
    return colors[status] || status;
}
// ============ change apply ============
async function applyChangeCmd(projectRoot, changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change apply <id>"));
        process.exit(1);
        return;
    }
    const change = await loadChangeOrExit(changesDir, options.id);
    if (change.status === "completed" || change.status === "discarded") {
        console.log(chalk_1.default.red(`✗ Change already ${change.status}. Create a new change for further work.`));
        process.exit(1);
        return;
    }
    console.log(chalk_1.default.bold(`\n Applying change: ${change.title}\n`));
    console.log(`  Type: ${change.type}  Priority: ${change.priority}  Status: ${change.status}`);
    const profilePath = node_path_1.default.join(projectRoot, ".spec-graph", "profile.yaml");
    const profile = await (0, yaml_1.tryReadYaml)(profilePath);
    let profileChanged = false;
    if (change.profile_patch &&
        Object.keys(change.profile_patch).length > 0 &&
        profile) {
        profileChanged = await applyProfilePatch(profile, change.profile_patch);
        if (profileChanged) {
            await (0, yaml_1.writeYaml)(profilePath, profile);
            change.profile_patch_applied_at = new Date().toISOString();
            console.log(chalk_1.default.green(`  ✓ Applied ${Object.keys(change.profile_patch).length} profile patch(es)`));
            for (const [dim, val] of Object.entries(change.profile_patch)) {
                console.log(`    • ${dim} → ${val}`);
            }
        }
    }
    else if (change.profile_patch &&
        Object.keys(change.profile_patch).length > 0) {
        console.log(chalk_1.default.yellow("  ⚠ profile.yaml not found — skipping patch (run `spec-graph sense` first)"));
    }
    // (Re)compose if needed
    const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    const needsCompose = profileChanged || !(await fileExists(graphPath));
    if (needsCompose) {
        const { composeCommand } = await Promise.resolve().then(() => __importStar(require("./compose")));
        await composeCommand(projectRoot, { changeType: change.type });
    }
    else {
        console.log(chalk_1.default.gray("  Graph already exists — skipping compose."));
    }
    // Prime machine state
    const { primeCommand } = await Promise.resolve().then(() => __importStar(require("./prime")));
    await primeCommand(projectRoot, { bootstrap: true });
    // Auto-create worktree for isolation (unless --no-worktree)
    if (options.worktree !== false) {
        try {
            const { WorktreeManager } = await Promise.resolve().then(() => __importStar(require("../engine/isolation/worktree")));
            const wm = new WorktreeManager({ projectRoot });
            const track = change.scope?.tracks?.[0] || change.type || "default";
            const existing = await wm.get(change.id);
            if (!existing) {
                const unit = await wm.create(change.id, track);
                console.log(chalk_1.default.green(`  ✓ Worktree created: ${unit.branch}`));
            }
        }
        catch {
            // No git repo or worktree creation failed — not fatal, just skip
            console.log(chalk_1.default.gray("  (worktree skipped — no git repo or creation failed)"));
        }
    }
    // Transition change to in_progress
    if (change.status === "proposed") {
        change.status = "in_progress";
        change.applied_at = new Date().toISOString();
        appendAudit(change, "apply", undefined, "profile patched, graph recomposed, state primed");
    }
    else {
        appendAudit(change, "apply", undefined, "re-applied (no status transition)");
    }
    await saveChange(changesDir, change);
    console.log(chalk_1.default.green(`\n✓ Change ${change.id} now in_progress\n`));
    console.log(chalk_1.default.bold("  Next: spec-graph next\n"));
}
// ============ complete ============
async function completeChangeCmd(projectRoot, changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change complete <id>"));
        process.exit(1);
    }
    const change = await loadChangeOrExit(changesDir, options.id);
    if (change.status !== "in_progress") {
        console.log(chalk_1.default.red(`✗ Change status is '${change.status}'. Only in_progress changes can be completed.`));
        process.exit(1);
    }
    // Soft gate: warn (don't block) if any blocking gate is currently failing.
    // Hard enforcement belongs to the integrate transition itself; this is a
    // sanity check so the user notices an unfinalized gate before archiving.
    try {
        const { runEnforce } = await Promise.resolve().then(() => __importStar(require("../engine/enforce/index")));
        const { readYaml } = await Promise.resolve().then(() => __importStar(require("../utils/yaml")));
        const graph = await readYaml(node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml"));
        if (graph) {
            const result = await runEnforce(projectRoot, graph);
            if (result.blocking_gates.length > 0) {
                console.log(chalk_1.default.yellow(`  ⚠ ${result.blocking_gates.length} blocking gate(s) still failing:`));
                for (const g of result.blocking_gates)
                    console.log(chalk_1.default.yellow(`    • ${g}`));
                console.log(chalk_1.default.gray("  Complete anyway? Re-run with --force to ignore.\n"));
                if (!options.force)
                    process.exit(1);
                console.log(chalk_1.default.gray("  --force set; completing anyway.\n"));
            }
        }
    }
    catch {
        // Graph or enforce unavailable — skip the soft check, don't block completion.
    }
    change.status = "completed";
    change.completed_at = new Date().toISOString();
    appendAudit(change, "complete", undefined, "change marked completed");
    await saveChange(changesDir, change);
    // Auto-enqueue in merge queue (unless --no-queue)
    if (options.queue !== false) {
        try {
            const { MergeQueueManager } = await Promise.resolve().then(() => __importStar(require("../engine/isolation/merge-queue")));
            const mq = new MergeQueueManager(projectRoot);
            const fileList = change.scope?.files?.include || [];
            const existing = (await mq.listItems()).find((i) => i.unit_id === change.id);
            if (!existing || existing.status === "failed") {
                await mq.enqueue(change.id, { fileList });
                console.log(chalk_1.default.green(`  ✓ Enqueued in merge queue`));
            }
        }
        catch {
            // Merge queue not available — not fatal
            console.log(chalk_1.default.gray("  (merge queue skipped)"));
        }
    }
    console.log(chalk_1.default.green(`\n✓ Change ${change.id} completed at ${change.completed_at}\n`));
    console.log(chalk_1.default.bold("  Next: spec-graph change archive " + change.id + "\n"));
}
// ============ discard ============
async function discardChangeCmd(changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change discard <id> [--reason <text>]"));
        process.exit(1);
    }
    const change = await loadChangeOrExit(changesDir, options.id);
    if (change.status !== "in_progress" && change.status !== "proposed") {
        console.log(chalk_1.default.red(`✗ Change status is '${change.status}'. Only proposed/in_progress changes can be discarded.`));
        process.exit(1);
    }
    change.status = "discarded";
    change.discarded_at = new Date().toISOString();
    change.discard_reason = options.reason || "No reason provided";
    appendAudit(change, "discard", undefined, `discarded: ${change.discard_reason}`);
    await saveChange(changesDir, change);
    console.log(chalk_1.default.gray(`\n✓ Change ${change.id} discarded at ${change.discarded_at}`));
    console.log(chalk_1.default.gray(`  Reason: ${change.discard_reason}\n`));
    console.log(chalk_1.default.bold("  Next: spec-graph change archive " + change.id + "\n"));
}
async function applyProfilePatch(profile, patch) {
    let changed = false;
    for (const [dim, newVal] of Object.entries(patch)) {
        const current = profile.facts[dim];
        if (!current) {
            profile.facts[dim] = {
                value: newVal,
                confidence: "high",
                source: "user",
                evidence: "change.profile_patch",
            };
            changed = true;
        }
        else if (current.value !== newVal) {
            current.value = newVal;
            current.source = "user";
            current.evidence = `change.patch (was ${current.value})`;
            current.confidence = "high";
            changed = true;
        }
    }
    return changed;
}
function appendAudit(change, action, author, message) {
    if (!change.audit_log)
        change.audit_log = [];
    change.audit_log.push({
        timestamp: new Date().toISOString(),
        action,
        author,
        message,
    });
}
// ============ change sync ============
async function syncChangeCmd(projectRoot, changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change sync <id>"));
        process.exit(1);
        return;
    }
    const change = await loadChangeOrExit(changesDir, options.id);
    if (!change.profile_patch || Object.keys(change.profile_patch).length === 0) {
        console.log(chalk_1.default.yellow("\n⚠ No profile_patch declared in change — nothing to sync.\n"));
        console.log(chalk_1.default.gray("  Edit the change JSON to add a `profile_patch` field, e.g.:"));
        console.log(chalk_1.default.gray('  "profile_patch": { "criticality": "compliance" }\n'));
        return;
    }
    console.log(chalk_1.default.bold(`\n🔍 Computing sync-impact for: ${change.title}\n`));
    const profilePath = node_path_1.default.join(projectRoot, ".spec-graph", "profile.yaml");
    const currentProfile = await (0, yaml_1.tryReadYaml)(profilePath);
    if (!currentProfile) {
        console.log(chalk_1.default.red("✗ profile.yaml not found. Run `spec-graph sense` first."));
        process.exit(1);
        return;
    }
    const currentGraphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    const currentGraph = await (0, yaml_1.tryReadYaml)(currentGraphPath);
    // Hypothetical profile: apply patch
    const hypotheticalProfile = JSON.parse(JSON.stringify(currentProfile));
    await applyProfilePatch(hypotheticalProfile, change.profile_patch);
    const { runCompose } = await Promise.resolve().then(() => __importStar(require("../engine/compose/index")));
    const result = await runCompose(projectRoot, hypotheticalProfile, change.type);
    const impact = computeSyncImpact(currentGraph, result.graph);
    change.sync_impact = {
        computed_at: new Date().toISOString(),
        artifacts_added: impact.artifacts_added,
        artifacts_removed: impact.artifacts_removed,
        checks_added: impact.checks_added,
        checks_removed: impact.checks_removed,
        gates_added: impact.gates_added,
        gates_removed: impact.gates_removed,
        consumer_ripple: impact.consumer_ripple,
    };
    appendAudit(change, "sync", undefined, `computed impact: +${impact.artifacts_added.length}/-${impact.artifacts_removed.length} artifacts`);
    await saveChange(changesDir, change);
    renderSyncImpact(impact);
    console.log(chalk_1.default.green(`\n✓ Sync impact recorded on change ${change.id}\n`));
}
function computeSyncImpact(currentGraph, newGraph) {
    const oldArtifacts = new Set((currentGraph?.artifacts || []).map((a) => a.id));
    const newArtifacts = new Set((newGraph.artifacts || []).map((a) => a.id));
    const oldChecks = new Set((currentGraph?.checks || []).map((c) => c.id));
    const newChecks = new Set((newGraph.checks || []).map((c) => c.id));
    const oldGates = new Set((currentGraph?.gates || []).map((g) => g.id));
    const newGates = new Set((newGraph.gates || []).map((g) => g.id));
    const artifacts_added = [...newArtifacts].filter((a) => !oldArtifacts.has(a));
    const artifacts_removed = [...oldArtifacts].filter((a) => !newArtifacts.has(a));
    const checks_added = [...newChecks].filter((c) => !oldChecks.has(c));
    const checks_removed = [...oldChecks].filter((c) => !newChecks.has(c));
    const gates_added = [...newGates].filter((g) => !oldGates.has(g));
    const gates_removed = [...oldGates].filter((g) => !newGates.has(g));
    const consumer_ripple = computeConsumerRipple(newGraph);
    return {
        artifacts_added,
        artifacts_removed,
        checks_added,
        checks_removed,
        gates_added,
        gates_removed,
        consumer_ripple,
    };
}
function computeConsumerRipple(graph) {
    const tracks = graph.tracks || [];
    const byContract = new Map();
    for (const track of tracks) {
        const consumes = track.consumes || [];
        if (consumes.length === 0)
            continue;
        for (const consumedContract of consumes) {
            const producerTrack = tracks.find((t) => (t.produces || []).includes(consumedContract));
            if (producerTrack) {
                if (!byContract.has(consumedContract))
                    byContract.set(consumedContract, new Set());
                byContract.get(consumedContract).add(track.id);
            }
        }
    }
    return [...byContract.entries()].map(([contract, consumers]) => ({
        contract,
        consumers: [...consumers],
    }));
}
function renderSyncImpact(impact) {
    console.log(chalk_1.default.bold("  📊 Sync Impact Diff\n"));
    const table = new cli_table3_1.default({
        head: ["Resource", "Added", "Removed"],
        style: { head: ["cyan"] },
    });
    table.push([
        "Artifacts",
        impact.artifacts_added.length > 0
            ? chalk_1.default.green(impact.artifacts_added.join("\n"))
            : "-",
        impact.artifacts_removed.length > 0
            ? chalk_1.default.red(impact.artifacts_removed.join("\n"))
            : "-",
    ]);
    table.push([
        "Checks",
        impact.checks_added.length > 0
            ? chalk_1.default.green(impact.checks_added.join("\n"))
            : "-",
        impact.checks_removed.length > 0
            ? chalk_1.default.red(impact.checks_removed.join("\n"))
            : "-",
    ]);
    table.push([
        "Gates",
        impact.gates_added.length > 0
            ? chalk_1.default.green(impact.gates_added.join("\n"))
            : "-",
        impact.gates_removed.length > 0
            ? chalk_1.default.red(impact.gates_removed.join("\n"))
            : "-",
    ]);
    console.log(table.toString());
    if (impact.consumer_ripple.length > 0) {
        console.log(chalk_1.default.bold("\n  🌊 Consumer Ripple (contract → consumers):\n"));
        for (const r of impact.consumer_ripple) {
            console.log(`    • ${r.contract} → ${r.consumers.join(", ")}`);
        }
    }
}
// ============ change archive ============
async function archiveChangeCmd(projectRoot, changesDir, options) {
    if (!options.id) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph change archive <id>"));
        process.exit(1);
        return;
    }
    const change = await loadChangeOrExit(changesDir, options.id);
    if (change.status !== "completed" && change.status !== "discarded") {
        console.log(chalk_1.default.red(`✗ Change status is ${change.status}. Only completed/discarded changes can be archived.`));
        console.log(chalk_1.default.gray("  Run `spec-graph change complete " +
            change.id +
            "` (or `discard`) first."));
        process.exit(1);
        return;
    }
    console.log(chalk_1.default.bold(`\n📦 Archiving change: ${change.title}\n`));
    const archivedDir = node_path_1.default.join(changesDir, "archived");
    await promises_1.default.mkdir(archivedDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotDir = node_path_1.default.join(projectRoot, ".spec-graph", "snapshots", `${change.id}-${timestamp}`);
    await promises_1.default.mkdir(snapshotDir, { recursive: true });
    const filesToSnapshot = [
        {
            src: node_path_1.default.join(projectRoot, ".spec-graph", "profile.yaml"),
            dst: "profile.yaml",
        },
        {
            src: node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml"),
            dst: "graph.yaml",
        },
        {
            src: node_path_1.default.join(projectRoot, ".spec-graph", "machine-state.yaml"),
            dst: "machine-state.yaml",
        },
    ];
    for (const { src, dst } of filesToSnapshot) {
        try {
            const content = await promises_1.default.readFile(src);
            await promises_1.default.writeFile(node_path_1.default.join(snapshotDir, dst), content);
        }
        catch (e) {
            if (e.code !== "ENOENT")
                throw e;
            console.log(chalk_1.default.gray(`  (skipped missing: ${dst})`));
        }
    }
    const manifest = {
        change_id: change.id,
        change_title: change.title,
        archived_at: new Date().toISOString(),
        final_status: change.status,
        snapshot_files: filesToSnapshot.map((f) => f.dst),
    };
    await promises_1.default.writeFile(node_path_1.default.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    change.archive = {
        archived_at: new Date().toISOString(),
        snapshot_dir: node_path_1.default.relative(projectRoot, snapshotDir),
        final_status: change.status,
    };
    appendAudit(change, "archive", undefined, `snapshotted to ${snapshotDir}`);
    // Write change to archived/ and remove from active changes/
    const archivedChangePath = node_path_1.default.join(archivedDir, `${change.id}.json`);
    await promises_1.default.writeFile(archivedChangePath, JSON.stringify(change, null, 2));
    const activeChangePath = node_path_1.default.join(changesDir, `${change.id}.json`);
    await promises_1.default.unlink(activeChangePath);
    // 归档 plan MD（如果存在 plan_path）
    if (change.plan_path) {
        const planAbsPath = node_path_1.default.join(projectRoot, change.plan_path);
        try {
            const planContent = await promises_1.default.readFile(planAbsPath);
            // 快照到 snapshot 目录
            await promises_1.default.writeFile(node_path_1.default.join(snapshotDir, node_path_1.default.basename(change.plan_path)), planContent);
            // 移到 archived 目录
            const archivedPlanPath = node_path_1.default.join(archivedDir, node_path_1.default.basename(change.plan_path));
            await promises_1.default.writeFile(archivedPlanPath, planContent);
            // 删除原文件
            await promises_1.default.unlink(planAbsPath);
            console.log(chalk_1.default.green(`  ✓ Plan MD moved to: ${node_path_1.default.relative(projectRoot, archivedPlanPath)}`));
        }
        catch (e) {
            if (e.code !== "ENOENT")
                throw e;
            console.log(chalk_1.default.gray("  (plan MD not found, skipped)"));
        }
    }
    // Append to changelog
    await appendToChangelog(projectRoot, change);
    console.log(chalk_1.default.green(`  ✓ Snapshotted to: ${node_path_1.default.relative(projectRoot, snapshotDir)}`));
    console.log(chalk_1.default.green(`  ✓ Moved to: ${node_path_1.default.relative(projectRoot, archivedChangePath)}`));
    console.log(chalk_1.default.green(`  ✓ Changelog updated`));
    console.log(chalk_1.default.bold(`\n  📦 Archived ${change.id}\n`));
}
async function appendToChangelog(projectRoot, change) {
    const changelogPath = node_path_1.default.join(projectRoot, ".spec-graph", "CHANGELOG.md");
    const entry = buildChangelogEntry(change);
    let existing = "";
    try {
        existing = await promises_1.default.readFile(changelogPath, "utf-8");
    }
    catch (e) {
        if (e.code !== "ENOENT")
            throw e;
        existing =
            "# spec-graph Changelog\n\nAll archived changes are recorded here.\n\n";
    }
    const updated = existing + entry;
    await promises_1.default.writeFile(changelogPath, updated);
}
function buildChangelogEntry(change) {
    const date = new Date(change.archive.archived_at)
        .toISOString()
        .split("T")[0];
    const lines = [];
    lines.push(`## ${date} — ${change.id} [${change.archive.final_status}]`);
    lines.push("");
    lines.push(`**Title**: ${change.title}`);
    lines.push(`**Type**: ${change.type}`);
    lines.push(`**Priority**: ${change.priority}`);
    lines.push("");
    lines.push(`${change.description}`);
    lines.push("");
    if (change.profile_patch && Object.keys(change.profile_patch).length > 0) {
        lines.push("**Profile patches applied**:");
        for (const [dim, val] of Object.entries(change.profile_patch)) {
            lines.push(`- \`${dim}\` → \`${val}\``);
        }
        lines.push("");
    }
    if (change.sync_impact) {
        const si = change.sync_impact;
        lines.push("**Sync impact**:");
        if (si.artifacts_added.length)
            lines.push(`- artifacts added: ${si.artifacts_added.join(", ")}`);
        if (si.artifacts_removed.length)
            lines.push(`- artifacts removed: ${si.artifacts_removed.join(", ")}`);
        if (si.checks_added.length)
            lines.push(`- checks added: ${si.checks_added.join(", ")}`);
        if (si.checks_removed.length)
            lines.push(`- checks removed: ${si.checks_removed.join(", ")}`);
        lines.push("");
    }
    lines.push(`**Snapshot**: \`${change.archive.snapshot_dir}\``);
    lines.push("");
    return lines.join("\n");
}
// ============ helpers ============
async function loadAllChanges(changesDir) {
    const changes = [];
    try {
        const entries = await promises_1.default.readdir(changesDir);
        for (const entry of entries) {
            if (entry.endsWith(".json")) {
                const content = await promises_1.default.readFile(node_path_1.default.join(changesDir, entry), "utf-8");
                changes.push(JSON.parse(content));
            }
        }
    }
    catch (e) {
        if (e.code !== "ENOENT")
            throw e;
    }
    return changes;
}
/**
 * Find the active (in_progress) change descriptor, if any.
 * Used by other commands (e.g. dispatch) to attach audit entries
 * for traceability — without requiring the user to pass --change-id.
 *
 * Returns null if no in_progress change exists, or if multiple exist
 * (ambiguous — caller should require explicit --change-id).
 */
async function findActiveChange(projectRoot) {
    const changesDir = node_path_1.default.join(projectRoot, ".spec-graph", "changes");
    const all = await loadAllChanges(changesDir);
    const inProgress = all.filter((c) => c.status === "in_progress");
    if (inProgress.length !== 1)
        return null;
    return inProgress[0];
}
/**
 * Append an audit entry to the active change descriptor (if exactly one exists).
 * Silently no-ops when no active change — dispatch still works without a change.
 */
async function appendToActiveChangeAudit(projectRoot, action, message, author) {
    const change = await findActiveChange(projectRoot);
    if (!change)
        return;
    if (!change.audit_log)
        change.audit_log = [];
    change.audit_log.push({
        timestamp: new Date().toISOString(),
        action,
        author,
        message,
    });
    const changesDir = node_path_1.default.join(projectRoot, ".spec-graph", "changes");
    await saveChange(changesDir, change);
}
async function loadChangeOrExit(changesDir, id) {
    const changePath = node_path_1.default.join(changesDir, `${id}.json`);
    try {
        const content = await promises_1.default.readFile(changePath, "utf-8");
        return JSON.parse(content);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            console.log(chalk_1.default.red(`✗ Change not found: ${id}`));
            process.exit(1);
            throw new Error("unreachable");
        }
        throw e;
    }
}
async function saveChange(changesDir, change) {
    const changePath = node_path_1.default.join(changesDir, `${change.id}.json`);
    await promises_1.default.writeFile(changePath, JSON.stringify(change, null, 2));
}
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=change.js.map