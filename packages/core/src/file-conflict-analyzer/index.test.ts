import { describe, it, expect } from 'vitest';
import { analyzeConflicts, parseAgentFileList } from './index.js';

describe('file-conflict-analyzer', () => {
  describe('analyzeConflicts', () => {
    it('returns no conflicts for non-overlapping files', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/books/list.ts'],
      });
      expect(matrix.rows.A.B).toBe(false);
      expect(matrix.rows.B.A).toBe(false);
    });

    it('detects same-file conflict', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/auth/login.ts'],
      });
      expect(matrix.rows.A.B).toBe(true);
    });

    it('detects same-directory conflict', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/login.ts'],
        B: ['src/auth/logout.ts'],
      });
      expect(matrix.rows.A.B).toBe(true);
    });

    it('detects wildcard pattern overlap', () => {
      const matrix = analyzeConflicts({
        A: ['src/auth/*'],
        B: ['src/auth/login.ts'],
      });
      expect(matrix.rows.A.B).toBe(true);
    });

    it('empty file list → unknown risk, no conflict flagged', () => {
      const matrix = analyzeConflicts({
        A: [],
        B: ['src/books/list.ts'],
      });
      expect(matrix.impacts.A.risk).toBe('unknown');
      expect(matrix.rows.A.B).toBe(false);
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
    });
  });
});
