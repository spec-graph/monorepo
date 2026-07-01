import { describe, it, expect } from 'vitest';
import { analyzeConflicts, parseAgentFileList, staticAnalyze } from './index.js';

describe('file-conflict-analyzer', () => {
  describe('analyzeConflicts', () => {
    it('returns no conflicts for non-overlapping files', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/books/list.ts'],
      });
      expect(matrix.A.B).toBe(false);
      expect(matrix.B.A).toBe(false);
    });

    it('detects same file conflict', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/auth/login.ts'],
      });
      expect(matrix.A.B).toBe(true);
    });

    it('detects same-directory conflict', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/auth/logout.ts'],
      });
      expect(matrix.A.B).toBe(true);
    });

    it('detects wildcard pattern overlap', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/*'],
        B: ['src/auth/login.ts'],
      });
      expect(matrix.A.B).toBe(true);
    });

    it('treats read-only as no conflict', () => {
      // Different file paths in different directories
      const matrix = analyzeConflicts({
        A: ['src/auth/types.ts'],
        B: ['src/books/types.ts'],
      });
      expect(matrix.A.B).toBe(false);
    });

    it('handles empty file list as unknown', () => {
      const matrix = analyzeConflicts({
        A: [],
        B: ['src/books/list.ts'],
      });
      expect(matrix.impacts.A.risk).toBe('unknown');
      expect(matrix.A.B).toBe(false); // conservative: don't flag unknown as conflict
    });

    it('assesses risk based on file count', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/auth/login.ts', 'src/auth/logout.ts', 'src/auth/types.ts', 'src/auth/reset.ts'],
      });
      expect(matrix.impacts.B.risk).toBe('medium');
    });
  });

  describe('parseAgentFileList', () => {
    it('parses JSON array', () => {
      const files = parseAgentFileList('["src/auth/login.ts", "src/auth/middleware.ts"]');
      expect(files).toEqual(['src/auth/login.ts', 'src/auth/middleware.ts']);
    });

    it('parses text with backticked paths', () => {
      const files = parseAgentFileList('Modifying `src/auth/login.ts` and `src/auth/middleware.ts`');
      expect(files).toContain('src/auth/login.ts');
    });

    it('returns empty on invalid input', () => {
      expect(parseAgentFileList('')).toEqual([]);
      expect(parseAgentFileList('not a file list')).toEqual([]);
    });

    it('parses colon-prefixed paths', () => {
      const files = parseAgentFileList('Files: src/auth/login.ts\nModify: src/auth/middleware.ts');
      expect(files).toContain('src/auth/login.ts');
    });
  });

  describe('staticAnalyze', () => {
    it('extracts file paths from description', () => {
      const files = staticAnalyze('Modify src/auth/login.ts to add JWT validation');
      expect(files).toContain('src/auth/login.ts');
    });

    it('extracts test files', () => {
      const files = staticAnalyze('Add unit test in test/auth/login.test.ts');
      expect(files).toContain('test/auth/login.test.ts');
    });

    it('includes design references', () => {
      const files = staticAnalyze('No paths in this description', ['src/auth/jwt.ts']);
      expect(files).toContain('src/auth/jwt.ts');
    });

    it('returns empty for no paths', () => {
      expect(staticAnalyze('Just a vague description with no files')).toEqual([]);
    });
  });
});
