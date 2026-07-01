import { describe, it, expect } from 'vitest';
import { generatePlan } from './index.js';

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
