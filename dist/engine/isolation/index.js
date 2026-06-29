"use strict";
/**
 * Isolation engine barrel: worktree, scope-lock, merge-queue
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeQueueManager = exports.matchGlob = exports.summarizeViolations = exports.validateActualChangesAgainstScope = exports.validateScopeLock = exports.parseMergeTreeConflicts = exports.ProcessGitBackend = exports.WorktreeManager = void 0;
var worktree_1 = require("./worktree");
Object.defineProperty(exports, "WorktreeManager", { enumerable: true, get: function () { return worktree_1.WorktreeManager; } });
Object.defineProperty(exports, "ProcessGitBackend", { enumerable: true, get: function () { return worktree_1.ProcessGitBackend; } });
Object.defineProperty(exports, "parseMergeTreeConflicts", { enumerable: true, get: function () { return worktree_1.parseMergeTreeConflicts; } });
var scope_lock_1 = require("./scope-lock");
Object.defineProperty(exports, "validateScopeLock", { enumerable: true, get: function () { return scope_lock_1.validateScopeLock; } });
Object.defineProperty(exports, "validateActualChangesAgainstScope", { enumerable: true, get: function () { return scope_lock_1.validateActualChangesAgainstScope; } });
Object.defineProperty(exports, "summarizeViolations", { enumerable: true, get: function () { return scope_lock_1.summarizeViolations; } });
Object.defineProperty(exports, "matchGlob", { enumerable: true, get: function () { return scope_lock_1.matchGlob; } });
var merge_queue_1 = require("./merge-queue");
Object.defineProperty(exports, "MergeQueueManager", { enumerable: true, get: function () { return merge_queue_1.MergeQueueManager; } });
//# sourceMappingURL=index.js.map