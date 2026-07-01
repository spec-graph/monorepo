import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as core from './index.js';

describe('automator integration', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-test-'));

  afterEach(() => {
    try {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    } catch {}
  });

  it('startSession + confirmPlan transitions to running state', () => {
    const plan = core.automator.startSession('Test feature', projectRoot);
    expect(plan.sessionId).toBe('test-feature');
    expect(plan.capabilities.length).toBeGreaterThan(0);

    const beforeConfirm = core.automator.status(plan.sessionId, projectRoot);
    expect(beforeConfirm.state).toBe('paused');

    core.automator.confirmPlan(plan.sessionId, plan, projectRoot);

    const afterConfirm = core.automator.status(plan.sessionId, projectRoot);
    expect(afterConfirm.state).toBe('running');
    expect(afterConfirm.stage).toBe('specify');
  });

  it('nextPrompt generates XML prompt with woven methodologies', () => {
    const plan = core.automator.startSession('Add auth feature', projectRoot);
    core.automator.confirmPlan(plan.sessionId, plan, projectRoot);

    const prompt = core.automator.nextPrompt(plan.sessionId, projectRoot);

    expect(prompt.xml).toContain('<?xml version="1.0"');
    expect(prompt.xml).toContain('spec_graph_prompt');
    expect(prompt.xml).toContain('stage="specify"');
    expect(prompt.xml).toContain('level="MUST"');
    expect(prompt.xml).toContain('level="SHOULD"');
    expect(prompt.stage).toBe('specify');
  });

  it('submitResult advances stage when gate passes', () => {
    const plan = core.automator.startSession('Test advance', projectRoot);
    core.automator.confirmPlan(plan.sessionId, plan, projectRoot);

    // Build a proposal that passes all exit criteria
    const filler = 'This improves the system by adding security and user trust across the platform. ';
    const proposal = [
      '# Proposal: Test Advance',
      '',
      '## Why',
      'We need this feature.',
      filler.repeat(30),
      '',
      '## What Changes',
      '- Add feature X',
      '',
      '## User Personas',
      '### Primary: User',
      '- Goal: do something',
      '',
      '## User Stories',
      '### US-001: Login',
      'As a user, I want to log in so that I can access my data.',
      '',
      '## Capabilities',
      '- `test-cap`: Test capability (US-001)',
      '',
      '## Impact',
      'New dependencies',
      '',
      '## Out of Scope',
      'Other things',
    ].join('\n');

    const result = core.automator.submitResult(
      plan.sessionId,
      {
        artifacts: [{
          path: path.join(projectRoot, '.spec-graph/sessions/test-advance/specify/proposal.md'),
          content: proposal,
        }],
      },
      projectRoot
    );

    expect(result.advanced).toBe(true);
    // The next stage depends on STAGES order; after 'specify' comes the next stage
    const specifyIndex = core.automator.STAGES.indexOf('specify');
    const expectedNextStage = core.automator.STAGES[specifyIndex + 1];
    expect(result.nextStage).toBe(expectedNextStage);
    expect(result.done).toBe(false);

    const status = core.automator.status(plan.sessionId, projectRoot);
    expect(status.stage).toBe(expectedNextStage);
    expect(status.progress.currentStageIndex).toBe(specifyIndex + 1);
  });

  it('submitResult produces diagnosis when gate fails', () => {
    const plan = core.automator.startSession('Test failure', projectRoot);
    core.automator.confirmPlan(plan.sessionId, plan, projectRoot);

    const result = core.automator.submitResult(
      plan.sessionId,
      {
        artifacts: [{
          path: path.join(projectRoot, '.spec-graph/sessions/test-failure/specify/proposal.md'),
          content: '# Bad Proposal\n\nThis is too short.',
        }],
      },
      projectRoot
    );

    expect(result.advanced).toBe(false);
    expect(result.diagnosis).toBeDefined();
    expect(result.diagnosis?.failedCriteria.length).toBeGreaterThan(0);
  });

  it('listSessions returns active sessions', () => {
    core.automator.startSession('Session A', projectRoot);
    core.automator.startSession('Session B', projectRoot);

    const sessions = core.automator.listSessions(projectRoot);
    expect(sessions).toContain('session-a');
    expect(sessions).toContain('session-b');
  });
});

describe('knowledge-base integration', () => {
  it('loads all skills', () => {
    const kb = core.knowledgeBase.loadKnowledgeBase();
    expect(kb.skills.size).toBeGreaterThan(16);
  });

  it('each stage has at least one skill', () => {
    const kb = core.knowledgeBase.loadKnowledgeBase();
    for (const stage of kb.stages) {
      const skills = core.knowledgeBase.getSkillsForStage(kb, stage);
      expect(skills.length).toBeGreaterThan(0);
    }
  });

  it('selectSkill returns appropriate skill for stage', () => {
    const kb = core.knowledgeBase.loadKnowledgeBase();
    const specifySkill = core.knowledgeBase.selectSkill(kb, 'specify', 'Add JWT auth');
    expect(specifySkill).not.toBeNull();
    expect(specifySkill?.stage).toBe('specify');
  });

  it('skill instruction.md content is non-empty', () => {
    const kb = core.knowledgeBase.loadKnowledgeBase();
    for (const [, skill] of kb.skills) {
      expect(skill.instruction.length).toBeGreaterThan(100);
    }
  });
});
