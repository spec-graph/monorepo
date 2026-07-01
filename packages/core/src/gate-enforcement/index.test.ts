import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  loadGateConfig,
  evaluateGate,
  diagnoseFailure,
  nextRetryLevel,
  type EvaluationContext,
} from './index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const KNOWLEDGE_PATH = path.join(__dirname, '..', '..', 'knowledge');

function makeContext(
  artifacts: Record<string, string>,
  traceEdges: Record<string, string[]> = {}
): EvaluationContext {
  return {
    projectRoot: os.tmpdir(),
    stage: 'specify',
    artifactFiles: Object.fromEntries(
      Object.keys(artifacts).map((k) => [k, `/tmp/${k}.md`])
    ),
    artifactContents: artifacts,
    traceEdges,
  };
}

// ---------------------------------------------------------------------------
// loadGateConfig
// ---------------------------------------------------------------------------

describe('loadGateConfig', () => {
  it('loads gate.yaml for specify stage with exit criteria', () => {
    const config = loadGateConfig('specify', KNOWLEDGE_PATH);
    expect(config.exit).toBeDefined();
    expect(config.exit.length).toBeGreaterThan(0);
  });

  it('loads all 8 stage configs with exit criteria', () => {
    const stages = [
      'specify', 'design', 'plan', 'implement',
      'review', 'test', 'accept', 'integrate',
    ];
    for (const stage of stages) {
      const config = loadGateConfig(stage, KNOWLEDGE_PATH);
      expect(config.exit.length).toBeGreaterThan(0);
    }
  });

  it('returns fallback for unknown stage', () => {
    const config = loadGateConfig('non-existent-stage', KNOWLEDGE_PATH);
    expect(config.exit).toBeDefined();
    expect(config.exit.length).toBeGreaterThan(0);
  });

  it('returns fallback when path does not exist', () => {
    const config = loadGateConfig('specify', '/non/existent/path');
    expect(config.exit.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateGate
// ---------------------------------------------------------------------------

describe('evaluateGate', () => {
  describe('specify stage', () => {
    // Build a proposal with 200+ words to pass proposal-length
    const filler = 'We need this because it improves security, user trust, and data protection across the platform. ';
    const goodProposal = [
      '# Proposal: Add Auth',
      '',
      '## Why',
      'The system needs authentication to protect write operations.',
      filler.repeat(30), // ~300 words
      '',
      '## What Changes',
      '- Add JWT authentication endpoints',
      '- Add auth middleware',
      '',
      '## User Personas',
      '',
      '### Primary: Customer',
      '- Wants to protect their data',
      '- Values security',
      '',
      '## User Stories',
      '',
      '### US-001: User can log in',
      'As a customer, I want to log in so that I can access my account.',
      '',
      '## Capabilities',
      '',
      '- `user-auth`: Authentication (US-001)',
      '- `auth-middleware`: Middleware (US-001)',
      '',
      '## Impact',
      'New dependencies: bcrypt, jsonwebtoken',
      '',
      '## Out of Scope',
      'OAuth integration, MFA',
    ].join('\n');

    it('passes exit gate for a complete proposal', () => {
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal: goodProposal }),
        KNOWLEDGE_PATH
      );
      expect(result.passed).toBe(true);
      expect(result.evaluatedCriteria.every((c) => c.passed)).toBe(true);
    });

    it('fails when proposal-structure is incomplete', () => {
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal: '# Bad\n\nMissing sections' }),
        KNOWLEDGE_PATH
      );
      expect(result.passed).toBe(false);
      const structureFail = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'proposal-structure'
      );
      expect(structureFail?.passed).toBe(false);
    });

    it('fails when capabilities not enumerated', () => {
      const proposal = [
        '## Why', 'x',
        '## What Changes', 'x',
        '## Capabilities', 'no items here',
        '## Impact', 'x',
      ].join('\n');
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      expect(result.passed).toBe(false);
      const capFail = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'capabilities-enumerated'
      );
      expect(capFail?.passed).toBe(false);
    });

    it('accepts backtick format capabilities', () => {
      const proposal = [
        '## Why', 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(10),
        '## What Changes', 'x',
        '## Capabilities',
        '- `user-auth`: Auth',
        '## Impact', 'x',
      ].join('\n');
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const capResult = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'capabilities-enumerated'
      );
      expect(capResult?.passed).toBe(true);
    });

    it('accepts bold format capabilities', () => {
      const proposal = [
        '## Why', 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(10),
        '## What Changes', 'x',
        '## Capabilities',
        '- **user-auth**: Auth',
        '## Impact', 'x',
      ].join('\n');
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const capResult = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'capabilities-enumerated'
      );
      expect(capResult?.passed).toBe(true);
    });
  });

  describe('Layer 3 quality criteria', () => {
    it('proposal-length: passes when 200-1500 words', () => {
      const proposal = 'word '.repeat(500); // 500 words
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const len = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'proposal-length'
      );
      expect(len?.passed).toBe(true);
    });

    it('proposal-length: fails when too short', () => {
      const proposal = 'word '.repeat(50); // 50 words
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const len = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'proposal-length'
      );
      expect(len?.passed).toBe(false);
    });

    it('focuses-on-why: passes when Why comes before What Changes', () => {
      const proposal = '## Why\nx\n\n## What Changes\ny';
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const focus = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'focuses-on-why'
      );
      expect(focus?.passed).toBe(true);
    });

    it('focuses-on-why: fails when What Changes comes first', () => {
      const proposal = '## What Changes\nx\n\n## Why\ny';
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const focus = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'focuses-on-why'
      );
      expect(focus?.passed).toBe(false);
    });
  });

  describe('Layer 1 user perspective criteria', () => {
    it('user-personas-defined: passes when section exists', () => {
      const proposal = '## User Personas\n### Primary: User\n- Goal';
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const personas = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'user-personas-defined'
      );
      expect(personas?.passed).toBe(true);
    });

    it('user-stories-present: passes with User Stories section', () => {
      const proposal = '## User Stories\n### US-001: Login\nAs a user...';
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const stories = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'user-stories-present'
      );
      expect(stories?.passed).toBe(true);
    });

    it('user-stories-present: passes with inline story format', () => {
      const proposal = 'As a customer, I want to log in, so that I can...';
      const result = evaluateGate(
        'specify', 'exit',
        makeContext({ proposal }),
        KNOWLEDGE_PATH
      );
      const stories = result.evaluatedCriteria.find(
        (c) => c.criterion.id === 'user-stories-present'
      );
      expect(stories?.passed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// diagnoseFailure
// ---------------------------------------------------------------------------

describe('diagnoseFailure', () => {
  const failedGate = {
    passed: false,
    evaluatedCriteria: [
      { criterion: { id: 'proposal-structure', description: '', verificationMethod: 'rule' as const }, passed: false, reason: 'Missing sections' },
      { criterion: { id: 'capabilities-enumerated', description: '', verificationMethod: 'rule' as const }, passed: false, reason: 'No capabilities' },
    ],
  };

  it('produces diagnosis with retry level 1 on first failure', () => {
    const diag = diagnoseFailure(failedGate, []);
    expect(diag.retryLevel).toBe(1);
    expect(diag.similarToPrevious).toBe(false);
    expect(diag.failedCriteria.length).toBe(2);
  });

  it('increments retry level on subsequent failures', () => {
    const prev = diagnoseFailure(failedGate, []);
    const next = diagnoseFailure(failedGate, [prev]);
    expect(next.retryLevel).toBe(2);
  });

  it('detects similar failures using Jaccard similarity', () => {
    const prev = diagnoseFailure(failedGate, []);
    const same = diagnoseFailure(failedGate, [prev]);
    expect(same.similarToPrevious).toBe(true);
  });

  it('detects dissimilar failures', () => {
    const prev = diagnoseFailure(failedGate, []);
    const differentGate = {
      passed: false,
      evaluatedCriteria: [
        { criterion: { id: 'completely-different', description: '', verificationMethod: 'rule' as const }, passed: false, reason: 'X' },
      ],
    };
    const next = diagnoseFailure(differentGate, [prev]);
    expect(next.similarToPrevious).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// nextRetryLevel
// ---------------------------------------------------------------------------

describe('nextRetryLevel', () => {
  it('increments from level 1 to 2', () => {
    expect(nextRetryLevel(1)).toBe(2);
  });

  it('increments from level 2 to 3', () => {
    expect(nextRetryLevel(2)).toBe(3);
  });

  it('increments from level 3 to 4', () => {
    expect(nextRetryLevel(3)).toBe(4);
  });

  it('returns null after level 4 (escalation)', () => {
    expect(nextRetryLevel(4)).toBeNull();
  });
});
