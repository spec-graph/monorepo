import { describe, it, expect } from 'vitest';
import { analyzeFailure, planRecovery } from './index.js';

describe('parallel-recovery', () => {
  describe('analyzeFailure', () => {
    it('returns empty when no failures', () => {
      const result = analyzeFailure([], {});
      expect(result.blamedTasks).toEqual([]);
      expect(result.canAttribute).toBe(true);
    });

    it('attributes single task failure', () => {
      const result = analyzeFailure(
        [{ taskId: 'A', level: 1, error: 'test failed' }],
        {},
      );
      expect(result.blamedTasks).toEqual(['A']);
      expect(result.canAttribute).toBe(true);
    });

    it('attributes to both tasks when file conflicts', () => {
      const result = analyzeFailure(
        [
          { taskId: 'A', level: 1, error: 'fail' },
          { taskId: 'B', level: 1, error: 'fail' },
        ],
        { A: ['src/auth/login.ts'], B: ['src/auth/login.ts'] },
      );
      expect(result.blamedTasks.sort()).toEqual(['A', 'B']);
      expect(result.canAttribute).toBe(true);
    });

    it('cannot attribute when multiple failures without clear cause', () => {
      const result = analyzeFailure(
        [
          { taskId: 'A', level: 1, error: 'fail' },
          { taskId: 'B', level: 1, error: 'fail' },
        ],
        { A: ['src/auth/login.ts'], B: ['src/books/list.ts'] },
      );
      expect(result.canAttribute).toBe(false);
    });
  });

  describe('planRecovery', () => {
    it('retries specific task when attributed', () => {
      const result = planRecovery({ blamedTasks: ['A'], canAttribute: true }, 1);
      expect(result.action).toBe('retry-specific');
      expect(result.tasksToRetry).toEqual(['A']);
    });

    it('retries multiple attributed tasks', () => {
      const result = planRecovery({ blamedTasks: ['A', 'B'], canAttribute: true }, 2);
      expect(result.action).toBe('retry-specific');
      expect(result.tasksToRetry.sort()).toEqual(['A', 'B']);
    });

    it('degrades to serial when cannot attribute', () => {
      const result = planRecovery({ blamedTasks: [], canAttribute: false }, 3);
      expect(result.action).toBe('degrade-serial');
    });

    it('degrades after multiple retries', () => {
      const result = planRecovery({ blamedTasks: ['A'], canAttribute: true }, 5);
      expect(result.action).toBe('degrade-serial');
    });

    it('retries wave when too many tasks affected', () => {
      const result = planRecovery(
        { blamedTasks: ['A', 'B', 'C', 'D', 'E'], canAttribute: true },
        2,
      );
      expect(result.action).toBe('retry-wave');
    });
  });
});
