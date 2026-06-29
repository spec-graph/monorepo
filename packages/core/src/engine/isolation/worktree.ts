/**
 * Worktree Isolation Engine
 *
 * Manages per-unit git worktrees so parallel work on different tracks/changes
 * never stomps on shared working-tree state. Wraps a GitBackend (defaulting to
 * node:child_process) so tests can inject a fake without needing a real repo.
 *
 * Layout:
 *   <projectRoot>/
 *     .spec-graph/isolation/worktrees.yaml   ← persisted unit registry
 *     .worktrees/<unitId>/                    ← actual git worktree content
 *
 * Branch naming: spec-graph/<unitId>-<track>
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { GitBackend, IsolationUnit, IsolationStatus } from "../../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../../utils/yaml";

// ============ GitBackend: default process-based impl ============

export class ProcessGitBackend implements GitBackend {
  async exec(
    args: string[],
    opts: { cwd?: string } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cwd = opts.cwd || process.cwd();
    return new Promise((resolve, reject) => {
      const proc = spawn("git", args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) =>
        resolve({ stdout, stderr, exitCode: code ?? 1 }),
      );
      proc.on("error", reject);
    });
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}

// ============ Persisted registry ============

interface WorktreeRegistry {
  units: Record<string, IsolationUnit>;
}

const DEFAULT_REGISTRY: WorktreeRegistry = { units: {} };

// ============ WorktreeManager ============

export interface WorktreeManagerOptions {
  projectRoot: string;
  backend?: GitBackend;
  /** Override default worktree base directory (defaults to <projectRoot>/.worktrees) */
  worktreesDir?: string;
}

export interface CreateOptions {
  baseBranch?: string;
  /** Override branch name (defaults to spec-graph/<unitId>-<track>) */
  branch?: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  mergedCommit?: string;
  error?: string;
}

export class WorktreeManager {
  private projectRoot: string;
  private backend: GitBackend;
  private worktreesDir: string;
  private registryPath: string;

  constructor(opts: WorktreeManagerOptions) {
    this.projectRoot = opts.projectRoot;
    this.backend = opts.backend || new ProcessGitBackend();
    this.worktreesDir =
      opts.worktreesDir || path.join(opts.projectRoot, ".worktrees");
    this.registryPath = path.join(
      opts.projectRoot,
      ".spec-graph",
      "isolation",
      "worktrees.yaml",
    );
  }

  /**
   * Create a new worktree + branch for an isolation unit.
   */
  async create(
    unitId: string,
    track: string,
    opts: CreateOptions = {},
  ): Promise<IsolationUnit> {
    const registry = await this.loadRegistry();
    if (registry.units[unitId]) {
      throw new Error(
        `Isolation unit '${unitId}' already exists (status=${registry.units[unitId].status})`,
      );
    }

    const baseBranch = opts.baseBranch || (await this.detectDefaultBranch());
    const branch = opts.branch || `spec-graph/${unitId}-${track}`;
    const worktreePath = path.join(this.worktreesDir, unitId);

    // Get base commit for traceability
    const baseRev = await this.git("rev-parse", baseBranch);
    if (baseRev.exitCode !== 0) {
      throw new Error(
        `Cannot resolve base branch '${baseBranch}': ${baseRev.stderr}`,
      );
    }

    // Create branch + worktree in one step
    const result = await this.git(
      "worktree",
      "add",
      "-b",
      branch,
      worktreePath,
      baseBranch,
    );
    if (result.exitCode !== 0) {
      throw new Error(`git worktree add failed: ${result.stderr}`);
    }

    const unit: IsolationUnit = {
      id: unitId,
      track,
      branch,
      path: worktreePath,
      status: "active",
      created_at: new Date().toISOString(),
      base_commit: baseRev.stdout.trim(),
    };

    registry.units[unitId] = unit;
    await this.saveRegistry(registry);
    return unit;
  }

  /**
   * List all isolation units (all statuses).
   */
  async list(): Promise<IsolationUnit[]> {
    const registry = await this.loadRegistry();
    return Object.values(registry.units);
  }

  /**
   * List only units matching a given status.
   */
  async listByStatus(status: IsolationStatus): Promise<IsolationUnit[]> {
    const all = await this.list();
    return all.filter((u) => u.status === status);
  }

  /**
   * Get a single unit by id.
   */
  async get(unitId: string): Promise<IsolationUnit | null> {
    const registry = await this.loadRegistry();
    return registry.units[unitId] || null;
  }

  /**
   * Update an isolation unit's fields (status, timestamps, etc.).
   * Used by enriched lifecycle transitions (self-verify, submit, accept, reject).
   */
  async update(unit: IsolationUnit): Promise<void> {
    const registry = await this.loadRegistry();
    registry.units[unit.id] = unit;
    await this.saveRegistry(registry);
  }

  /**
   * Remove a worktree from disk and mark the unit abandoned (or delete it).
   * Safe to call even if the worktree dir is already gone.
   */
  async remove(unitId: string, opts: { purge?: boolean } = {}): Promise<void> {
    const registry = await this.loadRegistry();
    const unit = registry.units[unitId];
    if (!unit) throw new Error(`Isolation unit '${unitId}' not found`);

    // Best-effort git worktree remove (ignore errors if already gone)
    const worktreeExists = await this.backend.exists(unit.path);
    if (worktreeExists) {
      await this.git("worktree", "remove", "--force", unit.path);
    }

    // Best-effort branch cleanup (only if not merged into base)
    // We do NOT auto-delete branches — the user may want to keep them.

    if (opts.purge) {
      delete registry.units[unitId];
    } else {
      unit.status = "abandoned";
    }
    await this.saveRegistry(registry);
  }

  /**
   * Dry-run conflict check + merge into target branch.
   * Returns success=true if merge would apply cleanly, with list of conflict files otherwise.
   *
   * Two-phase: first a `merge-tree` dry-run to detect conflicts without touching
   * the target branch; then (if dryRun=false) a real merge.
   */
  async merge(
    unitId: string,
    targetBranch: string,
    opts: { dryRun?: boolean; message?: string } = {},
  ): Promise<MergeResult> {
    const unit = await this.get(unitId);
    if (!unit) throw new Error(`Isolation unit '${unitId}' not found`);
    if (unit.status !== "active") {
      return {
        success: false,
        conflicts: [],
        error: `Unit status is '${unit.status}', not 'active'`,
      };
    }

    // Phase 1: detect conflicts using merge-tree (does not touch working tree)
    const mergeBase = await this.git("merge-base", targetBranch, unit.branch);
    if (mergeBase.exitCode !== 0) {
      return {
        success: false,
        conflicts: [],
        error: `Cannot find merge-base: ${mergeBase.stderr}`,
      };
    }
    const baseCommit = mergeBase.stdout.trim();

    // merge-tree outputs conflict markers for conflicted files
    const treeResult = await this.git(
      "merge-tree",
      baseCommit,
      targetBranch,
      unit.branch,
    );
    const conflicts = parseMergeTreeConflicts(treeResult.stdout);

    if (conflicts.length > 0 || treeResult.exitCode !== 0) {
      return { success: false, conflicts };
    }

    if (opts.dryRun) {
      return { success: true, conflicts: [] };
    }

    // Phase 2: real merge on target branch
    // We do this in the main project root, checking out target temporarily.
    // To be safe, first stash any uncommitted changes.
    const stashResult = await this.git(
      "stash",
      "push",
      "--include-untracked",
      "-m",
      `spec-graph: pre-merge stash for ${unitId}`,
    );
    const hadStash = !stashResult.stdout.includes("No local changes");

    try {
      const checkout = await this.git("checkout", targetBranch);
      if (checkout.exitCode !== 0) {
        return {
          success: false,
          conflicts: [],
          error: `Cannot checkout ${targetBranch}: ${checkout.stderr}`,
        };
      }

      const mergeMsg = opts.message || `merge: ${unit.branch} (${unitId})`;
      const mergeResult = await this.git(
        "merge",
        "--no-ff",
        "-m",
        mergeMsg,
        unit.branch,
      );
      if (mergeResult.exitCode !== 0) {
        // Abort the partial merge
        await this.git("merge", "--abort");
        return {
          success: false,
          conflicts: [],
          error: `Merge failed: ${mergeResult.stderr}`,
        };
      }

      const headRev = await this.git("rev-parse", "HEAD");
      const registry = await this.loadRegistry();
      registry.units[unitId].status = "merged";
      registry.units[unitId].merged_at = new Date().toISOString();
      await this.saveRegistry(registry);

      return {
        success: true,
        conflicts: [],
        mergedCommit: headRev.stdout.trim(),
      };
    } finally {
      if (hadStash) {
        await this.git("stash", "pop");
      }
    }
  }

  /**
   * Prune git's worktree metadata (removes references to worktrees that no
   * longer exist on disk). Useful for recovery.
   */
  async prune(): Promise<void> {
    await this.git("worktree", "prune");
  }

  // ============ internal ============

  private async git(
    ...args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.backend.exec(args, { cwd: this.projectRoot });
  }

  private async detectDefaultBranch(): Promise<string> {
    // Prefer main; fall back to master; fall back to current HEAD
    const main = await this.git("rev-parse", "--verify", "main");
    if (main.exitCode === 0) return "main";
    const master = await this.git("rev-parse", "--verify", "master");
    if (master.exitCode === 0) return "master";
    // Fall back: use current branch
    const head = await this.git("rev-parse", "--abbrev-ref", "HEAD");
    if (head.exitCode === 0) return head.stdout.trim();
    throw new Error(
      "Cannot detect default branch: no main/master and HEAD unresolvable",
    );
  }

  private async loadRegistry(): Promise<WorktreeRegistry> {
    const data = await tryReadYaml<WorktreeRegistry>(this.registryPath);
    return data || { ...DEFAULT_REGISTRY, units: {} };
  }

  private async saveRegistry(registry: WorktreeRegistry): Promise<void> {
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await writeYaml(this.registryPath, registry);
  }
}

// ============ merge-tree conflict parser ============

/**
 * Parse git merge-tree output for conflict markers.
 * merge-tree emits "changed in both" sections with conflict blocks when both
 * sides modified the same region. We detect these by looking for the
 * "CONFLICT" marker or "base ... <filename>" header patterns.
 */
export function parseMergeTreeConflicts(output: string): string[] {
  const conflicts: string[] = [];
  const lines = output.split("\n");
  let currentFile: string | null = null;

  for (const line of lines) {
    // File section header: "  base <mode> <hash> ... <filename>"
    // The filename is the last whitespace-separated token and typically
    // contains a path separator or file extension.
    if (/^\s+base\s+/.test(line)) {
      const tokens = line.trim().split(/\s+/);
      // tokens[0] = "base", then mode/hash pairs, then filename
      const candidate = tokens[tokens.length - 1];
      if (candidate && (candidate.includes("/") || candidate.includes("."))) {
        currentFile = candidate;
      }
      continue;
    }
    // Conflict marker — may include the filename inline
    const conflictInline = line.match(/CONFLICT.*?in\s+(\S+)/);
    if (conflictInline) {
      const file = conflictInline[1];
      if (!conflicts.includes(file)) conflicts.push(file);
      continue;
    }
    if (line.includes("CONFLICT") && currentFile) {
      if (!conflicts.includes(currentFile)) conflicts.push(currentFile);
    }
  }
  return conflicts;
}
