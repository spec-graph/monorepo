import { describe, it, expect } from 'vitest';
import { runIntegrationGate } from './index.js';

const baseIndividual = {
  taskId: 'task1',
  files: ['src/auth/login.ts'],
  testResults: { passed: 5, failed: 0, total: 5 },
  lintErrors: 0,
  typecheckErrors: 0,
  buildSucceeded: true,
  selfReviewCompleted: true,
  functionalityAligned: true,
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
      { task1: ['src/auth/login.ts'] },
      { task1: baseIndividual },
      baseMerge,
      baseSystem,
    );
    expect(result.allPassed).toBe(true);
  });

  it('individual gate fail when tests fail', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'] },
      { task1: { ...baseIndividual, testResults: { passed: 4, failed: 1, total: 5 } } },
      baseMerge,
      baseSystem,
    );
    expect(result.allPassed).toBe(false);
    expect(result.individual.result).toBe('fail');
  });

  it('merge gate fail when lint errors', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'] },
      { task1: baseIndividual },
      { ...baseMerge, lintErrors: 3 },
      baseSystem,
    );
    expect(result.merge.result).toBe('fail');
  });

  it('system gate fail when style inconsistent', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'] },
      { task1: baseIndividual },
      baseMerge,
      { ...baseSystem, styleConsistency: false },
    );
    expect(result.system.result).toBe('fail');
  });

  it('merge gate fail on file conflicts', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'], task2: ['src/auth/login.ts'] },
      { task1: baseIndividual, task2: { ...baseIndividual, taskId: 'task2' } },
      baseMerge,
      baseSystem,
    );
    expect(result.merge.result).toBe('fail');
  });

  it('individual gate fail when self-review missing', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'] },
      { task1: { ...baseIndividual, selfReviewCompleted: false } },
      baseMerge,
      baseSystem,
    );
    expect(result.individual.result).toBe('fail');
  });

  it('individual gate fail when functionality misaligned', () => {
    const result = runIntegrationGate(
      { task1: ['src/auth/login.ts'] },
      { task1: { ...baseIndividual, functionalityAligned: false } },
      baseMerge,
      baseSystem,
    );
    expect(result.individual.result).toBe('fail');
  });
});
