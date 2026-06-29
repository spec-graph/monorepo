/**
 * Meeting runtime state I/O.
 *
 * Persists in-progress meetings to .spec-graph/meetings/<meeting_id>.yaml
 * so the coordinator can resume after restart, and so the transcript is
 * available for traceability once the meeting completes.
 */
import { MeetingRuntime, MeetingContribution, MeetingDecl, MeetingRound, MeetingTranscript, ContributionType } from "../../types/index";
export interface MeetingRuntimeFile {
    projectRoot: string;
    meetingsDir: string;
}
export declare function meetingRuntimePath(projectRoot: string, meetingId: string): string;
export declare function meetingsDir(projectRoot: string): string;
/**
 * Load a meeting runtime state. Returns null if file does not exist.
 */
export declare function loadMeetingRuntime(projectRoot: string, meetingId: string): Promise<MeetingRuntime | null>;
/**
 * Save a meeting runtime state to disk.
 */
export declare function saveMeetingRuntime(projectRoot: string, runtime: MeetingRuntime): Promise<void>;
/**
 * Initialize a new meeting runtime in the in_progress state.
 * Called when dispatch detects a meeting that has no runtime file yet.
 */
export declare function initMeetingRuntime(projectRoot: string, meeting: MeetingDecl, triggeredByAction: string, triggeredByStage: string): Promise<MeetingRuntime>;
/**
 * Add a contribution to the current round.
 * Records the participant if this is their first contribution.
 */
export declare function recordContribution(projectRoot: string, meeting: MeetingDecl, runtime: MeetingRuntime, contribution: {
    participant: string;
    type: ContributionType;
    content: string;
    targets?: string[];
}): Promise<MeetingRuntime>;
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
export declare function advanceRound(projectRoot: string, meeting: MeetingDecl, runtime: MeetingRuntime): Promise<MeetingRuntime>;
/**
 * Complete a meeting: synthesize output, mark as completed.
 *
 * The facilitator (coordinator) provides the convergence_summary and any
 * open_questions. The current round (if any contributions) is frozen into
 * rounds[] before completion.
 */
export declare function completeMeeting(projectRoot: string, runtime: MeetingRuntime, options: {
    convergence_summary: string;
    open_questions?: string[];
    output_artifacts?: string[];
}): Promise<MeetingTranscript>;
/**
 * Abandon a meeting (e.g., user interrupts, or BLOCKED with no recovery).
 * Keeps the partial transcript for audit but marks as abandoned.
 */
export declare function abandonMeeting(projectRoot: string, runtime: MeetingRuntime, reason: string): Promise<MeetingRuntime>;
/**
 * Find the declared round template for a given round number.
 * Returns undefined if past declared templates (dynamic extension).
 */
export declare function findRoundTemplate(meeting: MeetingDecl, roundNumber: number): MeetingRound | undefined;
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
export declare function initAdHocMeeting(projectRoot: string, options: {
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
}): Promise<MeetingRuntime>;
/**
 * Resolve a meeting declaration: check graph.meetings first, then fall back
 * to ad_hoc_decl in the runtime file (for coordinator-initiated meetings).
 *
 * Returns the MeetingDecl and whether it's ad-hoc.
 */
export declare function resolveMeetingDecl(projectRoot: string, graph: {
    meetings?: MeetingDecl[];
}, meetingId: string): Promise<{
    decl: MeetingDecl;
    isAdHoc: boolean;
} | null>;
/**
 * Collect all contributions from rounds 1..N-1 for broadcast.
 * Used when constructing a participant's prompt for round N.
 */
export declare function collectPriorContributions(runtime: MeetingRuntime, upToRound: number): MeetingContribution[];
