/**
 * Machine State Tracker — runtime artifact and check status tracking.
 *
 * Tracks the status of every artifact and check in the workflow,
 * persisted to `.spec-graph/machine-state.yaml`. Used by dispatch
 * to determine gate status without loading the full automator session.
 *
 * Design decisions:
 *   - machine-state.yaml is a best-effort mirror of automator gate results
 *   - Uses atomic write (temp file + rename) for crash safety
 *   - automator's evaluateGate() is authoritative; machine-state is for dispatch display
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type CheckStatus = 'pending' | 'in_progress' | 'passed' | 'failed';

export interface ArtifactRecord {
  id: string;
  status: ArtifactStatus;
  path?: string;
  producer?: string;
  updated_at: string;
  details?: Record<string, any>;
}

export interface CheckRecord {
  id: string;
  status: CheckStatus;
  updated_at: string;
  details?: Record<string, any>;
}

export interface MachineState {
  artifacts: Record<string, ArtifactRecord>;
  checks: Record<string, CheckRecord>;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TrackOptions {
  /** Path to machine-state.yaml (default: .spec-graph/machine-state.yaml) */
  statePath?: string;
  /** Base project root (used to resolve default statePath) */
  projectRoot?: string;
}

function resolveStatePath(opts?: TrackOptions): string {
  if (opts?.statePath) return opts.statePath;
  const root = opts?.projectRoot || process.cwd();
  return path.join(root, '.spec-graph', 'machine-state.yaml');
}

/**
 * Track an artifact's status update.
 * Uses atomic write: writes to temp file then renames.
 */
export function trackArtifact(
  id: string,
  status: ArtifactStatus,
  details?: Record<string, any>,
  opts?: TrackOptions
): void {
  const statePath = resolveStatePath(opts);
  const state = readOrInitState(statePath);

  state.artifacts[id] = {
    id,
    status,
    ...(details?.path ? { path: details.path } : {}),
    ...(details?.producer ? { producer: details.producer } : {}),
    updated_at: new Date().toISOString(),
    details: details || {},
  };
  state.last_updated = new Date().toISOString();

  atomicWrite(statePath, state);
}

/**
 * Track a check's status update.
 * Uses atomic write: writes to temp file then renames.
 */
export function trackCheck(
  id: string,
  status: CheckStatus,
  details?: Record<string, any>,
  opts?: TrackOptions
): void {
  const statePath = resolveStatePath(opts);
  const state = readOrInitState(statePath);

  state.checks[id] = {
    id,
    status,
    updated_at: new Date().toISOString(),
    details: details || {},
  };
  state.last_updated = new Date().toISOString();

  atomicWrite(statePath, state);
}

/**
 * Query the current machine state.
 * Returns a snapshot — does not reflect subsequent writes.
 */
export function getMachineState(opts?: TrackOptions): MachineState {
  const statePath = resolveStatePath(opts);
  return readOrInitState(statePath);
}

/**
 * Reset machine state to empty (useful for testing).
 */
export function resetMachineState(opts?: TrackOptions): void {
  const statePath = resolveStatePath(opts);
  atomicWrite(statePath, {
    artifacts: {},
    checks: {},
    last_updated: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function readOrInitState(statePath: string): MachineState {
  if (!fs.existsSync(statePath)) {
    return { artifacts: {}, checks: {}, last_updated: new Date().toISOString() };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = yaml.load(raw) as Partial<MachineState>;
    return {
      artifacts: parsed?.artifacts || {},
      checks: parsed?.checks || {},
      last_updated: parsed?.last_updated || new Date().toISOString(),
    };
  } catch {
    return { artifacts: {}, checks: {}, last_updated: new Date().toISOString() };
  }
}

function atomicWrite(statePath: string, state: MachineState): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = statePath + '.tmp.' + process.pid;
  try {
    const content = yaml.dump(state, { lineWidth: 120, noRefs: true });
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, statePath);
  } catch (err) {
    // Cleanup temp file on failure
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch { /* ignore cleanup errors */ }
    throw err;
  }
}
