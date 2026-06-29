"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRoundTemplate = exports.collectPriorContributions = exports.initMeetingRuntime = exports.loadMeetingRuntime = void 0;
exports.meetingCommand = meetingCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/meeting/index");
Object.defineProperty(exports, "loadMeetingRuntime", { enumerable: true, get: function () { return index_1.loadMeetingRuntime; } });
Object.defineProperty(exports, "initMeetingRuntime", { enumerable: true, get: function () { return index_1.initMeetingRuntime; } });
Object.defineProperty(exports, "findRoundTemplate", { enumerable: true, get: function () { return index_1.findRoundTemplate; } });
Object.defineProperty(exports, "collectPriorContributions", { enumerable: true, get: function () { return index_1.collectPriorContributions; } });
async function meetingCommand(projectRoot, options) {
    const subcommand = options.subcommand || "list";
    switch (subcommand) {
        case "list":
            await listMeetings(projectRoot, options);
            break;
        case "show":
            await showMeeting(projectRoot, options);
            break;
        case "init":
            await initAdHocMeetingCmd(projectRoot, options);
            break;
        case "record":
            await recordMeetingContribution(projectRoot, options);
            break;
        case "advance":
            await advanceMeeting(projectRoot, options);
            break;
        case "complete":
            await completeMeetingCmd(projectRoot, options);
            break;
        case "abandon":
            await abandonMeetingCmd(projectRoot, options);
            break;
        default:
            console.log(chalk_1.default.red(`✗ Unknown subcommand: ${subcommand}`));
            console.log("Available: list, show, init, record, advance, complete, abandon");
            process.exit(1);
    }
}
async function loadGraph(projectRoot) {
    const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
    try {
        return await (0, yaml_1.readYaml)(graphPath);
    }
    catch {
        console.error(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
        process.exit(1);
    }
}
async function findMeetingDecl(projectRoot, graph, meetingId) {
    const resolved = await (0, index_1.resolveMeetingDecl)(projectRoot, graph, meetingId);
    if (!resolved) {
        console.error(chalk_1.default.red(`✗ Meeting '${meetingId}' not found.`));
        console.log(chalk_1.default.gray("Declared meetings in graph:"));
        for (const m of graph.meetings || []) {
            console.log(chalk_1.default.gray(`  - ${m.id}: ${m.description}`));
        }
        console.log(chalk_1.default.gray("Ad-hoc meetings (runtime files):"));
        try {
            const files = await promises_1.default.readdir((0, index_1.meetingsDir)(projectRoot));
            for (const f of files) {
                if (f.endsWith(".yaml")) {
                    console.log(chalk_1.default.gray(`  - ${f.replace(/\.yaml$/, "")}`));
                }
            }
        }
        catch {
            /* no meetings dir */
        }
        console.log(chalk_1.default.gray("To create an ad-hoc meeting: spec-graph meeting init <id> --purpose <text> --participants <list>"));
        process.exit(1);
    }
    return resolved.decl;
}
async function initAdHocMeetingCmd(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting init <id> --purpose <text> --participants <list>"));
        process.exit(1);
    }
    if (!options.purpose) {
        console.error(chalk_1.default.red("✗ --purpose required."));
        process.exit(1);
    }
    if (!options.participants) {
        console.error(chalk_1.default.red("✗ --participants required (comma-separated agent_ids or expert roles)."));
        process.exit(1);
    }
    const graph = await loadGraph(projectRoot);
    const existing = await (0, index_1.resolveMeetingDecl)(projectRoot, graph, options.id);
    if (existing) {
        console.error(chalk_1.default.red(`✗ Meeting '${options.id}' already exists (${existing.isAdHoc ? "ad-hoc" : "declared in graph"}).`));
        console.log(chalk_1.default.gray("To re-init, delete the runtime file first or use a different id."));
        process.exit(1);
    }
    // Parse participants: "pm:perspective1,architect:perspective2" or "pm,architect"
    const participantList = options.participants
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const participants = participantList.map((p) => {
        const colonIdx = p.indexOf(":");
        if (colonIdx > 0) {
            return {
                agent_id: p.slice(0, colonIdx),
                perspective: p.slice(colonIdx + 1),
            };
        }
        return { agent_id: p, perspective: "contributing to discussion" };
    });
    const minRounds = options.minRounds
        ? parseInt(options.minRounds, 10)
        : undefined;
    const maxRounds = options.maxRounds
        ? parseInt(options.maxRounds, 10)
        : undefined;
    const outputArtifacts = options.outputArtifacts
        ? options.outputArtifacts.split(",").map((s) => s.trim())
        : undefined;
    const runtime = await (0, index_1.initAdHocMeeting)(projectRoot, {
        meeting_id: options.id,
        purpose: options.purpose,
        description: options.description,
        participants,
        min_rounds: minRounds,
        max_rounds: maxRounds,
        output_artifacts: outputArtifacts,
    });
    console.log(chalk_1.default.green(`✓ Initialized ad-hoc meeting: ${options.id}`));
    console.log(chalk_1.default.gray(`   Purpose: ${options.purpose}`));
    console.log(chalk_1.default.gray(`   Participants: ${participants.map((p) => p.agent_id).join(", ")}`));
    console.log(chalk_1.default.gray(`   Rounds: ${runtime.current_round} (phase: ${runtime.current_phase}) — ${minRounds || 1}-${maxRounds || 5} dynamic`));
    console.log(chalk_1.default.gray(`   Runtime: ${(0, index_1.meetingRuntimePath)(projectRoot, options.id)}`));
    console.log(chalk_1.default.gray(`   Next: spec-graph meeting record ${options.id} --participant <agent> --type <statement|question|...> --content <text>`));
    if (options.json) {
        console.log(JSON.stringify(runtime, null, 2));
    }
}
async function listMeetings(projectRoot, options) {
    const graph = await loadGraph(projectRoot);
    const declaredMeetings = graph.meetings || [];
    if (declaredMeetings.length === 0) {
        console.log(chalk_1.default.yellow("\nNo meetings declared in graph."));
        return;
    }
    const table = new cli_table3_1.default({
        head: ["Meeting ID", "Status", "Round", "Description", "Triggered By"],
        style: { head: ["cyan"] },
        wordWrap: true,
    });
    for (const meeting of declaredMeetings) {
        const runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, meeting.id);
        const status = runtime?.status || "not started";
        const round = runtime
            ? `${runtime.current_round}/${meeting.max_rounds}`
            : "-";
        const triggeredBy = runtime?.triggered_by_action || "-";
        table.push([
            meeting.id,
            statusColor(status),
            round,
            meeting.description,
            triggeredBy,
        ]);
    }
    console.log(chalk_1.default.bold("\nMeetings\n"));
    console.log(table.toString());
    if (options.json) {
        const result = await Promise.all(declaredMeetings.map(async (m) => {
            const runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, m.id);
            return { ...m, runtime };
        }));
        console.log(JSON.stringify(result, null, 2));
    }
}
async function showMeeting(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting show <id>"));
        process.exit(1);
    }
    const graph = await loadGraph(projectRoot);
    const meeting = await findMeetingDecl(projectRoot, graph, options.id);
    const runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, options.id);
    if (options.json) {
        console.log(JSON.stringify({ meeting, runtime }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\nMeeting: ${meeting.id}\n`));
    console.log(`  Description:     ${meeting.description}`);
    console.log(`  Purpose:         ${meeting.purpose}`);
    console.log(`  Status:          ${runtime?.status || "not started"}`);
    if (runtime) {
        console.log(`  Current round:   ${runtime.current_round} (${runtime.current_phase})`);
        console.log(`  Started at:      ${runtime.started_at}`);
        if (runtime.completed_at) {
            console.log(`  Completed at:    ${runtime.completed_at}`);
        }
        console.log(`  Participants:    ${runtime.participants.join(", ") || "(none yet)"}`);
        console.log(`  Triggered by:    ${runtime.triggered_by_action} (stage: ${runtime.triggered_by_stage})`);
    }
    console.log(`  Rounds declared: ${meeting.min_rounds}-${meeting.max_rounds} (dynamic)`);
    console.log(`  Output artifacts: ${meeting.output_artifacts.join(", ")}`);
    console.log(`  On actions:       ${meeting.on_actions.join(", ")}`);
    if (runtime) {
        console.log(chalk_1.default.bold("\nCompleted Rounds\n"));
        for (const round of runtime.rounds) {
            console.log(chalk_1.default.cyan(`  Round ${round.round} (${round.phase}):`));
            for (const c of round.contributions) {
                const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
                console.log(`    [${c.type}] ${c.participant}${targets}: ${truncate(c.content, 100)}`);
            }
        }
        if (runtime.current_round_contributions.length > 0) {
            console.log(chalk_1.default.bold(`\nCurrent Round ${runtime.current_round} (${runtime.current_phase}) — in progress\n`));
            for (const c of runtime.current_round_contributions) {
                const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
                console.log(`    [${c.type}] ${c.participant}${targets}: ${truncate(c.content, 100)}`);
            }
        }
        if (runtime.convergence_summary) {
            console.log(chalk_1.default.bold("\nConvergence Summary\n"));
            console.log(`  ${runtime.convergence_summary}`);
        }
        if (runtime.open_questions.length > 0) {
            console.log(chalk_1.default.bold("\nOpen Questions\n"));
            for (const q of runtime.open_questions) {
                console.log(chalk_1.default.yellow(`  ? ${q}`));
            }
        }
    }
    console.log("");
}
async function recordMeetingContribution(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting record <id> --participant <agent> --type <type> --content <text>"));
        process.exit(1);
    }
    if (!options.participant) {
        console.error(chalk_1.default.red("✗ --participant required."));
        process.exit(1);
    }
    if (!options.type) {
        console.error(chalk_1.default.red("✗ --type required. Valid: statement, question, challenge, refinement, synthesis"));
        process.exit(1);
    }
    if (!options.content) {
        console.error(chalk_1.default.red("✗ --content required."));
        process.exit(1);
    }
    const validTypes = [
        "statement",
        "question",
        "challenge",
        "refinement",
        "synthesis",
    ];
    if (!validTypes.includes(options.type)) {
        console.error(chalk_1.default.red(`✗ Invalid --type: ${options.type}. Valid: ${validTypes.join(", ")}`));
        process.exit(1);
    }
    const graph = await loadGraph(projectRoot);
    const meeting = await findMeetingDecl(projectRoot, graph, options.id);
    let runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, options.id);
    if (!runtime) {
        // Auto-initialize if not exists (first contribution creates the meeting)
        const triggeredByAction = options.id; // fallback
        const triggeredByStage = meeting.on_actions[0] || "unknown";
        runtime = await (0, index_1.initMeetingRuntime)(projectRoot, meeting, triggeredByAction, triggeredByStage);
    }
    if (runtime.status !== "in_progress") {
        console.error(chalk_1.default.red(`✗ Meeting ${options.id} is not in_progress (status: ${runtime.status}). Cannot record.`));
        process.exit(1);
    }
    const targets = options.targets
        ? options.targets.split(",").map((s) => s.trim())
        : undefined;
    runtime = await (0, index_1.recordContribution)(projectRoot, meeting, runtime, {
        participant: options.participant,
        type: options.type,
        content: options.content,
        targets,
    });
    console.log(chalk_1.default.green(`✓ Recorded ${options.type} from ${options.participant} in round ${runtime.current_round} of meeting ${options.id}`));
    console.log(chalk_1.default.gray(`   Total contributions this round: ${runtime.current_round_contributions.length}`));
    if (options.json) {
        console.log(JSON.stringify(runtime, null, 2));
    }
}
async function advanceMeeting(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting advance <id>"));
        process.exit(1);
    }
    const graph = await loadGraph(projectRoot);
    const meeting = await findMeetingDecl(projectRoot, graph, options.id);
    let runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, options.id);
    if (!runtime) {
        console.error(chalk_1.default.red(`✗ Meeting ${options.id} has no runtime (not started). Run 'meeting record' first.`));
        process.exit(1);
    }
    try {
        runtime = await (0, index_1.advanceRound)(projectRoot, meeting, runtime);
    }
    catch (e) {
        console.error(chalk_1.default.red(`✗ ${e.message}`));
        process.exit(1);
    }
    console.log(chalk_1.default.green(`✓ Advanced meeting ${options.id} to round ${runtime.current_round} (${runtime.current_phase})`));
    console.log(chalk_1.default.gray(`   Completed rounds: ${runtime.rounds.length}/${meeting.max_rounds} max`));
    if (runtime.current_round >= meeting.max_rounds) {
        console.log(chalk_1.default.yellow(`   ⚠ Reached max_rounds (${meeting.max_rounds}). Must complete or synthesize now.`));
    }
    if (options.json) {
        console.log(JSON.stringify(runtime, null, 2));
    }
}
async function completeMeetingCmd(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting complete <id> --summary <text> [--open-questions <list>] [--output-artifacts <list>]"));
        process.exit(1);
    }
    if (!options.summary) {
        console.error(chalk_1.default.red("✗ --summary required (convergence summary / synthesis)."));
        process.exit(1);
    }
    const runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, options.id);
    if (!runtime) {
        console.error(chalk_1.default.red(`✗ Meeting ${options.id} has no runtime (not started).`));
        process.exit(1);
    }
    const openQuestions = options.openQuestions
        ? options.openQuestions.split("|").map((s) => s.trim())
        : [];
    const outputArtifacts = options.outputArtifacts
        ? options.outputArtifacts.split(",").map((s) => s.trim())
        : [];
    const transcript = await (0, index_1.completeMeeting)(projectRoot, runtime, {
        convergence_summary: options.summary,
        open_questions: openQuestions,
        output_artifacts: outputArtifacts,
    });
    console.log(chalk_1.default.green(`✓ Completed meeting ${options.id}`));
    console.log(chalk_1.default.gray(`   Rounds: ${transcript.rounds.length}`));
    console.log(chalk_1.default.gray(`   Participants: ${transcript.participants.join(", ")}`));
    console.log(chalk_1.default.gray(`   Open questions: ${transcript.open_questions.length}`));
    console.log(chalk_1.default.gray(`   Transcript: ${(0, index_1.meetingRuntimePath)(projectRoot, options.id)}`));
    if (options.json) {
        console.log(JSON.stringify(transcript, null, 2));
    }
}
async function abandonMeetingCmd(projectRoot, options) {
    if (!options.id) {
        console.error(chalk_1.default.red("✗ Meeting id required. Usage: spec-graph meeting abandon <id> --reason <text>"));
        process.exit(1);
    }
    if (!options.reason) {
        console.error(chalk_1.default.red("✗ --reason required."));
        process.exit(1);
    }
    const runtime = await (0, index_1.loadMeetingRuntime)(projectRoot, options.id);
    if (!runtime) {
        console.error(chalk_1.default.red(`✗ Meeting ${options.id} has no runtime (not started).`));
        process.exit(1);
    }
    await (0, index_1.abandonMeeting)(projectRoot, runtime, options.reason);
    console.log(chalk_1.default.yellow(`⚠ Abandoned meeting ${options.id}: ${options.reason}`));
    console.log(chalk_1.default.gray(`   Partial transcript retained at: ${(0, index_1.meetingRuntimePath)(projectRoot, options.id)}`));
    if (options.json) {
        console.log(JSON.stringify(runtime, null, 2));
    }
}
function statusColor(status) {
    switch (status) {
        case "in_progress":
            return chalk_1.default.yellow(status);
        case "completed":
            return chalk_1.default.green(status);
        case "abandoned":
            return chalk_1.default.red(status);
        default:
            return chalk_1.default.gray(status);
    }
}
function truncate(text, max) {
    if (text.length <= max)
        return text;
    return text.slice(0, max - 3) + "...";
}
//# sourceMappingURL=meeting.js.map