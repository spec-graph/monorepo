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
    const context = generateSharedContext(baseContext, taskPlans);
    expect(context.markdown).toContain('TypeScript');
    expect(context.markdown).toContain('Express');
    expect(context.markdown).toContain('Node.js');
    expect(context.markdown).toContain('vitest');
  });

  it('includes project overview', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    expect(context.markdown).toContain('bookstore API');
  });

  it('includes methodology', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    expect(context.markdown).toContain('camelCase');
    expect(context.markdown).toContain('JSDoc');
    expect(context.markdown).toContain('Supertest');
  });

  it('includes other agents\' plans (read-only)', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    expect(context.markdown).toContain('Other Sub-Agents');
    expect(context.markdown).toContain('User model');
    expect(context.markdown).toContain('src/auth/user.ts');
    expect(context.markdown).toContain('READ-ONLY');
  });

  it('generates JSON format', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    expect(() => JSON.parse(context.json)).not.toThrow();
    const parsed = JSON.parse(context.json);
    expect(parsed.profile.language).toBe('TypeScript');
    expect(parsed.otherTasks.length).toBe(2);
  });

  it('counts words', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    expect(context.wordCount).toBeGreaterThan(0);
  });

  it('validates context size', () => {
    const context = generateSharedContext(baseContext, taskPlans);
    const result = validateContextSize(context);
    expect(result.valid).toBe(true);
  });

  it('handles empty task plans', () => {
    const context = generateSharedContext(baseContext, []);
    expect(context.markdown).not.toContain('Other Sub-Agents');
  });
});
