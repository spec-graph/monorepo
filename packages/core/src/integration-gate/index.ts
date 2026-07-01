/**
 * Integration Gate — three-level gate for parallel execution reliability.
 *
 * Level 1: Individual Gate (sub-agent's own output)
 * Level 2: Merge Gate (after merging to main)
 * Level 3: System Gate (full integration validation)
 *
 * All three levels must pass for parallel execution to succeed.
 * Any single level failure triggers recovery or degradation to serial.
 */

import { analyzeConflicts } from '../file-conflict-analyzer/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateLevel = 1 | 2 | 3;
export type GateResult = 'pass' | 'fail' | 'skipped';

export interface IndividualGateInput {
  taskId: string;
  files: string[]; // files this sub-agent modified
  testResults: { passed: number; failed: number; total: number };
  lintErrors: number;
  typecheckErrors: number;
  buildSucceeded: boolean;
  selfReviewCompleted: boolean;
  functionalityAligned: boolean; // against specs
}

export interface MergeGateInput {
  worktreeBranch: string;
  filesMerged: string[];
  testResults: { passed: number; failed: number; total: number };
  lintErrors: number;
  typecheckErrors: number;
  buildSucceeded: boolean;
  codeReviewIssues: number;
  functionalityAligned: boolean;
}

export interface SystemGateInput {
  integrationTestResults: { passed: number; failed: number; total: number };
  e2eTestResults?: { passed: number; failed: number; total: number };
  styleConsistency: boolean;
  crossAgentConsistency: boolean;
  comprehensiveReviewPassed: boolean;
}

export interface GateOutput {
  level: GateLevel;
  result: GateResult;
  failures: string[];
  passDetails: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Run all three levels of gate validation on parallel work.
 */
export function runIntegrationGate(
  worktree: string,
  filesMerged: string[],
  allTaskFiles: Record<string, string[]>,
  individualInputs: Record<string, IndividualGateInput>,
  mergeInput: MergeGateInput,
  systemInput: SystemGateInput
): { allPassed: boolean; individual: GateOutput; merge: GateOutput; system: GateOutput } {
  // Level 1: Individual gates (per sub-agent)
  const individualGate = runIndividualGates(individualInputs);

  // Level 2: Merge gate (after merging to main)
  const mergeGate = runMergeGate(mergeInput);

  // Level 3: System gate (full integration)
  const systemGate = runSystemGate(systemInput);

  // If conflict matrix shows file overlaps, also fail merge gate
  const conflictMatrix = analyzeConflicts(allTaskFiles);
  const hasConflicts = Object.entries(conflictMatrix)
    .filter(([key]) => key !== 'impacts') // exclude the impacts map
    .some(([, row]) =>
      Object.values(row as { [taskB: string]: boolean }).some((conflict) => conflict)
    );
  if (hasConflicts) {
    mergeGate.result = 'fail';
    mergeGate.failures.push('File conflicts detected between sub-agents');
  }

  return {
    allPassed:
      individualGate.result === 'pass' &&
      mergeGate.result === 'pass' &&
      systemGate.result === 'pass',
    individual: individualGate,
    merge: mergeGate,
    system: systemGate,
  };
}

function runIndividualGates(inputs: Record<string, IndividualGateInput>): GateOutput {
  const failures: string[] = [];
  const passDetails: string[] = [];

  for (const [taskId, input] of Object.entries(inputs)) {
    if (input.testResults.failed > 0) {
      failures.push(`${taskId}: ${input.testResults.failed} test(s) failed`);
    } else {
      passDetails.push(`${taskId}: all ${input.testResults.total} tests passed`);
    }

    if (input.lintErrors > 0) {
      failures.push(`${taskId}: ${input.lintErrors} lint error(s)`);
    }

    if (input.typecheckErrors > 0) {
      failures.push(`${taskId}: ${input.typecheckErrors} typecheck error(s)`);
    }

    if (!input.buildSucceeded) {
      failures.push(`${taskId}: build failed`);
    }

    if (!input.selfReviewCompleted) {
      failures.push(`${taskId}: self-review missing`);
    }

    if (!input.functionalityAligned) {
      failures.push(`${taskId}: functionality doesn't match specs`);
    }
  }

  return {
    level: 1,
    result: failures.length === 0 ? 'pass' : 'fail',
    failures,
    passDetails,
  };
}

function runMergeGate(input: MergeGateInput): GateOutput {
  const failures: string[] = [];
  const passDetails: string[] = [];

  if (input.testResults.failed > 0) {
    failures.push(`Post-merge: ${input.testResults.failed} test(s) failed`);
  } else if (input.testResults.total > 0) {
    passDetails.push(`Post-merge: all ${input.testResults.total} tests passed`);
  }

  if (input.lintErrors > 0) {
    failures.push(`Post-merge: ${input.lintErrors} lint error(s)`);
  }

  if (input.typecheckErrors > 0) {
    failures.push(`Post-merge: ${input.typecheckErrors} typecheck error(s)`);
  }

  if (!input.buildSucceeded) {
    failures.push('Post-merge: build failed');
  }

  if (input.codeReviewIssues > 0) {
    failures.push(`Post-merge: ${input.codeReviewIssues} code review issue(s)`);
  }

  if (!input.functionalityAligned) {
    failures.push('Post-merge: functionality verification failed');
  }

  return {
    level: 2,
    result: failures.length === 0 ? 'pass' : 'fail',
    failures,
    passDetails,
  };
}

function runSystemGate(input: SystemGateInput): GateOutput {
  const failures: string[] = [];
  const passDetails: string[] = [];

  if (input.integrationTestResults.failed > 0) {
    failures.push(`Integration: ${input.integrationTestResults.failed} test(s) failed`);
  } else if (input.integrationTestResults.total > 0) {
    passDetails.push(`Integration: all ${input.integrationTestResults.total} tests passed`);
  }

  if (input.e2eTestResults) {
    if (input.e2eTestResults.failed > 0) {
      failures.push(`E2E: ${input.e2eTestResults.failed} test(s) failed`);
    } else if (input.e2eTestResults.total > 0) {
      passDetails.push(`E2E: all ${input.e2eTestResults.total} tests passed`);
    }
  }

  if (!input.styleConsistency) {
    failures.push('Style consistency: detected naming/code style mismatch');
  }

  if (!input.crossAgentConsistency) {
    failures.push('Cross-agent consistency: detected interface mismatch');
  }

  if (!input.comprehensiveReviewPassed) {
    failures.push('Comprehensive code review: critical issues found');
  }

  return {
    level: 3,
    result: failures.length === 0 ? 'pass' : 'fail',
    failures,
    passDetails,
  };
}
