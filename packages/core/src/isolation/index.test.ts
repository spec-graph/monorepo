import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeManager } from './index.js';
import { checkScopeLock } from './scope-lock.js';
import { buildMergeQueue, executeMergeQueue } from './merge-queue.js';
import type { GitBackend } from './git-backend.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createFakeGitBackend(): GitBackend & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    exec(args: string[], opts?: { cwd?: string }) {
      calls.push(args);
      // Simulate git commands
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
        return { stdout: 'main\n', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: 'abc123\n', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'worktree' && args[1] === 'add') {
        // Simulate worktree creation
        const worktreePath = args[2];
        if (worktreePath) {
          fs.mkdirSync(worktreePath, { recursive: true });
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'worktree' && args[1] === 'remove') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'branch' && args[1] === '-D') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'merge') {
        return { stdout: 'Merge successful\n', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
    exists(p: string) {
      return fs.existsSync(p);
    },
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// WorktreeManager
// ---------------------------------------------------------------------------

describe('WorktreeManager', () => {
  describe('create', () => {
    it('creates a worktree and persists to worktrees.yaml', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      const unit = manager.create({
        sessionId: 'test-session',
        actionId: 'user-model',
        projectRoot: tmpDir,
      });

      expect(unit.id).toBe('test-session-user-model');
      expect(unit.status).toBe('prepared');
      expect(unit.branch).toBe('spec-graph/test-session-user-model');
      expect(fs.existsSync(unit.path)).toBe(true);

      // Persisted
      const statePath = path.join(tmpDir, '.spec-graph', 'isolation', 'worktrees.yaml');
      expect(fs.existsSync(statePath)).toBe(true);
    });

    it('uses current branch as base when not specified', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      manager.create({
        sessionId: 'test',
        actionId: 'auth',
        projectRoot: tmpDir,
      });

      // Should call rev-parse to get current branch
      expect(git.calls.some((c) => c.includes('--abbrev-ref'))).toBe(true);
    });
  });

  describe('verify', () => {
    it('marks unit as self_verified', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      const unit = manager.create({
        sessionId: 'test',
        actionId: 'auth',
        projectRoot: tmpDir,
      });

      const result = manager.verify(unit.id);
      expect(result.success).toBe(true);

      const updated = manager.get(unit.id);
      expect(updated?.status).toBe('self_verified');
    });

    it('fails for unknown unit', () => {
      const manager = new WorktreeManager(tmpDir, createFakeGitBackend());
      const result = manager.verify('nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('merge', () => {
    it('merges self_verified unit', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      const unit = manager.create({
        sessionId: 'test',
        actionId: 'auth',
        projectRoot: tmpDir,
      });
      manager.verify(unit.id);

      const result = manager.merge(unit.id);
      expect(result.success).toBe(true);

      // Unit should be cleaned up after merge
      const found = manager.get(unit.id);
      expect(found).toBeNull();
    });

    it('fails if unit not self_verified', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      const unit = manager.create({
        sessionId: 'test',
        actionId: 'auth',
        projectRoot: tmpDir,
      });

      const result = manager.merge(unit.id);
      expect(result.success).toBe(false);
    });
  });

  describe('abandon', () => {
    it('marks unit as abandoned and cleans up', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      const unit = manager.create({
        sessionId: 'test',
        actionId: 'auth',
        projectRoot: tmpDir,
      });

      manager.abandon(unit.id);
      const found = manager.get(unit.id);
      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    it('returns all units', () => {
      const manager = new WorktreeManager(tmpDir, createFakeGitBackend());

      manager.create({ sessionId: 's', actionId: 'a', projectRoot: tmpDir });
      manager.create({ sessionId: 's', actionId: 'b', projectRoot: tmpDir });

      const units = manager.list();
      expect(units.length).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// ScopeLock
// ---------------------------------------------------------------------------

describe('checkScopeLock', () => {
  it('passes when no violations', () => {
    const result = checkScopeLock('/worktree', {
      allowedPaths: ['src/**'],
      protectedPaths: [],
      forbiddenPaths: ['.git/**'],
    }, ['src/auth.ts', 'src/user.ts']);

    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects forbidden path violations', () => {
    const result = checkScopeLock('/worktree', {
      allowedPaths: ['src/**'],
      protectedPaths: [],
      forbiddenPaths: ['.git/**'],
    }, ['src/auth.ts', '.git/config']);

    expect(result.clean).toBe(false);
    expect(result.violations.some((v) => v.type === 'forbidden')).toBe(true);
  });

  it('detects protected path modifications', () => {
    // Create a protected file
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'content');

    const result = checkScopeLock(tmpDir, {
      allowedPaths: ['src/**'],
      protectedPaths: ['README.md'],
      forbiddenPaths: [],
    }, ['src/auth.ts', 'README.md']);

    expect(result.clean).toBe(false);
    expect(result.violations.some((v) => v.type === 'protected-modified')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MergeQueue
// ---------------------------------------------------------------------------

describe('MergeQueue', () => {
  describe('buildMergeQueue', () => {
    it('groups units by wave in order', () => {
      const queue = buildMergeQueue({
        0: ['unit-a', 'unit-b'],
        1: ['unit-c'],
      });

      expect(queue.items.length).toBe(3);
      expect(queue.items[0].wave).toBe(0);
      expect(queue.items[1].wave).toBe(0);
      expect(queue.items[2].wave).toBe(1);
    });
  });

  describe('executeMergeQueue', () => {
    it('merges all units successfully', () => {
      const git = createFakeGitBackend();
      const manager = new WorktreeManager(tmpDir, git);

      // Create and verify units
      const unitA = manager.create({ sessionId: 's', actionId: 'a', projectRoot: tmpDir });
      const unitB = manager.create({ sessionId: 's', actionId: 'b', projectRoot: tmpDir });
      manager.verify(unitA.id);
      manager.verify(unitB.id);

      const queue = buildMergeQueue({ 0: [unitA.id, unitB.id] });
      const result = executeMergeQueue(queue, manager);

      expect(result.allMerged).toBe(true);
      expect(result.merged.length).toBe(2);
      expect(result.failed.length).toBe(0);
    });
  });
});
