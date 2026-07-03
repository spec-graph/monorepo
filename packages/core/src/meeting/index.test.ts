import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MeetingManager } from './index.js';
import type { MeetingDecl } from '../types/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTestMeeting(): MeetingDecl {
  return {
    id: 'test-meeting',
    description: 'Test meeting',
    purpose: 'Test discussion',
    participants: [
      { agent_id: 'pm', role: 'core', perspective: 'user needs' },
      { agent_id: 'architect', role: 'core', perspective: 'tech feasibility' },
    ],
    rounds: [
      { number: 1, phase: 'diverge', prompt: 'Share perspectives', speakers: [], objective: 'Initial thoughts' },
      { number: 2, phase: 'challenge', prompt: 'Challenge assumptions', speakers: [], objective: 'Critique' },
      { number: 3, phase: 'converge', prompt: 'Align positions', speakers: [], objective: 'Agreement' },
    ],
    output_artifacts: ['requirement/proposal'],
    on_actions: ['propose', 'specify'],
    min_rounds: 2,
    max_rounds: 5,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// MeetingManager
// ---------------------------------------------------------------------------

describe('MeetingManager', () => {
  describe('create', () => {
    it('creates meeting state file', () => {
      const manager = new MeetingManager(tmpDir);
      const runtime = manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      expect(runtime.meeting_id).toBe('test-meeting');
      expect(runtime.status).toBe('in_progress');
      expect(runtime.current_round).toBe(1);
      expect(runtime.current_phase).toBe('diverge');
      expect(runtime.participants).toEqual(['pm', 'architect']);

      // Persisted
      const meetingPath = path.join(tmpDir, '.spec-graph', 'meetings', 'test-meeting.yaml');
      expect(fs.existsSync(meetingPath)).toBe(true);
    });

    it('throws on duplicate create', () => {
      const manager = new MeetingManager(tmpDir);
      const decl = createTestMeeting();

      manager.create({ meetingId: 'test-meeting', declaration: decl, projectRoot: tmpDir });
      expect(() => {
        manager.create({ meetingId: 'test-meeting', declaration: decl, projectRoot: tmpDir });
      }).toThrow('Meeting already exists');
    });
  });

  describe('record', () => {
    it('records contribution for current round', () => {
      const manager = new MeetingManager(tmpDir);
      manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      const contribution = manager.record(
        'test-meeting',
        'pm',
        'statement',
        'We need user authentication',
      );

      expect(contribution.participant).toBe('pm');
      expect(contribution.type).toBe('statement');
      expect(contribution.round).toBe(1);

      // Verify persisted
      const runtime = manager.transcript('test-meeting');
      expect(runtime?.current_round_contributions).toHaveLength(1);
    });

    it('throws for non-existent meeting', () => {
      const manager = new MeetingManager(tmpDir);
      expect(() => {
        manager.record('nonexistent', 'pm', 'statement', 'text');
      }).toThrow('Meeting not found');
    });
  });

  describe('advance', () => {
    it('moves contributions to completed round', () => {
      const manager = new MeetingManager(tmpDir);
      manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      manager.record('test-meeting', 'pm', 'statement', 'First contribution');
      manager.record('test-meeting', 'architect', 'statement', 'Second contribution');

      const runtime = manager.advance('test-meeting');

      expect(runtime.current_round).toBe(2);
      expect(runtime.current_phase).toBe('challenge');
      expect(runtime.rounds).toHaveLength(1);
      expect(runtime.rounds[0].contributions).toHaveLength(2);
      expect(runtime.current_round_contributions).toHaveLength(0);
    });

    it('throws when all rounds completed', () => {
      const manager = new MeetingManager(tmpDir);
      manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      // Advance through all rounds
      manager.advance('test-meeting'); // 1 → 2
      manager.advance('test-meeting'); // 2 → 3
      expect(() => manager.advance('test-meeting')).toThrow('All rounds completed');
    });
  });

  describe('complete', () => {
    it('marks meeting as completed with summary', () => {
      const manager = new MeetingManager(tmpDir);
      manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      const runtime = manager.complete('test-meeting', 'We agree on JWT auth approach');

      expect(runtime.status).toBe('completed');
      expect(runtime.convergence_summary).toBe('We agree on JWT auth approach');
      expect(runtime.completed_at).toBeDefined();
    });
  });

  describe('abandon', () => {
    it('marks meeting as abandoned', () => {
      const manager = new MeetingManager(tmpDir);
      manager.create({
        meetingId: 'test-meeting',
        declaration: createTestMeeting(),
        projectRoot: tmpDir,
      });

      const runtime = manager.abandon('test-meeting', 'Scope changed');

      expect(runtime.status).toBe('abandoned');
      expect(runtime.open_questions).toContain('Abandoned: Scope changed');
    });
  });

  describe('list', () => {
    it('returns all meetings', () => {
      const manager = new MeetingManager(tmpDir);
      const decl1 = createTestMeeting();
      const decl2 = { ...createTestMeeting(), id: 'meeting-2' };

      manager.create({ meetingId: 'meeting-1', declaration: decl1, projectRoot: tmpDir });
      manager.create({ meetingId: 'meeting-2', declaration: decl2, projectRoot: tmpDir });

      const meetings = manager.list();
      expect(meetings.length).toBe(2);
    });

    it('returns empty when no meetings', () => {
      const manager = new MeetingManager(tmpDir);
      expect(manager.list()).toEqual([]);
    });
  });
});
