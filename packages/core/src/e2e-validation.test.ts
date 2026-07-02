import { describe, it, expect } from 'vitest';
import { analyzeTasks } from './dependency-analyzer/index.js';
import { analyzeConflicts } from './file-conflict-analyzer/index.js';
import { runIntegrationGate } from './integration-gate/index.js';
import { analyzeFailure, planRecovery } from './parallel-recovery/index.js';
import { generateSharedContext } from './context-sharing/index.js';

/**
 * E2E Validation: Simulates a complete parallel workflow on a realistic
 * 6-task project. Tests the full pipeline: dependency → waves → conflicts
 * → gate → recovery → degradation.
 *
 * Measures:
 * - Dependency analysis correctness
 * - Wave generation (parallel execution groups)
 * - Conflict detection (file overlaps)
 * - Three-level gate validation
 * - Failure recovery strategies
 * - Auto-degradation to serial
 */

describe('E2E: parallel workflow on 6-task project', () => {
  // Realistic 6-task project
  const tasks = [
    { id: 'user-model', description: 'User data model', dependsOn: [] },
    { id: 'auth-endpoints', description: 'Login/logout API', dependsOn: ['user-model'] },
    { id: 'books-api', description: 'Books CRUD', dependsOn: [] },
    { id: 'auth-middleware', description: 'JWT middleware', dependsOn: ['user-model'] },
    { id: 'e2e-tests', description: 'End-to-end tests', dependsOn: ['auth-endpoints', 'books-api'] },
    { id: 'integration-tests', description: 'Integration tests', dependsOn: ['auth-middleware'] },
  ];

  const taskFiles = {
    'user-model': ['src/models/user.ts', 'src/types/user.ts'],
    'auth-endpoints': ['src/api/auth.ts', 'src/routes/auth.ts'],
    'books-api': ['src/api/books.ts', 'src/routes/books.ts'],
    'auth-middleware': ['src/middleware/auth.ts'],
    'e2e-tests': ['tests/e2e/auth.test.ts', 'tests/e2e/books.test.ts'],
    'integration-tests': ['tests/integration/auth.test.ts'],
  };

  const baseContext = {
    profile: {
      language: 'TypeScript',
      framework: 'Express',
      runtime: 'Node.js',
      testFramework: 'vitest',
      brownfield: false,
      existingFeatures: [],
    },
    overview: 'Test project with user auth and books API',
    methodology: {
      namingConvention: 'camelCase',
      codeStructure: 'src/',
      commentStyle: 'JSDoc',
      testPattern: 'vitest',
    },
  };

  describe('Step 1: Dependency analysis produces correct waves', () => {
    it('generates 3 waves for 6-task project', () => {
      const plan = analyzeTasks(tasks);
      expect(plan.waves.length).toBe(3);
      // Wave 1: no dependencies
      expect(plan.waves[0].sort()).toEqual(['books-api', 'user-model']);
      // Wave 2: depends on Wave 1
      expect(plan.waves[1].sort()).toEqual(['auth-endpoints', 'auth-middleware']);
      // Wave 3: depends on Wave 2
      expect(plan.waves[2].sort()).toEqual(['e2e-tests', 'integration-tests']);
      // No cycles, no serial tasks
      expect(plan.cycles).toEqual([]);
      expect(plan.serialTasks).toEqual([]);
    });
  });

  describe('Step 2: Conflict detection per wave', () => {
    it('Wave 1 has no file conflicts', () => {
      const matrix = analyzeConflicts({
        'user-model': taskFiles['user-model'],
        'books-api': taskFiles['books-api'],
      });
      expect(matrix.rows['user-model']['books-api']).toBe(false);
    });

    it('Wave 2: auth-endpoints vs auth-middleware has directory overlap', () => {
      // Both touch src/ files, but different subdirs
      const matrix = analyzeConflicts({
        'auth-endpoints': taskFiles['auth-endpoints'],
        'auth-middleware': taskFiles['auth-middleware'],
      });
      // Different dirs: src/api/ vs src/middleware/
      expect(matrix.rows['auth-endpoints']['auth-middleware']).toBe(false);
    });

    it('Wave 3: e2e-tests vs integration-tests has no conflicts', () => {
      const matrix = analyzeConflicts({
        'e2e-tests': taskFiles['e2e-tests'],
        'integration-tests': taskFiles['integration-tests'],
      });
      expect(matrix.rows['e2e-tests']['integration-tests']).toBe(false);
    });
  });

  describe('Step 3: Three-level gate on successful Wave 1', () => {
    it('Wave 1 passes all three levels', () => {
      const wave1Files = {
        'user-model': taskFiles['user-model'],
        'books-api': taskFiles['books-api'],
      };
      const gate = runIntegrationGate(
        wave1Files,
        {
          'user-model': {
            taskId: 'user-model',
            files: taskFiles['user-model'],
            testResults: { passed: 5, failed: 0, total: 5 },
            lintErrors: 0,
            typecheckErrors: 0,
            buildSucceeded: true,
            selfReviewCompleted: true,
            functionalityAligned: true,
          },
          'books-api': {
            taskId: 'books-api',
            files: taskFiles['books-api'],
            testResults: { passed: 3, failed: 0, total: 3 },
            lintErrors: 0,
            typecheckErrors: 0,
            buildSucceeded: true,
            selfReviewCompleted: true,
            functionalityAligned: true,
          },
        },
        {
          worktreeBranch: 'w1',
          filesMerged: [...taskFiles['user-model'], ...taskFiles['books-api']],
          testResults: { passed: 8, failed: 0, total: 8 },
          lintErrors: 0,
          typecheckErrors: 0,
          buildSucceeded: true,
          codeReviewIssues: 0,
          functionalityAligned: true,
        },
        {
          integrationTestResults: { passed: 3, failed: 0, total: 3 },
          styleConsistency: true,
          crossAgentConsistency: true,
          comprehensiveReviewPassed: true,
        },
      );
      expect(gate.allPassed).toBe(true);
    });
  });

  describe('Step 4: Failure recovery scenario', () => {
    it('single failure → retry specific task', () => {
      const failures = [{ taskId: 'auth-endpoints', level: 1 as const, error: 'test failed' }];
      const attribution = analyzeFailure(failures, taskFiles);
      expect(attribution.canAttribute).toBe(true);
      const recovery = planRecovery(attribution, 1);
      expect(recovery.action).toBe('retry-specific');
      expect(recovery.tasksToRetry).toEqual(['auth-endpoints']);
    });

    it('multiple retries → degrade to serial', () => {
      const attribution = { blamedTasks: ['auth-endpoints'], canAttribute: true };
      const recovery = planRecovery(attribution, 5);
      expect(recovery.action).toBe('degrade-serial');
    });
  });

  describe('Step 5: Shared context generation', () => {
    it('generates shared context under 2000 words', () => {
      const ctx = generateSharedContext(baseContext, [
        { taskId: 'user-model', description: 'User data model', files: taskFiles['user-model'] },
      ]);
      expect(ctx.wordCount).toBeLessThan(2000);
      expect(ctx.markdown).toContain('TypeScript');
      expect(ctx.markdown).toContain('user-model');
    });
  });

  describe('Step 6: Full E2E simulation', () => {
    it('completes the entire parallel workflow', () => {
      // 1. Analyze
      const plan = analyzeTasks(tasks);
      expect(plan.waves.length).toBe(3);

      // 2. Check each wave has no file conflicts
      const wave1Matrix = analyzeConflicts({
        'user-model': taskFiles['user-model'],
        'books-api': taskFiles['books-api'],
      });
      expect(Object.values(wave1Matrix.rows).some((row) => Object.values(row).some((c) => c))).toBe(false);

      // 3. Run gate on Wave 1 (all pass)
      const gate = runIntegrationGate(
        { 'user-model': taskFiles['user-model'], 'books-api': taskFiles['books-api'] },
        {
          'user-model': { taskId: 'user-model', files: taskFiles['user-model'], testResults: { passed: 5, failed: 0, total: 5 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, selfReviewCompleted: true, functionalityAligned: true },
          'books-api': { taskId: 'books-api', files: taskFiles['books-api'], testResults: { passed: 3, failed: 0, total: 3 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, selfReviewCompleted: true, functionalityAligned: true },
        },
        { worktreeBranch: 'w1', filesMerged: [], testResults: { passed: 8, failed: 0, total: 8 }, lintErrors: 0, typecheckErrors: 0, buildSucceeded: true, codeReviewIssues: 0, functionalityAligned: true },
        { integrationTestResults: { passed: 3, failed: 0, total: 3 }, styleConsistency: true, crossAgentConsistency: true, comprehensiveReviewPassed: true },
      );
      expect(gate.allPassed).toBe(true);

      // 4. Generate shared context
      const ctx = generateSharedContext(baseContext, [{ taskId: 'user-model', description: 'User data model', files: taskFiles['user-model'] }]);
      expect(ctx.wordCount).toBeLessThan(2000);
    });
  });

  describe('Metrics', () => {
    it('measures parallel speedup vs serial', () => {
      const plan = analyzeTasks(tasks);
      const serialTasks = 6;
      const parallelWaves = plan.waves.length;
      // Speedup = serialTasks / parallelWaves
      const speedup = serialTasks / parallelWaves;
      // Expect at least 2x speedup
      expect(speedup).toBeGreaterThanOrEqual(2);
    });
  });
});
