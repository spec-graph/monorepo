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

  it('submitResult advances stage when gate passes', () => {
    const plan = core.automator.startSession('Test advance', projectRoot);
    core.automator.confirmPlan(plan.sessionId, plan, projectRoot);

    // Build a proposal that passes all specify exit criteria
    const filler = 'This project aims to deliver a robust and scalable solution that meets the needs of our users. ';
    const proposal = [
      '# Proposal: Test Advance',
      '',
      '## Why',
      'We need this feature to improve the system. Users currently lack authentication capabilities, which means sensitive data is exposed without proper access controls. This creates security risks and compliance issues that must be addressed. ' + filler.repeat(10),
      '',
      '## What Changes',
      '- Add an authentication module with JWT-based token management',
      '- Implement login and registration endpoints',
      '- Add middleware for protecting authenticated routes',
      '- Create user model with password hashing',
      '',
      '## User Personas',
      '',
      '### Primary: Developer',
      '- Characteristics: Software engineer building APIs, familiar with REST patterns, needs reliable authentication for their applications',
      '- Goals: Wants to protect API endpoints, needs simple integration with existing systems, values security best practices',
      '',
      '### Secondary: End User',
      '- Characteristics: Uses the application daily, expects seamless login experience, concerned about data privacy',
      '- Goals: Wants to access their data securely, needs password reset functionality, values fast authentication',
      '',
      '## User Stories',
      '',
      '### US-001: User Registration',
      'As a new user, I want to create an account with my email and password so that I can access the application securely.',
      '',
      '### US-002: User Login',
      'As a registered user, I want to log in with my credentials so that I can access my protected data.',
      '',
      '## Capabilities',
      '- `user-auth`: User authentication system including registration, login, and token management (US-001, US-002)',
      '- `auth-middleware`: Middleware for protecting routes with JWT verification',
      '',
      '## Impact',
      '- Security: Adds authentication layer protecting all existing endpoints',
      '- Performance: JWT verification adds minimal overhead per request',
      '- Dependencies: Requires jsonwebtoken and bcrypt packages',
      '',
      '## Out of Scope',
      '- Social login (Google, GitHub OAuth)',
      '- Multi-factor authentication',
      '- Role-based access control',
      '- Passwordless authentication',
      '',
      '## Risks',
      '- Security vulnerability if JWT secret is exposed',
      '- Performance impact if token verification is not cached',
      '- Migration complexity for existing users without accounts',
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
    // After 'specify' comes 'specs'
    const specifyIndex = core.automator.STAGES.indexOf('specify');
    const expectedNextStage = core.automator.STAGES[specifyIndex + 1];
    expect(expectedNextStage).toBe('specs');
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
