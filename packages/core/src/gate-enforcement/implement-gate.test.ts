import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { evaluateGate, type EvaluationContext } from './index';

// Knowledge base path relative to test file
const knowledgeBasePath = path.resolve(__dirname, '../../knowledge');

describe('implement gate', () => {
  let tmpDir: string;
  let implementDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-gate-test-'));
    implementDir = path.join(tmpDir, 'implement');
    fs.mkdirSync(implementDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function makeContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
    return {
      projectRoot: tmpDir,
      stage: 'implement',
      artifactFiles: { implement: implementDir },
      artifactContents: {},
      traceEdges: {},
      ...overrides,
    };
  }

  describe('implement-source-exists', () => {
    it('fails when implement directory is empty', () => {
      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(criterion).toBeDefined();
      expect(criterion!.passed).toBe(false);
      expect(criterion!.reason).toContain('No source files');
    });

    it('fails when only .md/.yaml/.json files exist', () => {
      fs.writeFileSync(path.join(implementDir, 'README.md'), '# readme');
      fs.writeFileSync(path.join(implementDir, 'config.json'), '{}');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(criterion!.passed).toBe(false);
    });

    it('passes when source files exist', () => {
      fs.writeFileSync(path.join(implementDir, 'index.ts'), 'export const x = 1;');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(criterion!.passed).toBe(true);
    });

    it('passes with nested source files', () => {
      const src = path.join(implementDir, 'src', 'utils');
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'helper.py'), 'def foo(): pass');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(criterion!.passed).toBe(true);
    });
  });

  describe('implement-validation-passed', () => {
    it('fails when validation-report.json is missing', () => {
      // Source exists but no validation report
      fs.writeFileSync(path.join(implementDir, 'index.ts'), 'export {}');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion).toBeDefined();
      expect(criterion!.passed).toBe(false);
      expect(criterion!.reason).toContain('not found');
    });

    it('fails when validation-report.json is not valid JSON', () => {
      fs.writeFileSync(path.join(implementDir, 'validation-report.json'), 'not json');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion!.passed).toBe(false);
      expect(criterion!.reason).toContain('not valid JSON');
    });

    it('fails when validation_passed is missing', () => {
      fs.writeFileSync(path.join(implementDir, 'validation-report.json'),
        JSON.stringify({ commands_run: ['tsc'] }));

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion!.passed).toBe(false);
      expect(criterion!.reason).toContain('missing validation_passed');
    });

    it('fails when validation_passed is false', () => {
      fs.writeFileSync(path.join(implementDir, 'validation-report.json'),
        JSON.stringify({
          validation_passed: false,
          commands_run: ['tsc --noEmit'],
          output: '12 type errors found',
          errors: ['TS2304: Cannot find name foo']
        }));

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion!.passed).toBe(false);
      expect(criterion!.reason).toContain('TS2304');
    });

    it('passes when validation_passed is true', () => {
      fs.writeFileSync(path.join(implementDir, 'validation-report.json'),
        JSON.stringify({
          validation_passed: true,
          commands_run: ['tsc --noEmit', 'vitest run'],
          output: 'TypeScript: OK. Tests: 15/15 passed.',
          errors: []
        }));

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.reason).toContain('Validation passed');
      expect(criterion!.reason).toContain('tsc');
      expect(criterion!.reason).toContain('vitest');
    });

    it('passes with any validation commands (not Node-specific)', () => {
      fs.writeFileSync(path.join(implementDir, 'validation-report.json'),
        JSON.stringify({
          validation_passed: true,
          commands_run: ['pytest -v', 'mypy src/', 'black --check .'],
          output: '42 tests passed. Type check OK. Format OK.',
          errors: []
        }));

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const criterion = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-validation-passed');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.reason).toContain('pytest');
    });
  });
});
