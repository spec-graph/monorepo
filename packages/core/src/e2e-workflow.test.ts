import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as automator from './automator/index.js';

const knowledgeBasePath = path.resolve(__dirname, '../../knowledge');

describe('E2E: full workflow integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-e2e-wf-'));
    fs.mkdirSync(path.join(tmpDir, '.spec-graph'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('complete lifecycle: plan → confirm → submit → advance through all stages', () => {
    const intent = 'e2e-add-user-authentication-system-' + Date.now();
    const plan = automator.startSession(intent, tmpDir);

    expect(plan.capabilities.length).toBeGreaterThan(0);
    expect(plan.sessionId).toBeTruthy();

    automator.confirmPlan(plan.sessionId, plan, tmpDir);
    expect(automator.status(plan.sessionId, tmpDir).state).toBe('running');

    // Stage-specific artifact templates (minimal but gate-passing)
    const contents: Record<string, string> = {
      specify: '# Proposal\n\n## Why\nNeed auth\n\n## What Changes\nAdd JWT\n\n## Capabilities\n- `auth`: Auth system\n\n## Impact\nLow\n\n## User Personas\nAdmin\n\n## User Stories\nAs a user, I want to login\n\n## Out of Scope\nPasswordless\n\n## Risks\nLow risk',
      specs: '## Introduction\nTest\n\n### Requirement: Auth\nAuthentication system\n\n#### Scenario: Login\nWHEN user logs in THEN should be authenticated\n\n## Non-Functional Requirements\nSHALL be secure',
      design: '## Context\nAuth system design\n\n## Goals\nAdd JWT\n\n## Non-Goals\nOAuth\n\n## Decisions\n- JWT for stateless auth\n\n## Risks/Trade-offs\nToken expiry trade-off\n\n## Alternatives Considered\nSession-based (not chosen)',
      tasks: '- [x] 1.1 Implement user model\n- [x] 1.2 Implement JWT endpoints\n- [ ] 1.3 Add middleware',
      implement: '# Implement\nsource code here',
    };

    for (const stage of automator.STAGES) {
      const s = automator.status(plan.sessionId, tmpDir);
      if (s.stage !== stage) continue; // May have advanced past this stage

      const output = automator.STAGE_OUTPUTS[stage];
      const artifactPath = `.spec-graph/sessions/${plan.sessionId}/${output.dir}/${output.artifact}`;
      const content = contents[stage] || `# ${stage}\n\nMinimal output for ${stage}.`;

      const result = automator.submitResult(
        plan.sessionId,
        {
          artifacts: [{ path: artifactPath, content }],
          selfCheck: { acceptanceCriteriaMet: true },
        },
        tmpDir,
        knowledgeBasePath,
      );

      expect(result.advanced || result.diagnosis).toBeDefined();
      if (result.done) break;
    }

    const finalStatus = automator.status(plan.sessionId, tmpDir);
    expect(finalStatus.progress.completedArtifacts).toBeGreaterThan(0);
  });

  it('checkpoints after each stage (state persistence)', () => {
    const plan = automator.startSession('e2e-checkpoint-test-' + Date.now(), tmpDir);
    automator.confirmPlan(plan.sessionId, plan, tmpDir);

    automator.submitResult(
      plan.sessionId,
      {
        artifacts: [{
          path: `.spec-graph/sessions/${plan.sessionId}/specify/proposal.md`,
          content: '# Proposal\n\n## Why\nTest why need for this feature goes here\n\n## What Changes\nTest the changes that we need to make\n\n## User Personas\nAdmin persona needs auth\n\n## User Stories\nAs a user, I want to login, so that I can access my data\n\n## Capabilities\n- `auth`: Auth system implementing JWT tokens and middleware\n\n## Impact\nMinimal impact on existing system\n\n## Out of Scope\nOAuth integration and SSO\n\n## Risks\nLow risk — standard auth pattern used widely',
        }],
        selfCheck: { acceptanceCriteriaMet: true },
      },
      tmpDir,
      knowledgeBasePath,
    );

    const statePath = path.join(tmpDir, '.spec-graph', 'sessions', plan.sessionId, 'state.yaml');
    expect(fs.existsSync(statePath)).toBe(true);

    const reloadedStatus = automator.status(plan.sessionId, tmpDir);
    expect(reloadedStatus.sessionId).toBe(plan.sessionId);
    expect(reloadedStatus.progress.completedArtifacts).toBeGreaterThan(0);
  });

  it('intervene force-advance: unblocks stuck workflow', () => {
    const plan = automator.startSession('e2e-force-advance-' + Date.now(), tmpDir);
    automator.confirmPlan(plan.sessionId, plan, tmpDir);

    const initialStage = automator.status(plan.sessionId, tmpDir).stage;

    // Force-advance past current stage
    const result = automator.intervene(plan.sessionId, 'force-advance', undefined, tmpDir);
    expect(result.success).toBe(true);
    expect(result.newStatus.stage).not.toBe(initialStage);
  });

  it('intervene rollback: returns to previous stage', () => {
    const plan = automator.startSession('e2e-rollback-' + Date.now(), tmpDir);
    automator.confirmPlan(plan.sessionId, plan, tmpDir);

    // Advance twice manually
    automator.intervene(plan.sessionId, 'force-advance', undefined, tmpDir);
    automator.intervene(plan.sessionId, 'force-advance', undefined, tmpDir);

    const advancedStage = automator.status(plan.sessionId, tmpDir).stage;
    expect(automator.STAGES.indexOf(advancedStage)).toBe(2);

    // Rollback
    const result = automator.intervene(plan.sessionId, 'rollback', undefined, tmpDir);
    expect(result.success).toBe(true);
    const rolledBackStage = automator.status(plan.sessionId, tmpDir).stage;
    expect(automator.STAGES.indexOf(rolledBackStage)).toBe(1);
  });

  it('reads result from file (--result-file simulation)', () => {
    const plan = automator.startSession('e2e-result-file-' + Date.now(), tmpDir);
    automator.confirmPlan(plan.sessionId, plan, tmpDir);

    const resultFile = path.join(tmpDir, 'result.json');
    const result = {
      artifacts: [{
        path: `.spec-graph/sessions/${plan.sessionId}/specify/proposal.md`,
        content: '# Proposal\n\n## Why\nFile-based\n\n## What Changes\nTest\n\n## Capabilities\n- `auth`: Auth\n\n## Impact\nMinimal',
      }],
      selfCheck: { acceptanceCriteriaMet: true },
    };
    fs.writeFileSync(resultFile, JSON.stringify(result), 'utf-8');

    const readResult = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    const submitResult = automator.submitResult(plan.sessionId, readResult, tmpDir);
    expect(submitResult.advanced || submitResult.diagnosis).toBeDefined();
  });
});
