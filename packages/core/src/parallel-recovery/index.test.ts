import { describe, it, expect } from 'vitest';
import { analyzeFailure, planRecovery, logFailure } from './index.js';

describe('parallel-recovery', () => {
  describe('analyzeFailure', () => {
    it('returns empty when no failures', () => {
      const result = analyzeFailure([], {});
      expect(result.blamedTasks).toEqual([]);
      expect(result.canAttribute).toBe(true);
    });

    it('attributes single task failure', () => {
      const failures = [
        { taskId: 'A', level: 1 as const, error: 'test failed' },
      ];
      const result = analyzeFailure(failures, {});
      expect(result.blamedTasks).toEqual(['A']);
      expect(result.canAttribute).toBe(true);
    });

    it('attributes to both tasks when file conflicts', () => {
      const failures = [
        { taskId: 'A', level: 1 as const, error: 'test failed' },
        { taskId: 'B', level: 1 as const, error: 'test failed' },
      ];
      const taskFiles = {
        A: ['src/auth/login.ts'],
        B: ['src/auth/login.ts'], // same file
      };
      const result = analyzeFailure(failures, taskFiles);
      expect(result.blamedTasks.sort()).toEqual(['A', 'B']);
      expect(result.canAttribute).toBe(true);
    });

    it('cannot attribute multiple failures without clear cause', () => {
      const failures = [
        { taskId: 'A', level: 1 as const, error: 'test failed' },
        { taskId: 'B', level: 1 as const, error: 'lint error' },
      ];
      const taskFiles = {
        A: ['src/auth/login.ts'],
        B: ['src/books/list.ts'],
      };
      const result = analyzeFailure(failures, taskFiles);
      expect(result.canAttribute).toBe(false);
    });
  });

  describe('planRecovery', () => {
    it('retries specific task when attributed', () => {
      const attribution = {
        blamedTasks: ['A'],
        canAttribute: true,
      };
      const result = planRecovery(attribution, 1);
      expect(result.action).toBe('retry-specific');
      expect(result.tasksToRetry).toEqual(['A']);
    });

    it('retries multiple attributed tasks', () => {
      const attribution = {
        blamedTasks: ['A', 'B'],
        canAttribute: true,
      };
      const result = planRecovery(attribution, 2);
      expect(result.action).toBe('retry-specific');
      expect(result.tasksToRetry.sort()).toEqual(['A', 'B']);
    });

    it('degrades to serial when cannot attribute', () => {
      const attribution = {
        blamedTasks: ['A', 'B', 'C', 'D'],
        canAttribute: false,
        reason: 'Multiple tasks failed',
      };
      const result = planRecovery(attribution, 4);
      expect(result.action).toBe('degrade-serial');
    });

    it('degrades after multiple retries', () => {
      const attribution = {
        blamedTasks: ['A'],
        canAttribute: true,
      };
      const result = planRecovery(attribution, 5);
      expect(result.action).toBe('degrade-serial');
    });

    it('retries wave when too many tasks affected', () => {
      const attribution = {
        blamedTasks: ['A', 'B', 'C', 'D', 'E'],
        canAttribute: true,
      };
      const result = planRecovery(attribution, 2);
      // > 3 attributed tasks, retry entire wave
      expect(result.action).toBe('retry-wave');
    });
  });

  describe('logFailure', () => {
    it('creates a structured log entry', () => {
      const log = logFailure('A', 1, 'retry-specific', 'in-progress', 'test failed');
      expect(log.taskId).toBe('A');
      expect(log.level).toBe(1);
      expect(log.recoveryAction).toBe('retry-specific');
      expect(log.outcome).toBe('in-progress');
      expect(log.rootCause).toBe('test failed');
      expect(log.timestamp).toBeDefined();
    });

    it('handles missing rootCause', () => {
      const log = logFailure('A', 2, 'degrade-serial', 'failure');
      expect(log.rootCause).toBeUndefined();
    });
  });
});
