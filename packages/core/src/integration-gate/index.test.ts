import { describe, it, expect } from 'vitest';
import { runIntegrationGate } from './index.js';

const baseIndividual = {
  task1: {
    taskId: 'task1',
    files: ['src/auth/login.ts'],
    testResults: { passed: 5, failed: 0, total: 5 },
    lintErrors: 0,
    typecheckErrors: 0,
    buildSucceeded: true,
    selfReviewCompleted: true,
    functionalityAligned: true,
  },
};

const baseMerge = {
  worktreeBranch: 'spec-graph/test/task1',
  filesMerged: ['src/auth/login.ts'],
  testResults: { passed: 10, failed: 0, total: 10 },
  lintErrors: 0,
  typecheckErrors: 0,
  buildSucceeded: true,
  codeReviewIssues: 0,
  functionalityAligned: true,
};

const baseSystem = {
  integrationTestResults: { passed: 3, failed: 0, total: 3 },
  e2eTestResults: { passed: 2, failed: 0, total: 2 },
  styleConsistency: true,
  crossAgentConsistency: true,
  comprehensiveReviewPassed: true,
};

describe('integration-gate', () => {
  it('all three levels pass → allPassed: true', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      baseIndividual,
      baseMerge,
      baseSystem
    );
    expect(result.allPassed).toBe(true);
    expect(result.individual.result).toBe('pass');
    expect(result.merge.result).toBe('pass');
    expect(result.system.result).toBe('pass');
  });

  it('individual gate fail → allPassed: false', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      {
        ...baseIndividual,
        task1: { ...baseIndividual.task1, testResults: { passed: 4, failed: 1, total: 5 } },
      },
      baseMerge,
      baseSystem
    );
    expect(result.allPassed).toBe(false);
    expect(result.individual.result).toBe('fail');
    expect(result.individual.failures[0]).toContain('test(s) failed');
  });

  it('merge gate fail when post-merge tests fail', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      baseIndividual,
      {
        ...baseMerge,
        testResults: { passed: 9, failed: 1, total: 10 },
      },
      baseSystem
    );
    expect(result.allPassed).toBe(false);
    expect(result.merge.result).toBe('fail');
  });

  it('merge gate fail when lint errors', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      baseIndividual,
      { ...baseMerge, lintErrors: 3 },
      baseSystem
    );
    expect(result.merge.result).toBe('fail');
    expect(result.merge.failures[0]).toContain('lint error');
  });

  it('system gate fail when style inconsistent', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      baseIndividual,
      baseMerge,
      { ...baseSystem, styleConsistency: false }
    );
    expect(result.allPassed).toBe(false);
    expect(result.system.result).toBe('fail');
  });

  it('system gate fail when integration tests fail', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      baseIndividual,
      baseMerge,
      {
        ...baseSystem,
        integrationTestResults: { passed: 2, failed: 1, total: 3 },
      }
    );
    expect(result.system.result).toBe('fail');
  });

  it('merge gate fail when file conflicts detected', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      {
        // File conflict: both tasks modify same file
        task1: ['src/auth/login.ts'],
        task2: ['src/auth/login.ts'],
      },
      {
        task1: baseIndividual.task1,
        task2: { ...baseIndividual.task1, taskId: 'task2' },
      },
      baseMerge,
      baseSystem
    );
    expect(result.merge.result).toBe('fail');
    expect(result.merge.failures.some((f) => f.includes('File conflicts'))).toBe(true);
  });

  it('individual gate fail when self-review missing', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      {
        ...baseIndividual,
        task1: { ...baseIndividual.task1, selfReviewCompleted: false },
      },
      baseMerge,
      baseSystem
    );
    expect(result.individual.result).toBe('fail');
    expect(result.individual.failures.some((f) => f.includes('self-review'))).toBe(true);
  });

  it('individual gate fail when functionality misaligned', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      {
        ...baseIndividual,
        task1: { ...baseIndividual.task1, functionalityAligned: false },
      },
      baseMerge,
      baseSystem
    );
    expect(result.individual.result).toBe('fail');
    expect(result.individual.failures.some((f) => f.includes('functionality'))).toBe(true);
  });

  it('all three levels must pass — any one failure fails all', () => {
    const result = runIntegrationGate(
      'spec-graph/test/task1',
      ['src/auth/login.ts'],
      { task1: ['src/auth/login.ts'] },
      {
        task1: { ...baseIndividual.task1, typecheckErrors: 1 },
      },
      baseMerge,
      baseSystem
    );
    expect(result.allPassed).toBe(false);
    expect(result.individual.result).toBe('fail');
    expect(result.merge.result).toBe('pass');
    expect(result.system.result).toBe('pass');
  });
});
