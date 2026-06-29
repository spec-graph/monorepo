/**
 * Meeting runtime state I/O.
 *
 * Persists in-progress meetings to .spec-graph/meetings/<meeting_id>.yaml
 * so the coordinator can resume after restart, and so the transcript is
 * available for traceability once the meeting completes.
 */

import path from "node:path";
import fs from "node:fs/promises";
import {
  MeetingRuntime,
  MeetingContribution,
  MeetingDecl,
  MeetingRound,
  MeetingTranscript,
  ContributionType,
} from "../../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../../utils/yaml";

export interface MeetingRuntimeFile {
  projectRoot: string;
  meetingsDir: string;
}

export function meetingRuntimePath(
  projectRoot: string,
  meetingId: string,
): string {
  return path.join(projectRoot, ".spec-graph", "meetings", `${meetingId}.yaml`);
}

export function meetingsDir(projectRoot: string): string {
  return path.join(projectRoot, ".spec-graph", "meetings");
}

/**
 * Load a meeting runtime state. Returns null if file does not exist.
 */
export async function loadMeetingRuntime(
  projectRoot: string,
  meetingId: string,
): Promise<MeetingRuntime | null> {
  const filePath = meetingRuntimePath(projectRoot, meetingId);
  const data = await tryReadYaml<MeetingRuntime>(filePath);
  return data || null;
}

/**
 * Save a meeting runtime state to disk.
 */
export async function saveMeetingRuntime(
  projectRoot: string,
  runtime: MeetingRuntime,
): Promise<void> {
  const filePath = meetingRuntimePath(projectRoot, runtime.meeting_id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeYaml(filePath, runtime);
}

/**
 * Initialize a new meeting runtime in the in_progress state.
 * Called when dispatch detects a meeting that has no runtime file yet.
 */
export async function initMeetingRuntime(
  projectRoot: string,
  meeting: MeetingDecl,
  triggeredByAction: string,
  triggeredByStage: string,
): Promise<MeetingRuntime> {
  const firstRound = meeting.rounds[0];
  if (!firstRound) {
    throw new Error(`Meeting ${meeting.id} has no rounds declared`);
  }

  const runtime: MeetingRuntime = {
    meeting_id: meeting.id,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    current_round: firstRound.number,
    current_phase: firstRound.phase,
    participants: [],
    rounds: [],
    current_round_contributions: [],
    convergence_summary: null,
    open_questions: [],
    triggered_by_action: triggeredByAction,
    triggered_by_stage: triggeredByStage,
  };

  await saveMeetingRuntime(projectRoot, runtime);
  return runtime;
}

/**
 * Add a contribution to the current round.
 * Records the participant if this is their first contribution.
 */
export async function recordContribution(
  projectRoot: string,
  meeting: MeetingDecl,
  runtime: MeetingRuntime,
  contribution: {
    participant: string;
    type: ContributionType;
    content: string;
    targets?: string[];
  },
): Promise<MeetingRuntime> {
  const fullContribution: MeetingContribution = {
    participant: contribution.participant,
    type: contribution.type,
    content: contribution.content,
    targets: contribution.targets,
    round: runtime.current_round,
  };

  runtime.current_round_contributions.push(fullContribution);

  if (!runtime.participants.includes(contribution.participant)) {
    runtime.participants.push(contribution.participant);
  }

  await saveMeetingRuntime(projectRoot, runtime);
  return runtime;
}

/**
 * Advance to the next round.
 *
 * Moves current_round_contributions into rounds[] as a completed transcript,
 * then increments current_round. Picks the phase from the next declared round
 * template, or repeats the last declared phase if past the templates
 * (dynamic round extension).
 *
 * Throws if current round has no contributions (can't advance an empty round)
 * or if already completed.
 */
export async function advanceRound(
  projectRoot: string,
  meeting: MeetingDecl,
  runtime: MeetingRuntime,
): Promise<MeetingRuntime> {
  if (runtime.status !== "in_progress") {
    throw new Error(
      `Meeting ${runtime.meeting_id} is not in_progress (status: ${runtime.status})`,
    );
  }

  if (runtime.current_round_contributions.length === 0) {
    throw new Error(
      `Cannot advance meeting ${runtime.meeting_id}: current round ${runtime.current_round} has no contributions`,
    );
  }

  // Freeze the current round as a completed transcript
  runtime.rounds.push({
    round: runtime.current_round,
    phase: runtime.current_phase,
    contributions: runtime.current_round_contributions,
  });

  // Move to next round
  const nextRoundNumber = runtime.current_round + 1;

  // Find phase for next round: declared template if exists, else repeat last phase
  const declaredNext = meeting.rounds.find((r) => r.number === nextRoundNumber);
  const nextPhase = declaredNext?.phase || runtime.current_phase;

  runtime.current_round = nextRoundNumber;
  runtime.current_phase = nextPhase;
  runtime.current_round_contributions = [];

  await saveMeetingRuntime(projectRoot, runtime);
  return runtime;
}

/**
 * Complete a meeting: synthesize output, mark as completed.
 *
 * The facilitator (coordinator) provides the convergence_summary and any
 * open_questions. The current round (if any contributions) is frozen into
 * rounds[] before completion.
 */
export async function completeMeeting(
  projectRoot: string,
  runtime: MeetingRuntime,
  options: {
    convergence_summary: string;
    open_questions?: string[];
    output_artifacts?: string[];
  },
): Promise<MeetingTranscript> {
  if (runtime.status !== "in_progress") {
    throw new Error(
      `Meeting ${runtime.meeting_id} is not in_progress (status: ${runtime.status})`,
    );
  }

  // Freeze current round if it has contributions
  if (runtime.current_round_contributions.length > 0) {
    runtime.rounds.push({
      round: runtime.current_round,
      phase: runtime.current_phase,
      contributions: runtime.current_round_contributions,
    });
    runtime.current_round_contributions = [];
  }

  runtime.status = "completed";
  runtime.completed_at = new Date().toISOString();
  runtime.convergence_summary = options.convergence_summary;
  runtime.open_questions = options.open_questions || [];

  await saveMeetingRuntime(projectRoot, runtime);

  // Return as a completed transcript (drop runtime-only fields)
  return {
    meeting_id: runtime.meeting_id,
    started_at: runtime.started_at,
    completed_at: runtime.completed_at!,
    participants: runtime.participants,
    rounds: runtime.rounds,
    output_artifacts: options.output_artifacts || [],
    convergence_summary: runtime.convergence_summary!,
    open_questions: runtime.open_questions,
  };
}

/**
 * Abandon a meeting (e.g., user interrupts, or BLOCKED with no recovery).
 * Keeps the partial transcript for audit but marks as abandoned.
 */
export async function abandonMeeting(
  projectRoot: string,
  runtime: MeetingRuntime,
  reason: string,
): Promise<MeetingRuntime> {
  if (runtime.current_round_contributions.length > 0) {
    runtime.rounds.push({
      round: runtime.current_round,
      phase: runtime.current_phase,
      contributions: runtime.current_round_contributions,
    });
    runtime.current_round_contributions = [];
  }

  runtime.status = "abandoned";
  runtime.completed_at = new Date().toISOString();
  runtime.convergence_summary = `[ABANDONED] ${reason}`;

  await saveMeetingRuntime(projectRoot, runtime);
  return runtime;
}

/**
 * Find the declared round template for a given round number.
 * Returns undefined if past declared templates (dynamic extension).
 */
export function findRoundTemplate(
  meeting: MeetingDecl,
  roundNumber: number,
): MeetingRound | undefined {
  return meeting.rounds.find((r) => r.number === roundNumber);
}

/**
 * Initialize an ad-hoc meeting (coordinator-initiated, not declared in any pack).
 *
 * Creates a synthetic MeetingDecl with default round templates and persists it
 * in the runtime file's `ad_hoc_decl` field. The coordinator can then use the
 * standard `meeting record/advance/complete` commands as if it were declared.
 *
 * Use case: the coordinator (Claude) encounters an unclear issue or a question
 * that needs multi-perspective discussion, and no pack declared a meeting for
 * this situation. The coordinator spontaneously convenes one.
 */
export async function initAdHocMeeting(
  projectRoot: string,
  options: {
    meeting_id: string;
    purpose: string;
    description?: string;
    participants: Array<{
      agent_id?: string;
      expert_role?: string;
      perspective: string;
    }>;
    min_rounds?: number;
    max_rounds?: number;
    output_artifacts?: string[];
    triggered_by_action?: string;
    triggered_by_stage?: string;
  },
): Promise<MeetingRuntime> {
  const minRounds = options.min_rounds ?? 1;
  const maxRounds = options.max_rounds ?? 5;

  // Default round templates: diverge → challenge → converge
  const defaultRounds: MeetingRound[] = [
    {
      number: 1,
      phase: "diverge",
      objective: "Share initial perspectives",
      prompt: "State your perspective on this issue.",
      speakers: [],
    },
    {
      number: 2,
      phase: "challenge",
      objective: "Question assumptions and challenge each other",
      prompt: "Challenge or refine the perspectives shared.",
      speakers: [],
    },
    {
      number: 3,
      phase: "converge",
      objective: "Synthesize and align",
      prompt: "Synthesize the discussion into a shared conclusion.",
      speakers: [],
    },
  ];

  const adHocDecl: MeetingDecl = {
    id: options.meeting_id,
    description: options.description || `Ad-hoc meeting: ${options.purpose}`,
    purpose: options.purpose,
    participants: options.participants.map((p, i) => ({
      agent_id: p.agent_id,
      expert_role: p.expert_role,
      role: "core" as const,
      perspective: p.perspective,
    })),
    rounds: defaultRounds,
    output_artifacts: options.output_artifacts || [],
    on_actions: [], // ad-hoc: not triggered by any action
    min_rounds: minRounds,
    max_rounds: maxRounds,
  };

  const runtime: MeetingRuntime = {
    meeting_id: options.meeting_id,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    current_round: 1,
    current_phase: "diverge",
    participants: [],
    rounds: [],
    current_round_contributions: [],
    convergence_summary: null,
    open_questions: [],
    triggered_by_action: options.triggered_by_action || "ad-hoc",
    triggered_by_stage: options.triggered_by_stage || "ad-hoc",
    ad_hoc_decl: adHocDecl,
  };

  await saveMeetingRuntime(projectRoot, runtime);
  return runtime;
}

/**
 * Resolve a meeting declaration: check graph.meetings first, then fall back
 * to ad_hoc_decl in the runtime file (for coordinator-initiated meetings).
 *
 * Returns the MeetingDecl and whether it's ad-hoc.
 */
export async function resolveMeetingDecl(
  projectRoot: string,
  graph: { meetings?: MeetingDecl[] },
  meetingId: string,
): Promise<{ decl: MeetingDecl; isAdHoc: boolean } | null> {
  // Check graph first
  const declared = graph.meetings?.find((m) => m.id === meetingId);
  if (declared) {
    return { decl: declared, isAdHoc: false };
  }

  // Fall back to ad_hoc_decl in runtime file
  const runtime = await loadMeetingRuntime(projectRoot, meetingId);
  if (runtime?.ad_hoc_decl) {
    return { decl: runtime.ad_hoc_decl, isAdHoc: true };
  }

  return null;
}

/**
 * Collect all contributions from rounds 1..N-1 for broadcast.
 * Used when constructing a participant's prompt for round N.
 */
export function collectPriorContributions(
  runtime: MeetingRuntime,
  upToRound: number,
): MeetingContribution[] {
  const prior: MeetingContribution[] = [];
  for (const round of runtime.rounds) {
    if (round.round < upToRound) {
      prior.push(...round.contributions);
    }
  }
  return prior;
}
