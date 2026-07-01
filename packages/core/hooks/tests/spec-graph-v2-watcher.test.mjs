import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOK_PATH = pjoin(__dirname, 'spec-graph-v2-watcher.mjs').replace('/tests/', '/');

describe('spec-graph-v2-watcher hook', () => {
  function runHook(input) {
    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 5000,
    });
    return {
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
      exitCode: result.status,
    };
  }

  it('silent exit on non-spec-graph command', () => {
    const r = runHook({
      tool_input: { command: 'npm test' },
      tool_response: { stdout: '', exitCode: 0 },
    });
    expect(r.stdout).toBe('');
    expect(r.exitCode).toBe(0);
  });

  it('silent exit on empty input', () => {
    const r = runHook({});
    expect(r.exitCode).toBe(0);
  });

  it('reports gate pass for advance', () => {
    const r = runHook({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph advance --result ...' },
      tool_response: {
        stdout: '{"advanced":true,"nextStage":"design"}',
        exitCode: 0,
      },
    });
    expect(r.stdout).toContain('Gate passed');
  });

  it('reports gate failure for advance', () => {
    const r = runHook({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph advance' },
      tool_response: {
        stdout: '{"advanced":false,"diagnosis":{"failedCriteria":[{"id":"test"}]}}',
        exitCode: 0,
      },
    });
    expect(r.stdout).toContain('Gate failed');
  });

  it('reminds about plan confirmation', () => {
    const r = runHook({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph plan "test"' },
      tool_response: { stdout: '', exitCode: 0 },
    });
    expect(r.stdout).toContain('confirm');
  });
});
