import { describe, it, expect } from 'vitest';
import { generateSharedContext, validateContextSize } from './index.js';

const baseContext = {
  profile: {
    language: 'TypeScript',
    framework: 'Express',
    runtime: 'Node.js',
    testFramework: 'vitest',
    brownfield: true,
    existingFeatures: ['HTTP server', 'JWT auth'],
  },
  overview: 'A bookstore API with CRUD operations and JWT auth.',
  methodology: {
    namingConvention: 'camelCase for functions, PascalCase for classes',
    codeStructure: 'Routes in src/routes/, types in src/types/',
    commentStyle: 'JSDoc for public APIs',
    testPattern: 'Vitest + Supertest for HTTP tests',
  },
};

const taskPlans = [
  { taskId: 'A', description: 'User model', files: ['src/auth/user.ts'] },
  { taskId: 'B', description: 'Books endpoints', files: ['src/books/list.ts'] },
];

describe('context-sharing', () => {
  it('generates context with project profile', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    expect(ctx.markdown).toContain('TypeScript');
    expect(ctx.markdown).toContain('Express');
    expect(ctx.markdown).toContain('Node.js');
  });

  it('includes project overview', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    expect(ctx.markdown).toContain('bookstore API');
  });

  it('includes methodology', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    expect(ctx.markdown).toContain('camelCase');
    expect(ctx.markdown).toContain('JSDoc');
  });

  it('includes other agents\' plans (READ-ONLY)', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    expect(ctx.markdown).toContain('READ-ONLY');
    expect(ctx.markdown).toContain('User model');
  });

  it('generates JSON format', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    expect(() => JSON.parse(ctx.json)).not.toThrow();
  });

  it('validates context size under 2000 words', () => {
    const ctx = generateSharedContext(baseContext, taskPlans);
    const result = validateContextSize(ctx);
    expect(result.valid).toBe(true);
  });

  it('handles empty task plans', () => {
    const ctx = generateSharedContext(baseContext, []);
    expect(ctx.markdown).not.toContain('READ-ONLY');
  });
});
