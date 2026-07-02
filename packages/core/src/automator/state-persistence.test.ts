import { describe, it, expect } from 'vitest';
import { automator } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const { _test } = automator as any;
const formatStateYaml = _test?.formatStateYaml as (data: any) => string;
const parseStateYaml = _test?.parseStateYaml as (yaml: string) => any;

// Build a minimal SessionData for round-trip tests
function makeSessionData(overrides: Partial<any> = {}): any {
  return {
    sessionId: 'test-roundtrip',
    intent: 'Build a login page',
    stage: 'design',
    state: 'running',
    retryCount: 2,
    readyForArchive: false,
    plan: {
      sessionId: 'test-roundtrip',
      intent: 'Build a login page',
      capabilities: [
        { id: 'auth-form', description: 'Create login form component', dependsOn: [] },
        { id: 'auth-api', description: 'Create auth API endpoint', dependsOn: ['auth-form'] },
        { id: 'auth-test', description: 'Add auth E2E tests', dependsOn: ['auth-form', 'auth-api'] },
      ],
      order: ['auth-form', 'auth-api', 'auth-test'],
      complexity: 'medium',
      risks: ['Security vulnerability in token storage', 'CSRF protection needed'],
      openQuestions: ['Should we support OAuth as well?'],
    },
    completedArtifacts: ['specify/proposal.md', 'design/design.md'],
    trace: [
      { timestamp: '2026-07-01T10:00:00.000Z', toStage: 'specify', trigger: 'user-force' as const },
      { timestamp: '2026-07-01T11:00:00.000Z', toStage: 'design', trigger: 'gate-pass' as const },
    ],
    previousDiagnoses: [
      {
        gateId: 'specify-exit',
        retryLevel: 1 as const,
        similarToPrevious: false,
        failedCriteria: [
          { id: 'proposal-structure', reason: 'Missing Capabilities section' },
        ],
      },
      {
        gateId: 'design-exit',
        retryLevel: 2 as const,
        similarToPrevious: false,
        failedCriteria: [
          { id: 'design-decisions', reason: 'No trade-off analysis found' },
          { id: 'design-risks', reason: 'Risk section too brief (<50 words)' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('State Persistence', () => {
  // ── Task 1.3: round-trip ─────────────────────────────────────────

  it('1.3 round-trip: write → read → all fields match', () => {
    const original = makeSessionData();
    const yaml = formatStateYaml(original);
    const restored = parseStateYaml(yaml);

    // Top-level fields
    expect(restored.sessionId).toBe(original.sessionId);
    expect(restored.intent).toBe(original.intent);
    expect(restored.stage).toBe(original.stage);
    expect(restored.state).toBe(original.state);
    expect(restored.retryCount).toBe(2);
    expect(restored.readyForArchive).toBe(false);

    // Plan fields
    expect(restored.plan).toBeDefined();
    expect(restored.plan.sessionId).toBe(original.plan.sessionId);
    expect(restored.plan.intent).toBe(original.plan.intent);
    expect(restored.plan.complexity).toBe('medium');
    expect(restored.plan.order).toEqual(['auth-form', 'auth-api', 'auth-test']);

    // Capabilities
    expect(restored.plan.capabilities).toHaveLength(3);
    expect(restored.plan.capabilities[0].id).toBe('auth-form');
    expect(restored.plan.capabilities[0].dependsOn).toEqual([]);
    expect(restored.plan.capabilities[1].id).toBe('auth-api');
    expect(restored.plan.capabilities[1].dependsOn).toEqual(['auth-form']);
    expect(restored.plan.capabilities[2].id).toBe('auth-test');
    expect(restored.plan.capabilities[2].dependsOn).toEqual(['auth-form', 'auth-api']);

    // Risks
    expect(restored.plan.risks).toHaveLength(2);
    expect(restored.plan.risks[0]).toContain('Security');

    // openQuestions
    expect(restored.plan.openQuestions).toHaveLength(1);
    expect(restored.plan.openQuestions[0]).toContain('OAuth');

    // Completed artifacts
    expect(restored.completedArtifacts).toEqual(['specify/proposal.md', 'design/design.md']);

    // Previous diagnoses
    expect(restored.previousDiagnoses).toHaveLength(2);
    expect(restored.previousDiagnoses[0].retryLevel).toBe(1);
    expect(restored.previousDiagnoses[0].gateId).toBe('specify-exit');
    expect(restored.previousDiagnoses[0].failedCriteria).toHaveLength(1);
    expect(restored.previousDiagnoses[0].failedCriteria[0].id).toBe('proposal-structure');
    expect(restored.previousDiagnoses[1].retryLevel).toBe(2);
    expect(restored.previousDiagnoses[1].gateId).toBe('design-exit');
    expect(restored.previousDiagnoses[1].failedCriteria).toHaveLength(2);

    // Trace
    expect(restored.trace).toHaveLength(2);
    expect(restored.trace[0].toStage).toBe('specify');
    expect(restored.trace[0].trigger).toBe('user-force');
    expect(restored.trace[1].toStage).toBe('design');
    expect(restored.trace[1].trigger).toBe('gate-pass');
  });

  // ── Task 1.4: dependsOn ──────────────────────────────────────────

  it('1.4 parser restores dependsOn for 3 capabilities with dependencies', () => {
    const data = makeSessionData();
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);

    expect(restored.plan.capabilities).toHaveLength(3);
    expect(restored.plan.capabilities[0].dependsOn).toEqual([]);
    expect(restored.plan.capabilities[1].dependsOn).toEqual(['auth-form']);
    expect(restored.plan.capabilities[2].dependsOn).toEqual(['auth-form', 'auth-api']);
  });

  // ── Task 1.5: previousDiagnoses ──────────────────────────────────

  it('1.5 parser restores retryLevel and failedCriteria for diagnoses', () => {
    const data = makeSessionData();
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);

    expect(restored.previousDiagnoses).toHaveLength(2);

    const d1 = restored.previousDiagnoses[0];
    expect(d1.retryLevel).toBe(1);
    expect(d1.similarToPrevious).toBe(false);
    expect(d1.failedCriteria).toHaveLength(1);
    expect(d1.failedCriteria[0].id).toBe('proposal-structure');
    expect(d1.failedCriteria[0].reason).toBe('Missing Capabilities section');

    const d2 = restored.previousDiagnoses[1];
    expect(d2.retryLevel).toBe(2);
    expect(d2.similarToPrevious).toBe(false);
    expect(d2.failedCriteria).toHaveLength(2);
    expect(d2.failedCriteria[0].id).toBe('design-decisions');
    expect(d2.failedCriteria[1].id).toBe('design-risks');
  });

  // ── Task 1.6: plan.order ─────────────────────────────────────────

  it('1.6 parser restores plan.order array', () => {
    const data = makeSessionData({
      plan: {
        ...makeSessionData().plan,
        order: ['ui', 'api', 'db', 'tests'],
        capabilities: [
          { id: 'ui', description: 'UI work', dependsOn: [] },
          { id: 'api', description: 'API work', dependsOn: ['ui'] },
          { id: 'db', description: 'DB work', dependsOn: [] },
          { id: 'tests', description: 'Testing', dependsOn: ['api', 'db'] },
        ],
      },
    });
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);

    expect(restored.plan.order).toEqual(['ui', 'api', 'db', 'tests']);
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it('empty completedArtifacts round-trips as empty array', () => {
    const data = makeSessionData({ completedArtifacts: [] });
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);
    expect(restored.completedArtifacts).toEqual([]);
  });

  it('empty previousDiagnoses round-trips as empty array', () => {
    const data = makeSessionData({ previousDiagnoses: [] });
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);
    expect(restored.previousDiagnoses).toEqual([]);
  });

  it('readyForArchive true round-trips', () => {
    const data = makeSessionData({ readyForArchive: true });
    const yaml = formatStateYaml(data);
    const restored = parseStateYaml(yaml);
    expect(restored.readyForArchive).toBe(true);
  });

  // ── Bug fix verification: force-advance preserves completed artifacts ──

  it('formatStateYaml includes artifacts added by force-advance', () => {
    const data = makeSessionData({
      stage: 'design',
      completedArtifacts: ['specify/proposal.md', 'design/design.md'],
    });
    const yaml = formatStateYaml(data);

    // Both artifacts should be in the YAML output
    expect(yaml).toContain('specify/proposal.md');
    expect(yaml).toContain('design/design.md');
  });

  // ── Bug fix verification: rollback removes artifact from completed list ──

  it('formatStateYaml excludes artifacts removed by rollback', () => {
    const data = makeSessionData({
      stage: 'specify',
      // After rollback from design → specify, design/design.md was filtered out
      completedArtifacts: ['specify/proposal.md'],
    });
    const yaml = formatStateYaml(data);

    expect(yaml).toContain('specify/proposal.md');
    expect(yaml).not.toContain('design/design.md');
  });
});
