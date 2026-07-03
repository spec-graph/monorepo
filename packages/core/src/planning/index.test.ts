import { describe, it, expect } from 'vitest';
import { generatePlan, generatePlanFallback, generatePlanningManifest, validatePlanOutput } from './index.js';

describe('generatePlan', () => {
  describe('intent decomposition', () => {
    it('decomposes auth intent into auth capabilities', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      expect(plan.capabilities.length).toBeGreaterThan(0);
      const ids = plan.capabilities.map((c) => c.id);
      expect(ids).toContain('user-model');
      expect(ids).toContain('auth-endpoints');
      expect(ids).toContain('auth-middleware');
    });

    it('decomposes api intent into api capabilities', () => {
      const plan = generatePlan({ intent: 'Build a REST API' });
      const ids = plan.capabilities.map((c) => c.id);
      expect(ids).toContain('api-endpoints');
      expect(ids).toContain('request-validation');
    });

    it('decomposes db intent into database capabilities', () => {
      const plan = generatePlan({ intent: 'Design the db schema' });
      const ids = plan.capabilities.map((c) => c.id);
      expect(ids).toContain('data-model');
    });

    it('decomposes refactor intent into refactor capabilities', () => {
      const plan = generatePlan({ intent: 'Refactor the user module' });
      const ids = plan.capabilities.map((c) => c.id);
      expect(ids).toContain('extract-module');
      expect(ids).toContain('interface-definition');
    });

    it('handles multiple keyword matches', () => {
      const plan = generatePlan({ intent: 'Add JWT auth to the REST API' });
      const ids = plan.capabilities.map((c) => c.id);
      // Should have both auth and api capabilities
      expect(ids).toContain('user-model');
      expect(ids).toContain('api-endpoints');
    });

    it('creates generic capability for unknown intents', () => {
      const plan = generatePlan({ intent: 'Fix the random bug nobody understands' });
      expect(plan.capabilities.length).toBe(1);
      expect(plan.capabilities[0].id).toMatch(/^fix-the-random/);
    });
  });

  describe('session id generation', () => {
    it('generates kebab-case session id from intent', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      expect(plan.sessionId).toBe('add-jwt-authentication');
    });

    it('truncates long session ids to 64 chars', () => {
      const longIntent = 'a '.repeat(50).trim(); // 100 chars
      const plan = generatePlan({ intent: longIntent });
      expect(plan.sessionId.length).toBeLessThanOrEqual(64);
    });

    it('removes special characters', () => {
      const plan = generatePlan({ intent: 'Add JWT auth + refresh!' });
      expect(plan.sessionId).not.toMatch(/[+!]/);
    });
  });

  describe('topological ordering', () => {
    it('respects dependencies in order', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      const order = plan.order;
      const userModelIdx = order.indexOf('user-model');
      const authEndpointsIdx = order.indexOf('auth-endpoints');
      expect(userModelIdx).toBeLessThan(authEndpointsIdx);
    });

    it('includes all capabilities in order', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      expect(plan.order.length).toBe(plan.capabilities.length);
      for (const cap of plan.capabilities) {
        expect(plan.order).toContain(cap.id);
      }
    });
  });

  describe('complexity estimation', () => {
    it('low complexity for 1-2 capabilities', () => {
      const plan = generatePlan({ intent: 'Add a config file' });
      expect(plan.complexity).toBe('low');
    });

    it('medium complexity for 3-6 capabilities', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication to the API' });
      expect(['low', 'medium']).toContain(plan.complexity);
    });

    it('high complexity for large plans', () => {
      const plan = generatePlan({
        intent: 'Build a full authentication system with database, API, UI, tests, deployment, and security hardening',
      });
      expect(['medium', 'high']).toContain(plan.complexity);
    });
  });

  describe('risk identification', () => {
    it('flags security-sensitive intent', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      const hasSecurityRisk = plan.risks.some(
        (r) => r.toLowerCase().includes('security')
      );
      expect(hasSecurityRisk).toBe(true);
    });

    it('flags refactor risk', () => {
      const plan = generatePlan({ intent: 'Refactor the user module' });
      const hasRefactorRisk = plan.risks.some(
        (r) => r.toLowerCase().includes('regression') || r.toLowerCase().includes('refactor')
      );
      expect(hasRefactorRisk).toBe(true);
    });

    it('returns low-risk note for simple intents', () => {
      const plan = generatePlan({ intent: 'Add a simple config file' });
      const hasLowRisk = plan.risks.some(
        (r) => r.toLowerCase().includes('low-risk')
      );
      expect(hasLowRisk).toBe(true);
    });
  });

  describe('capability descriptions', () => {
    it('each capability has a description', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      for (const cap of plan.capabilities) {
        expect(cap.description).toBeDefined();
        expect(cap.description.length).toBeGreaterThan(0);
      }
    });

    it('each capability has a dependsOn array', () => {
      const plan = generatePlan({ intent: 'Add JWT authentication' });
      for (const cap of plan.capabilities) {
        expect(Array.isArray(cap.dependsOn)).toBe(true);
      }
    });
  });
});

describe('generatePlanFallback', () => {
  it('produces same output as generatePlan', () => {
    const input = { intent: 'Add JWT authentication' };
    const a = generatePlan(input);
    const b = generatePlanFallback(input);
    expect(a).toEqual(b);
  });

  it('works offline (no LLM call)', () => {
    const plan = generatePlanFallback({ intent: 'Build auth system' });
    expect(plan.capabilities.length).toBeGreaterThan(0);
    expect(plan.order.length).toBe(plan.capabilities.length);
  });
});

describe('generatePlanningManifest', () => {
  it('returns manifest with required fields', () => {
    const manifest = generatePlanningManifest({ intent: 'Build auth system' });
    expect(manifest.version).toBe('1');
    expect(manifest.type).toBe('planning');
    expect(manifest.intent).toBe('Build auth system');
    expect(manifest.agent_config.agent_id).toBe('planner');
    expect(manifest.agent_config.model_tier).toBe('capable');
    expect(manifest.schema).toBeDefined();
    expect(manifest.prompt).toBeDefined();
    expect(manifest.next_step).toBeDefined();
  });

  it('prompt contains intent', () => {
    const manifest = generatePlanningManifest({ intent: 'Build WebSocket service' });
    expect(manifest.prompt).toContain('Build WebSocket service');
  });

  it('prompt contains schema', () => {
    const manifest = generatePlanningManifest({ intent: 'Build auth' });
    expect(manifest.prompt).toContain('capabilities');
    expect(manifest.prompt).toContain('complexity');
  });

  it('prompt contains example', () => {
    const manifest = generatePlanningManifest({ intent: 'Build auth' });
    expect(manifest.prompt).toContain('user-model');
    expect(manifest.prompt).toContain('auth-endpoints');
  });

  it('next_step references confirm', () => {
    const manifest = generatePlanningManifest({ intent: 'Build auth system' });
    expect(manifest.next_step).toContain('spec-graph confirm');
  });
});

describe('validatePlanOutput', () => {
  it('accepts valid plan JSON', () => {
    const json = {
      capabilities: [
        { id: 'user-model', description: 'User data model with email and password', dependsOn: [] },
        { id: 'auth-endpoints', description: 'Registration and login endpoints', dependsOn: ['user-model'] },
      ],
      order: ['user-model', 'auth-endpoints'],
      complexity: 'medium',
      risks: ['security risk'],
      openQuestions: [],
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validatePlanOutput(null).valid).toBe(false);
    expect(validatePlanOutput('string').valid).toBe(false);
    expect(validatePlanOutput([]).valid).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = validatePlanOutput({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'capabilities')).toBe(true);
    expect(result.errors.some((e) => e.field === 'order')).toBe(true);
    expect(result.errors.some((e) => e.field === 'complexity')).toBe(true);
  });

  it('rejects invalid capability id format', () => {
    const json = {
      capabilities: [{ id: 'UPPERCASE', description: 'A description that is long enough', dependsOn: [] }],
      order: ['UPPERCASE'],
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('id'))).toBe(true);
  });

  it('rejects duplicate capability ids', () => {
    const json = {
      capabilities: [
        { id: 'auth', description: 'First capability description', dependsOn: [] },
        { id: 'auth', description: 'Second capability description', dependsOn: [] },
      ],
      order: ['auth'],
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects short descriptions', () => {
    const json = {
      capabilities: [{ id: 'auth', description: 'short', dependsOn: [] }],
      order: ['auth'],
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('description'))).toBe(true);
  });

  it('rejects dependsOn references to non-existent capabilities', () => {
    const json = {
      capabilities: [{ id: 'auth', description: 'Auth capability description', dependsOn: ['nonexistent'] }],
      order: ['auth'],
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
  });

  it('rejects invalid complexity values', () => {
    const json = {
      capabilities: [{ id: 'auth', description: 'Auth capability description', dependsOn: [] }],
      order: ['auth'],
      complexity: 'extreme',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'complexity')).toBe(true);
  });

  it('rejects empty capabilities array', () => {
    const json = {
      capabilities: [],
      order: [],
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
  });

  it('rejects order that is not a permutation', () => {
    const json = {
      capabilities: [
        { id: 'auth', description: 'Auth capability description', dependsOn: [] },
        { id: 'db', description: 'Database capability description', dependsOn: [] },
      ],
      order: ['auth'], // missing 'db'
      complexity: 'low',
    };
    const result = validatePlanOutput(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'order')).toBe(true);
  });
});
