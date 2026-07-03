/**
 * Meeting Runtime — manages meeting state for multi-agent collaborative discussions.
 *
 * Meetings bring multiple agents together for structured rounds of discussion.
 * This module manages the state:
 *   - Meeting lifecycle (create, advance, complete, abandon)
 *   - Round progression (diverge → challenge → converge)
 *   - Contribution recording
 *   - Transcript generation
 *
 * This module does NOT execute agents — that's the coordinator's job.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
  MeetingDecl,
  MeetingRuntime,
  MeetingContribution,
  MeetingRoundTranscript,
  ContributionType,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeetingStartOptions {
  meetingId: string;
  declaration: MeetingDecl;
  projectRoot: string;
  triggeredByAction?: string;
  triggeredByStage?: string;
}

// ---------------------------------------------------------------------------
// MeetingManager
// ---------------------------------------------------------------------------

/**
 * Manages meeting state and lifecycle.
 */
export class MeetingManager {
  private projectRoot: string;
  private meetingsDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.meetingsDir = path.join(projectRoot, '.spec-graph', 'meetings');
  }

  /**
   * Create a new meeting runtime state.
   */
  create(opts: MeetingStartOptions): MeetingRuntime {
    const meetingPath = this.getMeetingPath(opts.meetingId);

    // Check if already exists
    if (fs.existsSync(meetingPath)) {
      throw new Error(`Meeting already exists: ${opts.meetingId}`);
    }

    const firstRound = opts.declaration.rounds[0];
    if (!firstRound) {
      throw new Error(`Meeting ${opts.meetingId} has no rounds defined`);
    }

    const runtime: MeetingRuntime = {
      meeting_id: opts.meetingId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      completed_at: null,
      current_round: 1,
      current_phase: firstRound.phase,
      participants: opts.declaration.participants.map((p) => p.agent_id || p.expert_role || ''),
      rounds: [],
      current_round_contributions: [],
      convergence_summary: null,
      open_questions: [],
      triggered_by_action: opts.triggeredByAction || '',
      triggered_by_stage: opts.triggeredByStage || '',
      ad_hoc_decl: opts.declaration, // Store the declaration for advance/complete
    };

    this.saveMeeting(runtime);
    return runtime;
  }

  /**
   * Record a contribution for the current round.
   */
  record(
    meetingId: string,
    participant: string,
    type: ContributionType,
    content: string,
    targets?: string[],
  ): MeetingContribution {
    const runtime = this.loadMeeting(meetingId);
    if (!runtime) throw new Error(`Meeting not found: ${meetingId}`);
    if (runtime.status !== 'in_progress') {
      throw new Error(`Meeting ${meetingId} is not in progress (status: ${runtime.status})`);
    }

    const contribution: MeetingContribution = {
      participant,
      type,
      content,
      targets,
      round: runtime.current_round,
    };

    runtime.current_round_contributions.push(contribution);
    this.saveMeeting(runtime);

    return contribution;
  }

  /**
   * Advance to the next round.
   */
  advance(meetingId: string): MeetingRuntime {
    const runtime = this.loadMeeting(meetingId);
    if (!runtime) throw new Error(`Meeting not found: ${meetingId}`);
    if (runtime.status !== 'in_progress') {
      throw new Error(`Meeting ${meetingId} is not in progress`);
    }

    // Get the declaration (from ad_hoc_decl or loaded from graph)
    const declaration = runtime.ad_hoc_decl;
    if (!declaration) {
      throw new Error(`Meeting ${meetingId} has no declaration (only ad-hoc meetings supported for now)`);
    }

    // Move current contributions to completed round
    const completedRound: MeetingRoundTranscript = {
      round: runtime.current_round,
      phase: runtime.current_phase,
      contributions: [...runtime.current_round_contributions],
    };
    runtime.rounds.push(completedRound);

    // Check if there's a next round
    const nextRoundDef = declaration.rounds.find(
      (r) => r.number === runtime.current_round + 1,
    );

    if (!nextRoundDef) {
      throw new Error(`All rounds completed. Use complete() to finalize the meeting.`);
    }

    // Advance
    runtime.current_round = nextRoundDef.number;
    runtime.current_phase = nextRoundDef.phase;
    runtime.current_round_contributions = [];

    this.saveMeeting(runtime);
    return runtime;
  }

  /**
   * Complete the meeting with a summary.
   */
  complete(meetingId: string, summary: string): MeetingRuntime {
    const runtime = this.loadMeeting(meetingId);
    if (!runtime) throw new Error(`Meeting not found: ${meetingId}`);

    // Move any remaining contributions to the last round
    if (runtime.current_round_contributions.length > 0) {
      const lastRound: MeetingRoundTranscript = {
        round: runtime.current_round,
        phase: runtime.current_phase,
        contributions: [...runtime.current_round_contributions],
      };
      runtime.rounds.push(lastRound);
    }

    runtime.status = 'completed';
    runtime.completed_at = new Date().toISOString();
    runtime.convergence_summary = summary;
    runtime.current_round_contributions = [];

    this.saveMeeting(runtime);
    return runtime;
  }

  /**
   * Abandon the meeting.
   */
  abandon(meetingId: string, reason?: string): MeetingRuntime {
    const runtime = this.loadMeeting(meetingId);
    if (!runtime) throw new Error(`Meeting not found: ${meetingId}`);

    runtime.status = 'abandoned';
    runtime.completed_at = new Date().toISOString();
    runtime.open_questions.push(`Abandoned: ${reason || 'no reason given'}`);

    this.saveMeeting(runtime);
    return runtime;
  }

  /**
   * Get the full transcript.
   */
  transcript(meetingId: string): MeetingRuntime | null {
    return this.loadMeeting(meetingId);
  }

  /**
   * List all meetings.
   */
  list(): MeetingRuntime[] {
    if (!fs.existsSync(this.meetingsDir)) return [];

    const files = fs.readdirSync(this.meetingsDir).filter((f) => f.endsWith('.yaml'));
    return files
      .map((f) => this.loadMeeting(f.replace('.yaml', '')))
      .filter((m): m is MeetingRuntime => m !== null);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private getMeetingPath(meetingId: string): string {
    return path.join(this.meetingsDir, `${meetingId}.yaml`);
  }

  private loadMeeting(meetingId: string): MeetingRuntime | null {
    const meetingPath = this.getMeetingPath(meetingId);
    if (!fs.existsSync(meetingPath)) return null;

    try {
      const raw = fs.readFileSync(meetingPath, 'utf-8');
      return yaml.load(raw) as MeetingRuntime;
    } catch {
      return null;
    }
  }

  private saveMeeting(runtime: MeetingRuntime): void {
    if (!fs.existsSync(this.meetingsDir)) {
      fs.mkdirSync(this.meetingsDir, { recursive: true });
    }
    const meetingPath = this.getMeetingPath(runtime.meeting_id);
    fs.writeFileSync(meetingPath, yaml.dump(runtime, { lineWidth: 120 }), 'utf-8');
  }
}
