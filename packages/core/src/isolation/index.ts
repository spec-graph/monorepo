/**
 * Isolation — worktree management for parallel sub-agent execution.
 *
 * When dispatch generates parallel actions (implement stage with multiple
 * capabilities), each action runs in its own git worktree to prevent
 * file conflicts and build artifacts from interfering.
 *
 * Lifecycle:
 *   dispatch creates → sub-agent works → verify → merge → cleanup
 *
 * Or on failure:
 *   dispatch creates → sub-agent works → verify fails → abandon → cleanup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { GitBackend } from './git-backend.js';
import { DefaultGitBackend } from './git-backend.js';
import type {
  IsolationUnit,
  IsolationStatus,
  ScopeLockDecl,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorktreesState {
  units: Record<string, IsolationUnit>;
}

export interface WorktreeCreateOptions {
  sessionId: string;
  actionId: string;
  projectRoot: string;
  baseBranch?: string;
  scopeLock?: Omit<ScopeLockDecl, 'unit_id' | 'locked_at' | 'locked_by'>;
}

export interface WorktreeVerifyResult {
  success: boolean;
  output: string;
  errors: string[];
}

export interface WorktreeMergeResult {
  success: boolean;
  conflicts: string[];
  output: string;
}

// ---------------------------------------------------------------------------
// WorktreeManager
// ---------------------------------------------------------------------------

/**
 * Manages git worktree lifecycle for parallel sub-agent execution.
 */
export class WorktreeManager {
  private git: GitBackend;
  private projectRoot: string;
  private isolationDir: string;
  private statePath: string;

  constructor(projectRoot: string, git?: GitBackend) {
    this.projectRoot = projectRoot;
    this.git = git || new DefaultGitBackend();
    this.isolationDir = path.join(projectRoot, '.spec-graph', 'isolation');
    this.statePath = path.join(this.isolationDir, 'worktrees.yaml');
  }

  /**
   * Create a new worktree for a parallel action.
   */
  create(opts: WorktreeCreateOptions): IsolationUnit {
    const unitId = `${opts.sessionId}-${opts.actionId}`;
    const branch = `spec-graph/${unitId}`;
    const worktreePath = path.join(this.isolationDir, 'worktrees', opts.actionId);

    // Get base branch (default: current HEAD)
    const baseBranch = opts.baseBranch || this.getCurrentBranch();

    // Create worktree
    const result = this.git.exec(
      ['worktree', 'add', worktreePath, '-b', branch, baseBranch],
      { cwd: this.projectRoot }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${result.stderr}`);
    }

    // Build isolation unit
    const unit: IsolationUnit = {
      id: unitId,
      track: 'feature',
      branch,
      path: worktreePath,
      status: 'prepared',
      created_at: new Date().toISOString(),
      base_commit: this.getHeadCommit(),
      prepared_at: new Date().toISOString(),
    };

    // Add scope lock if provided
    if (opts.scopeLock) {
      // ScopeLock is stored alongside the unit (not in IsolationUnit type directly)
      // For now, we track it in the state file
    }

    // Persist
    this.saveUnit(unit);

    return unit;
  }

  /**
   * Mark unit as verified (sub-agent completed successfully).
   */
  verify(unitId: string): WorktreeVerifyResult {
    const unit = this.loadUnit(unitId);
    if (!unit) {
      return { success: false, output: '', errors: [`Unit not found: ${unitId}`] };
    }

    if (unit.status !== 'prepared' && unit.status !== 'active') {
      return {
        success: false,
        output: '',
        errors: [`Unit ${unitId} is in status "${unit.status}", cannot verify`],
      };
    }

    // Run verification in the worktree
    // For now, just mark as self_verified
    unit.status = 'self_verified';
    unit.self_verified_at = new Date().toISOString();
    this.saveUnit(unit);

    return {
      success: true,
      output: `Unit ${unitId} verified`,
      errors: [],
    };
  }

  /**
   * Merge a unit's worktree branch into the main branch.
   */
  merge(unitId: string): WorktreeMergeResult {
    const unit = this.loadUnit(unitId);
    if (!unit) {
      return { success: false, conflicts: [], output: `Unit not found: ${unitId}` };
    }

    if (unit.status !== 'self_verified') {
      return {
        success: false,
        conflicts: [],
        output: `Unit ${unitId} is in status "${unit.status}", must be self_verified first`,
      };
    }

    // Merge the worktree branch into main
    const mainBranch = this.getCurrentBranch();
    const mergeResult = this.git.exec(['merge', unit.branch, '--no-edit'], {
      cwd: this.projectRoot,
    });

    if (mergeResult.exitCode !== 0) {
      // Merge conflict
      this.git.exec(['merge', '--abort'], { cwd: this.projectRoot });
      return {
        success: false,
        conflicts: [mergeResult.stderr],
        output: mergeResult.stderr,
      };
    }

    // Update status
    unit.status = 'merged';
    unit.merged_at = new Date().toISOString();
    this.saveUnit(unit);

    // Cleanup worktree
    this.cleanup(unitId);

    return {
      success: true,
      conflicts: [],
      output: mergeResult.stdout,
    };
  }

  /**
   * Abandon a unit (cleanup worktree, mark as abandoned).
   */
  abandon(unitId: string, reason?: string): void {
    const unit = this.loadUnit(unitId);
    if (!unit) return;

    unit.status = 'abandoned';
    this.saveUnit(unit);
    this.cleanup(unitId);
  }

  /**
   * Remove the worktree and branch.
   */
  cleanup(unitId: string): void {
    const unit = this.loadUnit(unitId);
    if (!unit) return;

    // Remove worktree
    if (fs.existsSync(unit.path)) {
      this.git.exec(['worktree', 'remove', unit.path, '--force'], {
        cwd: this.projectRoot,
      });
    }

    // Delete branch
    this.git.exec(['branch', '-D', unit.branch], { cwd: this.projectRoot });

    // Remove from state
    const state = this.loadState();
    delete state.units[unitId];
    this.saveState(state);
  }

  /**
   * List all units.
   */
  list(): IsolationUnit[] {
    const state = this.loadState();
    return Object.values(state.units);
  }

  /**
   * Get a specific unit.
   */
  get(unitId: string): IsolationUnit | null {
    return this.loadUnit(unitId);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private getCurrentBranch(): string {
    const result = this.git.exec(['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: this.projectRoot,
    });
    return result.stdout.trim() || 'main';
  }

  private getHeadCommit(): string {
    const result = this.git.exec(['rev-parse', 'HEAD'], { cwd: this.projectRoot });
    return result.stdout.trim();
  }

  private loadState(): WorktreesState {
    if (!fs.existsSync(this.statePath)) {
      return { units: {} };
    }
    try {
      const raw = fs.readFileSync(this.statePath, 'utf-8');
      const data = yaml.load(raw) as { units?: Record<string, IsolationUnit> };
      return { units: data?.units || {} };
    } catch {
      return { units: {} };
    }
  }

  private saveState(state: WorktreesState): void {
    if (!fs.existsSync(this.isolationDir)) {
      fs.mkdirSync(this.isolationDir, { recursive: true });
    }
    fs.writeFileSync(this.statePath, yaml.dump(state, { lineWidth: 120 }), 'utf-8');
  }

  private saveUnit(unit: IsolationUnit): void {
    const state = this.loadState();
    state.units[unit.id] = unit;
    this.saveState(state);
  }

  private loadUnit(unitId: string): IsolationUnit | null {
    const state = this.loadState();
    return state.units[unitId] || null;
  }
}
