/**
 * GitBackend — abstraction for git operations.
 *
 * Default implementation uses child_process.execSync('git').
 * Tests inject a fake for isolation.
 */

export interface GitBackend {
  exec(args: string[], opts?: { cwd?: string }): {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  exists(path: string): boolean;
}

/**
 * Default GitBackend using child_process.execSync.
 */
export class DefaultGitBackend implements GitBackend {
  exec(args: string[], opts?: { cwd?: string }): {
    stdout: string;
    stderr: string;
    exitCode: number;
  } {
    const { execSync } = require('node:child_process');
    try {
      const stdout = execSync(`git ${args.join(' ')}`, {
        cwd: opts?.cwd || process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout: stdout || '', stderr: '', exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1,
      };
    }
  }

  exists(path: string): boolean {
    const fs = require('node:fs');
    return fs.existsSync(path);
  }
}
