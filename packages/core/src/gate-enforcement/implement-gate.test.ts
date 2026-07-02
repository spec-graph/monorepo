import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { evaluateGate, type EvaluationContext } from './index';

// Knowledge base path (relative to this test file)
const knowledgeBasePath = path.resolve(__dirname, '../../knowledge');

describe('implement gate', () => {
  let tmpDir: string;
  let implementDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-gate-test-'));
    implementDir = path.join(tmpDir, 'implement');
    fs.mkdirSync(implementDir, { recursive: true });
    // Create a minimal package.json
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-project', scripts: {} }, null, 2)
    );
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
      const sourceExists = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(sourceExists).toBeDefined();
      expect(sourceExists!.passed).toBe(false);
      expect(sourceExists!.reason).toContain('No source files');
    });

    it('fails when implement directory has only .md files', () => {
      fs.writeFileSync(path.join(implementDir, 'README.md'), '# readme');
      fs.writeFileSync(path.join(implementDir, 'notes.md'), '# notes');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const sourceExists = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(sourceExists!.passed).toBe(false);
    });

    it('passes when implement directory has source files', () => {
      fs.writeFileSync(path.join(implementDir, 'index.ts'), 'export const x = 1;');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const sourceExists = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(sourceExists!.passed).toBe(true);
      expect(sourceExists!.reason).toContain('1 source file');
    });

    it('passes with nested source files', () => {
      const subDir = path.join(implementDir, 'src', 'utils');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'helper.js'), 'module.exports = {};');

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const sourceExists = result.evaluatedCriteria.find(c => c.criterion.id === 'implement-source-exists');
      expect(sourceExists!.passed).toBe(true);
    });
  });

  describe('command-based checks', () => {
    it('typecheck-passes skips when no typecheck command configured', () => {
      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const typecheck = result.evaluatedCriteria.find(c => c.criterion.id === 'typecheck-passes');
      expect(typecheck).toBeDefined();
      expect(typecheck!.passed).toBe(true);
      expect(typecheck!.reason).toContain('No typecheck command configured');
    });

    it('lint-passes skips when no lint command configured', () => {
      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const lint = result.evaluatedCriteria.find(c => c.criterion.id === 'lint-passes');
      expect(lint!.passed).toBe(true);
      expect(lint!.reason).toContain('No lint command configured');
    });

    it('build-passes skips when no build command configured', () => {
      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const build = result.evaluatedCriteria.find(c => c.criterion.id === 'build-passes');
      expect(build!.passed).toBe(true);
      expect(build!.reason).toContain('No build command configured');
    });

    it('existing-tests-pass skips when no test command configured', () => {
      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const tests = result.evaluatedCriteria.find(c => c.criterion.id === 'existing-tests-pass');
      expect(tests!.passed).toBe(true);
      expect(tests!.reason).toContain('No test command configured');
    });

    it('test command fails when tests fail', () => {
      // Configure a failing test command
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', scripts: { test: 'node -e "process.exit(1)"' } }, null, 2)
      );

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const tests = result.evaluatedCriteria.find(c => c.criterion.id === 'existing-tests-pass');
      expect(tests!.passed).toBe(false);
      expect(tests!.reason).toContain('test failed');
    });

    it('test command passes when tests succeed', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2)
      );

      const result = evaluateGate('implement', 'exit', makeContext(), knowledgeBasePath);
      const tests = result.evaluatedCriteria.find(c => c.criterion.id === 'existing-tests-pass');
      expect(tests!.passed).toBe(true);
    });
  });
});
