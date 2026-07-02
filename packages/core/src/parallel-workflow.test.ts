import { describe, it, expect } from 'vitest';
import { analyzeTasks } from './dependency-analyzer/index.js';
import { analyzeConflicts } from './file-conflict-analyzer/index.js';
import { runIntegrationGate } from './integration-gate/index.js';
import { analyzeFailure, planRecovery } from './parallel-recovery/index.js';
import { generateSharedContext } from './context-sharing/index.js';

describe('parallel workflow integration', () => {
  // 3 tasks: A (no deps), B (depends on A), C (no deps)
  const tasks = [
    { id: 'A', description: 'User model', dependsOn: [] },
    { id: 'B', description: 'Auth endpoints', dependsOn: ['A'] },
    { id: 'C', description: 'Books endpoints', dependsOn: [] },
  ];
  const taskFiles = {
    A: ['src/auth/user.ts', 'src/types/user.ts'],
    B: ['src/auth/login.ts', 'src/auth/middleware.ts'],
    C: ['src/books/list.ts', 'src/books/create.ts'],
  };

  describe('full end-to-end simulation', () => {
    it('dependency → waves → conflicts → gate → recovery', () => {
      // Step 1: Analyze dependencies
      const plan = analyzeTasks(tasks);
      expect(plan.waves.length).toBe(2);
      expect(plan.waves[0].sort()).toEqual(['A', 'C']);
      expect(plan.waves[1]).toEqual(['B']);

      // Step 2: Check file conflicts in Wave 1 (A+C)
      const wave1Conflicts = analyzeConflicts({ A: taskFiles.A, C: taskFiles.C });
      expect(wave1Conflicts.rows.A.C).toBe(false); // No conflicts in Wave 1

      // Step 3: Check conflicts in Wave 2 (B)
      // B is single task, no conflicts

      // Step 4: Run three-level gate on Wave 1 (all pass)
      const gateResult = runIntegrationGate(
        { A: taskFiles.A, C: taskFiles.C },
        {
          A: { taskId: 'A', files: taskFiles.A, testResults: { passed: 5, failed: 0, total: 5 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, selfReviewCompleted: true, functionalityAligned: true },
          C: { taskId: 'C', files: taskFiles.C, testResults: { passed: 3, failed: 0, total: 3 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, selfReviewCompleted: true, functionalityAligned: true },
        },
        { worktreeBranch: 'w1', filesMerged: [...taskFiles.A, ...taskFiles.C], testResults: { passed: 8, failed: 0, total: 8 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, codeReviewIssues: 0, functionalityAligned: true },
        { integrationTestResults: { passed: 3, failed: 0, total: 3 }, styleConsistency: true, crossAgentConsistency: true, comprehensiveReviewPassed: true },
      );
      expect(gateResult.allPassed).toBe(true);

      // Step 5: Generate shared context for sub-agents
      const ctx = generateSharedContext(
        { profile: { language: 'TypeScript', framework: 'Express', runtime: 'Node.js', testFramework: 'vitest', brownfield: false, existingFeatures: [] }, overview: 'Test project', methodology: { namingConvention: 'camelCase', codeStructure: 'src/', commentStyle: 'JSDoc', testPattern: 'vitest' } },
        [{ taskId: 'A', description: 'User model', files: taskFiles.A }],
      );
      expect(ctx.wordCount).toBeLessThan(2000);
    });
  });

  describe('recovery scenarios', () => {
    it('single failure → retry specific', () => {
      const failures = [{ taskId: 'B', level: 1 as const, error: 'test failed' }];
      const attribution = analyzeFailure(failures, taskFiles);
      expect(attribution.canAttribute).toBe(true);
      const recovery = planRecovery(attribution, 1);
      expect(recovery.action).toBe('retry-specific');
    });

    it('multiple retries → degrade to serial', () => {
      const attribution = { blamedTasks: ['B'], canAttribute: true };
      const recovery = planRecovery(attribution, 5);
      expect(recovery.action).toBe('degrade-serial');
    });

    it('file conflict → attributed to conflicting tasks', () => {
      const failures = [
        { taskId: 'A', level: 1 as const, error: 'fail' },
        { taskId: 'B', level: 1 as const, error: 'fail' },
      ];
      // A and B both modify src/auth/login.ts
      const attribution = analyzeFailure(failures, {
        A: ['src/auth/login.ts'],
        B: ['src/auth/login.ts'],
      });
      expect(attribution.canAttribute).toBe(true);
      expect(attribution.blamedTasks.sort()).toEqual(['A', 'B']);
    });
  });
});
