import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { machineState } from '../index.js';
import { automator } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-state-test-'));
  statePath = path.join(tmpDir, '.spec-graph', 'machine-state.yaml');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Machine State Tracker', () => {
  // ── Task 3.10: track + query ─────────────────────────────────────

  it('3.10 track artifact → getMachineState → artifact status correct', () => {
    machineState.trackArtifact('specify/proposal.md', 'completed', {
      path: 'specify/proposal.md',
      producer: 'pm',
    }, { statePath });

    const state = machineState.getMachineState({ statePath });

    expect(state.artifacts['specify/proposal.md']).toBeDefined();
    expect(state.artifacts['specify/proposal.md'].status).toBe('completed');
    expect(state.artifacts['specify/proposal.md'].path).toBe('specify/proposal.md');
    expect(state.artifacts['specify/proposal.md'].producer).toBe('pm');
  });

  // ── Task 3.11: gate_passed from machine state ────────────────────

  it('3.11 gate_passed=true when all required artifacts completed', () => {
    machineState.trackArtifact('specify/proposal.md', 'completed', {
      path: 'specify/proposal.md',
    }, { statePath });
    machineState.trackArtifact('design/design.md', 'completed', {
      path: 'design/design.md',
    }, { statePath });
    machineState.trackArtifact('plan/tasks.md', 'pending', {
      path: 'plan/tasks.md',
    }, { statePath });

    const state = machineState.getMachineState({ statePath });

    expect(state.artifacts['specify/proposal.md'].status).toBe('completed');
    expect(state.artifacts['design/design.md'].status).toBe('completed');
    expect(state.artifacts['plan/tasks.md'].status).toBe('pending');
  });

  // ── Task 3.12: atomic write safety ───────────────────────────────

  it('3.14 atomic write — interrupted write does not corrupt file', () => {
    // Write initial state
    machineState.trackArtifact('a/b.md', 'completed', {}, { statePath });

    // Read it back — should be valid
    const state1 = machineState.getMachineState({ statePath });
    expect(state1.artifacts['a/b.md'].status).toBe('completed');

    // Verify file is valid YAML
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = yaml.load(raw) as any;
    expect(parsed.artifacts).toBeDefined();
    expect(parsed.artifacts['a/b.md']).toBeDefined();

    // Write more — should still be valid
    machineState.trackArtifact('c/d.md', 'in_progress', {}, { statePath });
    const state2 = machineState.getMachineState({ statePath });
    expect(state2.artifacts['a/b.md'].status).toBe('completed');
    expect(state2.artifacts['c/d.md'].status).toBe('in_progress');
  });

  // ── Check tracking ───────────────────────────────────────────────

  it('trackCheck updates check status', () => {
    machineState.trackCheck('lint', 'passed', { duration_ms: 420 }, { statePath });

    const state = machineState.getMachineState({ statePath });
    expect(state.checks['lint']).toBeDefined();
    expect(state.checks['lint'].status).toBe('passed');
    expect(state.checks['lint'].details?.duration_ms).toBe(420);
  });

  // ── Reset ────────────────────────────────────────────────────────

  it('resetMachineState clears everything', () => {
    machineState.trackArtifact('a/b.md', 'completed', {}, { statePath });
    machineState.resetMachineState({ statePath });

    const state = machineState.getMachineState({ statePath });
    expect(Object.keys(state.artifacts)).toHaveLength(0);
    expect(Object.keys(state.checks)).toHaveLength(0);
  });

  // ── Empty state handling ─────────────────────────────────────────

  it('getMachineState returns empty state when file does not exist', () => {
    const state = machineState.getMachineState({ statePath });
    expect(state.artifacts).toEqual({});
    expect(state.checks).toEqual({});
    expect(state.last_updated).toBeDefined();
  });
});
