#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const init_1 = require("./commands/init");
const sense_1 = require("./commands/sense");
const compose_1 = require("./commands/compose");
const gate_1 = require("./commands/gate");
const show_1 = require("./commands/show");
const change_1 = require("./commands/change");
const contract_1 = require("./commands/contract");
const config_1 = require("./commands/config");
const checklist_1 = require("./commands/checklist");
const analysis_1 = require("./commands/analysis");
const constitution_1 = require("./commands/constitution");
const profile_1 = require("./commands/profile");
const trace_1 = require("./commands/trace");
const machine_1 = require("./commands/machine");
const next_1 = require("./commands/next");
const impact_1 = require("./commands/impact");
const migrate_1 = require("./commands/migrate");
const safety_net_1 = require("./commands/safety-net");
const visualize_1 = require("./commands/visualize");
const analyze_1 = require("./commands/analyze");
const check_1 = require("./commands/check");
const artifact_1 = require("./commands/artifact");
const dispatch_1 = require("./commands/dispatch");
const meeting_1 = require("./commands/meeting");
const run_1 = require("./commands/run");
const prime_1 = require("./commands/prime");
const permissions_1 = require("./commands/permissions");
const status_1 = require("./commands/status");
const doctor_1 = require("./commands/doctor");
const install_1 = require("./commands/install");
const worktree_1 = require("./commands/worktree");
const scope_1 = require("./commands/scope");
const merge_queue_1 = require("./commands/merge-queue");
const retro_1 = require("./commands/retro");
const rollback_1 = require("./commands/rollback");
const dashboard_1 = require("./commands/dashboard");
const distill_1 = require("./commands/distill");
const review_1 = require("./commands/review");
const hooks_1 = require("./engine/hooks");
const program = new commander_1.Command();
// Get project root from env or cwd
const projectRoot = process.env.SPEC_GRAPH_ROOT || process.cwd();
/**
 * Global hook wrapper: every command automatically fires pre/post hooks.
 * Hooks are configured in .spec-graph/hooks.yaml.
 * Hook command_name matches the CLI command name (e.g., 'dispatch', 'compose').
 */
async function runWithHooks(commandName, root, fn) {
    // Pre-hooks
    try {
        const preResults = await (0, hooks_1.executeHooks)(root, commandName, "pre");
        for (const r of preResults) {
            if (!r.success && r.hook.abort_on_failure) {
                console.error(`Pre-${commandName} hook failed: ${r.hook.command}`);
                process.exit(1);
            }
        }
    }
    catch {
        // Hooks not configured — continue silently
    }
    await fn();
    // Post-hooks
    try {
        await (0, hooks_1.executeHooks)(root, commandName, "post");
    }
    catch {
        // Hooks failed — command already succeeded, don't block
    }
}
program
    .name("spec-graph")
    .description("Domain-neutral spec-driven workflow orchestration kernel")
    .version("1.0.0")
    .option("-C, --cwd <path>", "Working directory", projectRoot)
    .option("-v, --verbose", "Enable verbose output");
// ============ init ============
program
    .command("init")
    .description("Initialize a new spec-graph project")
    .option("-f, --force", "Overwrite existing configuration")
    .option("--description <text>", "Project description")
    .option("--permission-level <level>", "Automation level: full-auto, semi-auto (default), manual", "semi-auto")
    .option("--sync-agent-config", "Also overwrite existing .claude/settings.json and .opencode.json")
    .option("--quick", "Full bootstrap: init + compose + prime --bootstrap")
    .option("--build <list>", "Build target(s): spa,api,lib,embedded,... (comma-separated)")
    .option("--profile-override <pairs>", "Dimension overrides: criticality=compliance,team=multi,...")
    .option("--llm-classify", "Use LLM classifier to fill dimensions not established by repo scan (requires ANTHROPIC_API_KEY)")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("init", root, async () => await (0, init_1.initCommand)(root, options));
});
// ============ install ============
program
    .command("install")
    .description("Install spec-graph skills into your IDE project (Claude Code, Cursor, OpenCode)")
    .option("--ide <ide>", "Target IDE: claude-code, cursor, opencode, github-copilot (auto-detected)")
    .option("--target <path>", "Target project directory (default: current directory)")
    .option("-f, --force", "Overwrite existing skills")
    .option("--quick", "Install + init --quick (full bootstrap)")
    .option("--description <text>", "Project description (for --quick)")
    .option("--permission-level <level>", "Automation level for --quick", "semi-auto")
    .option("--sync-agent-config", "Sync agent config for --quick")
    .option("--git-hooks", "Install pre-commit/post-commit git hooks")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("install", root, async () => await (0, install_1.installCommand)(root, options));
});
// ============ sense ============
program
    .command("sense")
    .description("Analyze project and generate profile")
    .option("-o, --output <file>", "Output file path")
    .option("--show-signals", "Show raw repo signals")
    .option("--build <list>", "Build target(s): spa,api,lib,embedded,... (comma-separated)")
    .option("--profile-override <pairs>", "Dimension overrides: criticality=compliance,team=multi,...")
    .option("--description <text>", "Project description (passed to LLM classifier when --llm-classify is set)")
    .option("--llm-classify", "Use LLM classifier to fill dimensions not established by repo scan (requires ANTHROPIC_API_KEY)")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("sense", root, async () => await (0, sense_1.senseCommand)(root, options));
});
// ============ compose ============
program
    .command("compose")
    .description("Compose workflow graph from profile and packs")
    .option("--change-type <type>", "Change type (feature/bugfix/refactor/...)", "feature")
    .option("-o, --output <file>", "Output file path")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("compose", root, async () => await (0, compose_1.composeCommand)(root, options));
});
// ============ gate ============
program
    .command("gate")
    .description("Evaluate gates and show blocking items")
    .option("--phase <name>", "Evaluate specific phase gate")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("gate", root, async () => await (0, gate_1.gateCommand)(root, options));
});
// ============ show ============
program
    .command("show")
    .description("Display current graph summary")
    .option("--format <type>", "Output format (table/json)", "table")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("show", root, async () => await (0, show_1.showCommand)(root, options));
});
// ============ status ============
program
    .command("status")
    .description("Show unified workflow dashboard: stage, artifacts, checks, gates, next action")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("status", root, async () => await (0, status_1.statusCommand)(root, options));
});
// ============ doctor ============
program
    .command("doctor")
    .description("Diagnose project health and configuration issues")
    .option("--json", "Output JSON")
    .option("--fix", "Auto-fix recoverable issues")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("doctor", root, async () => await (0, doctor_1.doctorCommand)(root, options));
});
// ============ change ============
program
    .command("change")
    .description("Manage changes (OpenSpec-style lifecycle: create → apply → complete → archive)")
    .argument("[subcommand]", "Subcommand: list, create, show, apply, complete, discard, sync, archive")
    .argument("[id]", "Change ID (for show/apply/complete/discard/sync/archive)")
    .option("--title <title>", "Change title")
    .option("--type <type>", "Change type: feature, bugfix, refactor, migration, perf")
    .option("--priority <priority>", "Priority: low, medium, high, critical")
    .option("--description <desc>", "Change description")
    .option("--reason <text>", "Discard reason (for discard)")
    .option("--force", "Ignore blocking gates (for complete)")
    .option("--plan-path <path>", "Path to plan MD written by AI agent (for create)")
    .option("--no-worktree", "Skip auto worktree creation (for apply)")
    .option("--no-queue", "Skip auto merge-queue enqueue (for complete)")
    .action(async (subcommand, id, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("change", root, async () => await (0, change_1.changeCommand)(root, { subcommand, id, ...options }));
});
// ============ contract ============
program
    .command("contract")
    .description("Manage contract registry (federated topology: publish/bind/reverify/drift)")
    .argument("[subcommand]", "Subcommand: list, publish, bind, unbind, reverify, show, drift, init-from-graph")
    .argument("[id]", "Contract ID (for publish/bind/unbind/reverify/show)")
    .option("--ver <v>", "Contract version (for publish/bind)")
    .option("--consumer <track>", "Consumer track ID (for bind/unbind/reverify)")
    .option("--producer <track>", "Producer track ID (for publish)")
    .option("--notes <text>", "Notes")
    .option("--json", "Output JSON")
    .action(async (subcommand, id, options) => {
    const root = program.opts().cwd || projectRoot;
    const passOpts = { subcommand, id, ...options };
    // --ver -> version for handler readability
    if (passOpts.ver) {
        passOpts.version = passOpts.ver;
        delete passOpts.ver;
    }
    await (0, contract_1.contractCommand)(root, passOpts);
});
// ============ constitution ============
program
    .command("constitution")
    .description("Manage project quality contract (constitution: thresholds, traces, semver policy)")
    .argument("[subcommand]", "Subcommand: init, show, validate, diff-packs, bump, diff")
    .option("-f, --force", "Overwrite existing constitution (for init)")
    .option("--json", "Output JSON (for show/validate/diff-packs/diff)")
    .option("--type <type>", "Bump type: major, minor, patch (for bump)")
    .action(async (subcommand, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("constitution", root, async () => await (0, constitution_1.constitutionCommand)(root, { subcommand, ...options }));
});
// ============ profile ============
program
    .command("profile")
    .description("Manage project profile: show / review (freeze) / override <key=value...>")
    .argument("[subcommand]", "Subcommand: show, review, override")
    .argument("[pairs]", "key=value pairs (for override), comma-separated")
    .action(async (subcommand, pairs, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("profile", root, async () => await (0, profile_1.profileCommand)(root, { subcommand, pairs, ...options }));
});
// ============ config ============
program
    .command("config")
    .description("Manage project-level config (context/rules/references injection)")
    .argument("[subcommand]", "Subcommand: show, init, set, clear", "show")
    .argument("[pairs]", 'key=value pairs for set (e.g. context.tech_stack="React 18")')
    .option("--json", "Output as JSON")
    .action(async (subcommand, pairs, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("config", root, async () => await (0, config_1.configCommand)(root, { subcommand, pairs, ...options }));
});
// ============ checklist ============
program
    .command("checklist")
    .description("Generate pre-implementation checklist for a story (mechanical + soft checks)")
    .argument("<story-id>", "Story artifact ID (e.g., plan/story/S-001)")
    .option("--json", "Output JSON")
    .action(async (storyId, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("checklist", root, async () => await (0, checklist_1.checklistCommand)(root, storyId, options));
});
// ============ analysis ============
program
    .command("analysis")
    .description("Manage phase analysis documents (persist analysis and link to tasks)")
    .option("--phase <phase>", "Phase name (propose/specify/design/implement/verify) or list/show")
    .option("--content <content>", "Detailed analysis content")
    .option("--tasks <task-ids>", "Comma-separated task IDs linked to this analysis")
    .option("--artifacts <artifact-ids>", "Comma-separated artifact IDs produced from this analysis")
    .option("--docs <doc-paths>", "Comma-separated document paths (AI agent writes, spec-graph tracks)")
    .option("--templates <template-names>", "Comma-separated template names used for documents")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("analysis", root, async () => await (0, analysis_1.analysisCommand)(root, options));
});
// ============ trace ============
program
    .command("trace")
    .description("Trace requirements to implementation (or `add` to create a trace entry)")
    .argument("[node-id-or-subcommand]", 'Node ID to trace from, or "add" subcommand')
    .option("--direction <direction>", "Trace direction: forward or backward", "backward")
    .option("--type <type>", "Filter by node type")
    .option("--from <artifact-id>", "Source artifact ID (for add)")
    .option("--to <artifact-id>", "Target artifact ID (for add)")
    .option("--via <relation>", "Edge relation (for add; alias for --relation)")
    .option("--relation <name>", "Edge relation name (for add, default: satisfies)")
    .option("--json", "Output JSON (for add)")
    .action(async (arg, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("trace", root, async () => await (0, trace_1.traceCommand)(root, arg, options));
});
// ============ impact ============
program
    .command("impact")
    .description("Analyze the impact of changes to an artifact (blast radius)")
    .option("--artifact <id>", "Artifact ID to analyze impact for (required)")
    .option("--mark-stale", "Mark affected artifacts as stale")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("impact", root, async () => await (0, impact_1.impactCommand)(root, options));
});
// ============ migrate ============
program
    .command("migrate")
    .description("Generate migration plan for existing projects")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("migrate", root, async () => await (0, migrate_1.migrateCommand)(root, options));
});
// ============ safety-net ============
program
    .command("safety-net")
    .description("Capture or compare baseline snapshot for refactoring safety")
    .option("--compare", "Compare against existing baseline snapshot")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("safetyNet", root, async () => await (0, safety_net_1.safetyNetCommand)(root, options));
});
// ============ visualize ============
program
    .command("visualize")
    .description("Generate Graphviz DOT or JSON summary of the workflow graph")
    .option("--format <format>", "Output format: dot (default) or json", "dot")
    .option("--output <path>", "Write to file instead of stdout")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("visualize", root, async () => await (0, visualize_1.visualizeCommand)(root, options));
});
// ============ analyze ============
program
    .command("analyze")
    .description("Cross-artifact consistency analysis (duplication, coverage gaps, terminology drift)")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("analyze", root, async () => await (0, analyze_1.analyzeCommand)(root, options));
});
// ============ next ============
program
    .command("next")
    .description("Show the next required workflow step")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("next", root, async () => await (0, next_1.nextCommand)(root, options));
});
// ============ check ============
program
    .command("check")
    .description("Run checks from the composed graph")
    .option("--id <id>", "Run a specific check")
    .option("--layer <layer>", "Run checks for a layer")
    .option("--dry-run", "Do not execute commands; mark selected checks as passed")
    .option("--timeout <ms>", "Timeout per check in milliseconds")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("check", root, async () => await (0, check_1.checkCommand)(root, options));
});
// ============ artifact ============
program
    .command("artifact")
    .description("List, inspect, and update graph artifacts")
    .argument("[subcommand]", "Subcommand: list, show, update, complete, register", "list")
    .argument("[id]", "Artifact ID")
    .option("--status <status>", "Artifact status for update/register", "completed")
    .option("--producer <producer>", "Producer that created the artifact")
    .option("--json", "Output JSON")
    .action(async (subcommand, id, options) => {
    const root = program.opts().cwd || projectRoot;
    await (0, artifact_1.artifactCommand)(root, subcommand, id, options);
});
// ============ dispatch ============
program
    .command("dispatch")
    .description("Generate an agent dispatch manifest for the next workflow action")
    .option("--all", "Include all currently suggested actions")
    .option("-o, --output <file>", "Write manifest YAML to a file")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("dispatch", root, async () => await (0, dispatch_1.dispatchCommand)(root, options));
});
// ============ meeting ============
program
    .command("meeting")
    .description("Manage meeting runtime state (init ad-hoc, record contributions, advance rounds, complete)")
    .argument("[subcommand]", "Subcommand: list, show, init, record, advance, complete, abandon", "list")
    .argument("[id]", "Meeting ID")
    .option("--purpose <text>", "Meeting purpose (for init)")
    .option("--description <text>", "Meeting description (for init)")
    .option("--participants <list>", "Comma-separated participants: agent_id:perspective (for init)")
    .option("--min-rounds <n>", "Min rounds (for init, default 1)")
    .option("--max-rounds <n>", "Max rounds (for init, default 5)")
    .option("--participant <agent>", "Agent ID making the contribution (for record)")
    .option("--type <type>", "Contribution type: statement, question, challenge, refinement, synthesis (for record)")
    .option("--content <text>", "Contribution content (for record)")
    .option("--targets <list>", "Comma-separated target participants (for record)")
    .option("--summary <text>", "Convergence summary / synthesis (for complete)")
    .option("--open-questions <list>", "Pipe-separated open questions (for complete)")
    .option("--output-artifacts <list>", "Comma-separated artifact IDs produced (for complete)")
    .option("--reason <text>", "Abandon reason (for abandon)")
    .option("--json", "Output JSON")
    .action(async (subcommand, id, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("meeting", root, async () => await (0, meeting_1.meetingCommand)(root, { subcommand, id, ...options }));
});
// ============ run ============
program
    .command("run")
    .description("Run deterministic workflow actions until blocked or complete")
    .option("--max-steps <n>", "Maximum number of actions to execute", "10")
    .option("--timeout <ms>", "Timeout per check in milliseconds", "120000")
    .option("--dry-run", "Dry-run checks instead of executing commands")
    .option("--include-periodic", "Include checks with tier='periodic' (skipped by default)")
    .option("--base-ref <ref>", "Git base ref to diff against for touchfile matching (default: HEAD)", "HEAD")
    .option("--no-diff-select", "Disable touchfile-based filtering — run all checks regardless of changed files")
    .option("--retries <n>", "Max retry attempts for failed checks (default: 0)", "0")
    .option("--backoff <strategy>", "Backoff: fixed, linear, exponential", "fixed")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("run", root, async () => await (0, run_1.runCommand)(root, options));
});
// ============ prime ============
program
    .command("prime")
    .description("Seed machine state with graph-declared artifacts and checks")
    .option("--bootstrap", "Auto-pass placeholder checks marked <check-name>")
    .option("--json", "Output JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("prime", root, async () => await (0, prime_1.primeCommand)(root, options));
});
// ============ machine ============
program
    .command("machine")
    .description("Run and inspect the workflow state machine")
    .argument("[subcommand]", "Subcommand: init, status, transition, history, artifacts, update, restart-stage", "status")
    .option("--stage <stage>", "Initial stage for init")
    .option("--from <stage>", "Transition source stage")
    .option("--to <stage>", "Transition target stage")
    .option("--action <action>", "Action or actor that triggered the transition")
    .option("--artifact <id>", "Artifact ID to update")
    .option("--check <id>", "Check ID to update")
    .option("--status <status>", "Artifact/check status for update", "completed")
    .option("--restart-stage", "Restart current stage (reset incomplete items)")
    .action(async (subcommand, options) => {
    const root = program.opts().cwd || projectRoot;
    await (0, machine_1.machineCommand)(root, subcommand, options);
});
// ============ permissions ============
program
    .command("permissions")
    .description("View and manage automation permissions for AI agents")
    .argument("[subcommand]", "Subcommand: show, set, list-agents, sync", "show")
    .option("--level <level>", "Set permission level: full-auto, semi-auto, manual")
    .option("--force", "Overwrite existing agent config files")
    .option("--json", "Output JSON")
    .action(async (subcommand, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("permissions", root, async () => await (0, permissions_1.permissionsCommand)(root, { subcommand, ...options }));
});
// ============ worktree ============
program
    .command("worktree")
    .description("Manage git worktree isolation for parallel track development")
    .argument("[subcommand]", "Subcommand: create, list, remove, merge, status, self-verify, submit, accept, reject", "list")
    .argument("[unitId]", "Unit ID (for create/remove/merge/status/transitions)")
    .option("--track <track>", "Track ID (for create)")
    .option("--to <branch>", "Target branch (for merge)", "main")
    .option("--branch <name>", "Override branch name (for create)")
    .option("--base-branch <name>", "Base branch to fork from (for create)")
    .option("--dry-run", "Conflict-check only, do not actually merge")
    .option("--purge", "Delete unit record entirely (for remove)")
    .option("--reason <text>", "Rejection reason (for reject)")
    .option("--reviewed-by <name>", "Reviewer name (for accept/reject)")
    .option("--json", "Output JSON")
    .action(async (subcommand, unitId, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("worktree", root, async () => await (0, worktree_1.worktreeCommand)(root, { subcommand, unitId, ...options }));
});
// ============ scope ============
program
    .command("scope")
    .description("Manage scope locks (boundary validation for isolation units)")
    .argument("[subcommand]", "Subcommand: lock, check, show, list, unlock, overlap", "show")
    .argument("[unitId]", "Unit ID (for lock/check/show/unlock)")
    .option("--allowed <globs>", "Comma-separated allowed path globs")
    .option("--protected <globs>", "Comma-separated protected (read-only) path globs")
    .option("--forbidden <globs>", "Comma-separated forbidden path globs")
    .option("--mode <mode>", "Enforcement mode: strict (default), warn", "strict")
    .option("--files <list>", "Comma-separated file list (for check)")
    .option("--json", "Output JSON")
    .action(async (subcommand, unitId, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("scope", root, async () => await (0, scope_1.scopeCommand)(root, { subcommand, unitId, ...options }));
});
// ============ merge-queue ============
program
    .command("merge-queue")
    .description("Manage merge queue for serialized integration of isolation units")
    .argument("[subcommand]", "Subcommand: enqueue, dequeue, list, overlaps, mark-merged, mark-failed, remove", "list")
    .argument("[unitId]", "Unit ID (for enqueue/mark-merged/mark-failed/remove)")
    .option("--files <list>", "Comma-separated file list (for enqueue)")
    .option("--target <branch>", "Target branch (default: main)", "main")
    .option("--reason <text>", "Failure reason (for mark-failed)")
    .option("--json", "Output JSON")
    .action(async (subcommand, unitId, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("mergeQueue", root, async () => await (0, merge_queue_1.mergeQueueCommand)(root, { subcommand, unitId, ...options }));
});
// ============ retro ============
program
    .command("retro")
    .description("Generate retrospective document for a completed change")
    .argument("<change-id>", "Change ID to generate retrospective for")
    .action(async (changeId) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("retro", root, async () => await (0, retro_1.retroCommand)(root, { changeId }));
});
// ============ rollback ============
program
    .command("rollback")
    .description("Safely rollback a change to its pre-change state")
    .argument("<change-id>", "Change ID to rollback")
    .option("--dry-run", "Show what would be restored without actually restoring")
    .action(async (changeId, options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("rollback", root, async () => await (0, rollback_1.rollbackCommand)(root, { changeId, ...options }));
});
// ============ dashboard ============
program
    .command("dashboard")
    .description("Show rich workflow dashboard with progress, artifacts, gates, and traces")
    .option("--json", "Output as JSON")
    .option("--html", "Generate HTML dashboard file")
    .option("-o, --output <file>", "Output file for HTML dashboard")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("dashboard", root, async () => await (0, dashboard_1.dashboardCommand)(root, options));
});
// ============ distill ============
program
    .command("distill")
    .description("Compress an artifact document into a minimal summary for context injection")
    .requiredOption("--artifact <id>", "Artifact ID to distill")
    .option("--save", "Save distilled output to .spec-graph/distilled/")
    .option("--max-length <chars>", "Maximum output length in characters (default: 2000)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("distill", root, async () => await (0, distill_1.distillCommand)(root, options));
});
// ============ review ============
program
    .command("review")
    .description("Generate multi-model review prompts for an artifact (Claude, Codex, Gemini, etc.)")
    .requiredOption("--artifact <id>", "Artifact ID to review")
    .option("--models <list>", "Comma-separated model names (default: claude,codex)")
    .option("--focus <areas>", "Comma-separated focus areas for review")
    .option("--full", "Include full artifact content (default: distilled)")
    .option("--save", "Save review prompts to .spec-graph/reviews/")
    .option("--json", "Output as JSON")
    .action(async (options) => {
    const root = program.opts().cwd || projectRoot;
    await runWithHooks("review", root, async () => await (0, review_1.reviewCommand)(root, options));
});
// Parse and run
program.parseAsync(process.argv).catch((e) => {
    console.error(chalk_1.default.red("Error:"), e.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map