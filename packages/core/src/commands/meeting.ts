import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Graph, MeetingDecl, ContributionType } from "../types/index";
import { readYaml } from "../utils/yaml";
import {
  loadMeetingRuntime,
  initMeetingRuntime,
  initAdHocMeeting,
  resolveMeetingDecl,
  recordContribution,
  advanceRound,
  completeMeeting,
  abandonMeeting,
  findRoundTemplate,
  collectPriorContributions,
  meetingRuntimePath,
  meetingsDir,
} from "../engine/meeting/index";

export interface MeetingOptions {
  subcommand?: string;
  id?: string;
  participant?: string;
  type?: string;
  content?: string;
  targets?: string;
  summary?: string;
  openQuestions?: string;
  outputArtifacts?: string;
  reason?: string;
  purpose?: string;
  description?: string;
  participants?: string;
  minRounds?: string;
  maxRounds?: string;
  json?: boolean;
}

export async function meetingCommand(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
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
      console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
      console.log(
        "Available: list, show, init, record, advance, complete, abandon",
      );
      process.exit(1);
  }
}

async function loadGraph(projectRoot: string): Promise<Graph> {
  const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
  try {
    return await readYaml<Graph>(graphPath);
  } catch {
    console.error(
      chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
    );
    process.exit(1);
  }
}

async function findMeetingDecl(
  projectRoot: string,
  graph: Graph,
  meetingId: string,
): Promise<MeetingDecl> {
  const resolved = await resolveMeetingDecl(projectRoot, graph, meetingId);
  if (!resolved) {
    console.error(chalk.red(`✗ Meeting '${meetingId}' not found.`));
    console.log(chalk.gray("Declared meetings in graph:"));
    for (const m of graph.meetings || []) {
      console.log(chalk.gray(`  - ${m.id}: ${m.description}`));
    }
    console.log(chalk.gray("Ad-hoc meetings (runtime files):"));
    try {
      const files = await fs.readdir(meetingsDir(projectRoot));
      for (const f of files) {
        if (f.endsWith(".yaml")) {
          console.log(chalk.gray(`  - ${f.replace(/\.yaml$/, "")}`));
        }
      }
    } catch {
      /* no meetings dir */
    }
    console.log(
      chalk.gray(
        "To create an ad-hoc meeting: spec-graph meeting init <id> --purpose <text> --participants <list>",
      ),
    );
    process.exit(1);
  }
  return resolved.decl;
}

async function initAdHocMeetingCmd(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red(
        "✗ Meeting id required. Usage: spec-graph meeting init <id> --purpose <text> --participants <list>",
      ),
    );
    process.exit(1);
  }
  if (!options.purpose) {
    console.error(chalk.red("✗ --purpose required."));
    process.exit(1);
  }
  if (!options.participants) {
    console.error(
      chalk.red(
        "✗ --participants required (comma-separated agent_ids or expert roles).",
      ),
    );
    process.exit(1);
  }

  const graph = await loadGraph(projectRoot);
  const existing = await resolveMeetingDecl(projectRoot, graph, options.id);
  if (existing) {
    console.error(
      chalk.red(
        `✗ Meeting '${options.id}' already exists (${existing.isAdHoc ? "ad-hoc" : "declared in graph"}).`,
      ),
    );
    console.log(
      chalk.gray(
        "To re-init, delete the runtime file first or use a different id.",
      ),
    );
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

  const runtime = await initAdHocMeeting(projectRoot, {
    meeting_id: options.id,
    purpose: options.purpose,
    description: options.description,
    participants,
    min_rounds: minRounds,
    max_rounds: maxRounds,
    output_artifacts: outputArtifacts,
  });

  console.log(chalk.green(`✓ Initialized ad-hoc meeting: ${options.id}`));
  console.log(chalk.gray(`   Purpose: ${options.purpose}`));
  console.log(
    chalk.gray(
      `   Participants: ${participants.map((p) => p.agent_id).join(", ")}`,
    ),
  );
  console.log(
    chalk.gray(
      `   Rounds: ${runtime.current_round} (phase: ${runtime.current_phase}) — ${minRounds || 1}-${maxRounds || 5} dynamic`,
    ),
  );
  console.log(
    chalk.gray(`   Runtime: ${meetingRuntimePath(projectRoot, options.id)}`),
  );
  console.log(
    chalk.gray(
      `   Next: spec-graph meeting record ${options.id} --participant <agent> --type <statement|question|...> --content <text>`,
    ),
  );

  if (options.json) {
    console.log(JSON.stringify(runtime, null, 2));
  }
}

async function listMeetings(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  const graph = await loadGraph(projectRoot);
  const declaredMeetings = graph.meetings || [];

  if (declaredMeetings.length === 0) {
    console.log(chalk.yellow("\nNo meetings declared in graph."));
    return;
  }

  const table = new Table({
    head: ["Meeting ID", "Status", "Round", "Description", "Triggered By"],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  for (const meeting of declaredMeetings) {
    const runtime = await loadMeetingRuntime(projectRoot, meeting.id);
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

  console.log(chalk.bold("\nMeetings\n"));
  console.log(table.toString());

  if (options.json) {
    const result = await Promise.all(
      declaredMeetings.map(async (m) => {
        const runtime = await loadMeetingRuntime(projectRoot, m.id);
        return { ...m, runtime };
      }),
    );
    console.log(JSON.stringify(result, null, 2));
  }
}

async function showMeeting(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red("✗ Meeting id required. Usage: spec-graph meeting show <id>"),
    );
    process.exit(1);
  }

  const graph = await loadGraph(projectRoot);
  const meeting = await findMeetingDecl(projectRoot, graph, options.id);
  const runtime = await loadMeetingRuntime(projectRoot, options.id);

  if (options.json) {
    console.log(JSON.stringify({ meeting, runtime }, null, 2));
    return;
  }

  console.log(chalk.bold(`\nMeeting: ${meeting.id}\n`));
  console.log(`  Description:     ${meeting.description}`);
  console.log(`  Purpose:         ${meeting.purpose}`);
  console.log(`  Status:          ${runtime?.status || "not started"}`);
  if (runtime) {
    console.log(
      `  Current round:   ${runtime.current_round} (${runtime.current_phase})`,
    );
    console.log(`  Started at:      ${runtime.started_at}`);
    if (runtime.completed_at) {
      console.log(`  Completed at:    ${runtime.completed_at}`);
    }
    console.log(
      `  Participants:    ${runtime.participants.join(", ") || "(none yet)"}`,
    );
    console.log(
      `  Triggered by:    ${runtime.triggered_by_action} (stage: ${runtime.triggered_by_stage})`,
    );
  }
  console.log(
    `  Rounds declared: ${meeting.min_rounds}-${meeting.max_rounds} (dynamic)`,
  );
  console.log(`  Output artifacts: ${meeting.output_artifacts.join(", ")}`);
  console.log(`  On actions:       ${meeting.on_actions.join(", ")}`);

  if (runtime) {
    console.log(chalk.bold("\nCompleted Rounds\n"));
    for (const round of runtime.rounds) {
      console.log(chalk.cyan(`  Round ${round.round} (${round.phase}):`));
      for (const c of round.contributions) {
        const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
        console.log(
          `    [${c.type}] ${c.participant}${targets}: ${truncate(c.content, 100)}`,
        );
      }
    }

    if (runtime.current_round_contributions.length > 0) {
      console.log(
        chalk.bold(
          `\nCurrent Round ${runtime.current_round} (${runtime.current_phase}) — in progress\n`,
        ),
      );
      for (const c of runtime.current_round_contributions) {
        const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
        console.log(
          `    [${c.type}] ${c.participant}${targets}: ${truncate(c.content, 100)}`,
        );
      }
    }

    if (runtime.convergence_summary) {
      console.log(chalk.bold("\nConvergence Summary\n"));
      console.log(`  ${runtime.convergence_summary}`);
    }
    if (runtime.open_questions.length > 0) {
      console.log(chalk.bold("\nOpen Questions\n"));
      for (const q of runtime.open_questions) {
        console.log(chalk.yellow(`  ? ${q}`));
      }
    }
  }
  console.log("");
}

async function recordMeetingContribution(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red(
        "✗ Meeting id required. Usage: spec-graph meeting record <id> --participant <agent> --type <type> --content <text>",
      ),
    );
    process.exit(1);
  }
  if (!options.participant) {
    console.error(chalk.red("✗ --participant required."));
    process.exit(1);
  }
  if (!options.type) {
    console.error(
      chalk.red(
        "✗ --type required. Valid: statement, question, challenge, refinement, synthesis",
      ),
    );
    process.exit(1);
  }
  if (!options.content) {
    console.error(chalk.red("✗ --content required."));
    process.exit(1);
  }

  const validTypes: ContributionType[] = [
    "statement",
    "question",
    "challenge",
    "refinement",
    "synthesis",
  ];
  if (!validTypes.includes(options.type as ContributionType)) {
    console.error(
      chalk.red(
        `✗ Invalid --type: ${options.type}. Valid: ${validTypes.join(", ")}`,
      ),
    );
    process.exit(1);
  }

  const graph = await loadGraph(projectRoot);
  const meeting = await findMeetingDecl(projectRoot, graph, options.id);

  let runtime = await loadMeetingRuntime(projectRoot, options.id);
  if (!runtime) {
    // Auto-initialize if not exists (first contribution creates the meeting)
    const triggeredByAction = options.id; // fallback
    const triggeredByStage = meeting.on_actions[0] || "unknown";
    runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      triggeredByAction,
      triggeredByStage,
    );
  }

  if (runtime.status !== "in_progress") {
    console.error(
      chalk.red(
        `✗ Meeting ${options.id} is not in_progress (status: ${runtime.status}). Cannot record.`,
      ),
    );
    process.exit(1);
  }

  const targets = options.targets
    ? options.targets.split(",").map((s) => s.trim())
    : undefined;

  runtime = await recordContribution(projectRoot, meeting, runtime, {
    participant: options.participant,
    type: options.type as ContributionType,
    content: options.content,
    targets,
  });

  console.log(
    chalk.green(
      `✓ Recorded ${options.type} from ${options.participant} in round ${runtime.current_round} of meeting ${options.id}`,
    ),
  );
  console.log(
    chalk.gray(
      `   Total contributions this round: ${runtime.current_round_contributions.length}`,
    ),
  );

  if (options.json) {
    console.log(JSON.stringify(runtime, null, 2));
  }
}

async function advanceMeeting(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red(
        "✗ Meeting id required. Usage: spec-graph meeting advance <id>",
      ),
    );
    process.exit(1);
  }

  const graph = await loadGraph(projectRoot);
  const meeting = await findMeetingDecl(projectRoot, graph, options.id);

  let runtime = await loadMeetingRuntime(projectRoot, options.id);
  if (!runtime) {
    console.error(
      chalk.red(
        `✗ Meeting ${options.id} has no runtime (not started). Run 'meeting record' first.`,
      ),
    );
    process.exit(1);
  }

  try {
    runtime = await advanceRound(projectRoot, meeting, runtime);
  } catch (e: any) {
    console.error(chalk.red(`✗ ${e.message}`));
    process.exit(1);
  }

  console.log(
    chalk.green(
      `✓ Advanced meeting ${options.id} to round ${runtime.current_round} (${runtime.current_phase})`,
    ),
  );
  console.log(
    chalk.gray(
      `   Completed rounds: ${runtime.rounds.length}/${meeting.max_rounds} max`,
    ),
  );

  if (runtime.current_round >= meeting.max_rounds) {
    console.log(
      chalk.yellow(
        `   ⚠ Reached max_rounds (${meeting.max_rounds}). Must complete or synthesize now.`,
      ),
    );
  }

  if (options.json) {
    console.log(JSON.stringify(runtime, null, 2));
  }
}

async function completeMeetingCmd(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red(
        "✗ Meeting id required. Usage: spec-graph meeting complete <id> --summary <text> [--open-questions <list>] [--output-artifacts <list>]",
      ),
    );
    process.exit(1);
  }
  if (!options.summary) {
    console.error(
      chalk.red("✗ --summary required (convergence summary / synthesis)."),
    );
    process.exit(1);
  }

  const runtime = await loadMeetingRuntime(projectRoot, options.id);
  if (!runtime) {
    console.error(
      chalk.red(`✗ Meeting ${options.id} has no runtime (not started).`),
    );
    process.exit(1);
  }

  const openQuestions = options.openQuestions
    ? options.openQuestions.split("|").map((s) => s.trim())
    : [];
  const outputArtifacts = options.outputArtifacts
    ? options.outputArtifacts.split(",").map((s) => s.trim())
    : [];

  const transcript = await completeMeeting(projectRoot, runtime, {
    convergence_summary: options.summary,
    open_questions: openQuestions,
    output_artifacts: outputArtifacts,
  });

  console.log(chalk.green(`✓ Completed meeting ${options.id}`));
  console.log(chalk.gray(`   Rounds: ${transcript.rounds.length}`));
  console.log(
    chalk.gray(`   Participants: ${transcript.participants.join(", ")}`),
  );
  console.log(
    chalk.gray(`   Open questions: ${transcript.open_questions.length}`),
  );
  console.log(
    chalk.gray(`   Transcript: ${meetingRuntimePath(projectRoot, options.id)}`),
  );

  if (options.json) {
    console.log(JSON.stringify(transcript, null, 2));
  }
}

async function abandonMeetingCmd(
  projectRoot: string,
  options: MeetingOptions,
): Promise<void> {
  if (!options.id) {
    console.error(
      chalk.red(
        "✗ Meeting id required. Usage: spec-graph meeting abandon <id> --reason <text>",
      ),
    );
    process.exit(1);
  }
  if (!options.reason) {
    console.error(chalk.red("✗ --reason required."));
    process.exit(1);
  }

  const runtime = await loadMeetingRuntime(projectRoot, options.id);
  if (!runtime) {
    console.error(
      chalk.red(`✗ Meeting ${options.id} has no runtime (not started).`),
    );
    process.exit(1);
  }

  await abandonMeeting(projectRoot, runtime, options.reason);

  console.log(
    chalk.yellow(`⚠ Abandoned meeting ${options.id}: ${options.reason}`),
  );
  console.log(
    chalk.gray(
      `   Partial transcript retained at: ${meetingRuntimePath(projectRoot, options.id)}`,
    ),
  );

  if (options.json) {
    console.log(JSON.stringify(runtime, null, 2));
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
      return chalk.yellow(status);
    case "completed":
      return chalk.green(status);
    case "abandoned":
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

// Re-export for other modules
export {
  loadMeetingRuntime,
  initMeetingRuntime,
  collectPriorContributions,
  findRoundTemplate,
};
