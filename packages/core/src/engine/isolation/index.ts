/**
 * Isolation engine barrel: worktree, scope-lock, merge-queue
 */

export {
  WorktreeManager,
  ProcessGitBackend,
  parseMergeTreeConflicts,
} from "./worktree";
export type {
  WorktreeManagerOptions,
  CreateOptions,
  MergeResult,
} from "./worktree";

export {
  validateScopeLock,
  validateActualChangesAgainstScope,
  summarizeViolations,
  matchGlob,
} from "./scope-lock";
export type {
  ScopeViolation,
  ScopeValidationResult,
  ViolationKind,
} from "./scope-lock";

export { MergeQueueManager } from "./merge-queue";
export type { EnqueueOptions, OverlapReport } from "./merge-queue";
