"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChangedFiles = getChangedFiles;
exports.matchesTouchfiles = matchesTouchfiles;
exports.shouldRunCheck = shouldRunCheck;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const fs = __importStar(require("node:fs"));
const minimatch_1 = require("minimatch");
/**
 * Get the list of files changed in git (relative to a base).
 *
 * @param projectRoot Project root directory
 * @param baseRef Git ref to diff against (default: HEAD)
 * @returns Array of changed file paths (relative to project root)
 */
function getChangedFiles(projectRoot, baseRef = "HEAD") {
    try {
        // Check if .git exists
        if (!fs.existsSync(node_path_1.default.join(projectRoot, ".git"))) {
            return [];
        }
        // Get list of changed files
        const output = (0, node_child_process_1.execSync)(`git diff --name-only ${baseRef}`, {
            cwd: projectRoot,
            encoding: "utf-8",
            timeout: 5000,
        });
        return output
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }
    catch {
        // Not a git repo, or git not available, or no commits yet
        return [];
    }
}
/**
 * Check if a file path matches any of the touchfile globs.
 *
 * Uses minimatch for glob matching. Supports:
 *   - ** for recursive matching
 *   - * for single-level matching
 *   - ? for single character
 *
 * @param filePath File path to check (relative to project root)
 * @param globs Array of glob patterns
 * @returns true if filePath matches any glob
 */
function matchesTouchfiles(filePath, globs) {
    return globs.some((glob) => (0, minimatch_1.minimatch)(filePath, glob));
}
/**
 * Determine if a check should run based on touchfiles and changed files.
 *
 * Rules:
 *   - If touchfiles is undefined or empty, always run (backward compat)
 *   - If touchfiles is set, only run if any changed file matches
 *   - If changedFiles is empty (no git diff), still run (conservative)
 *
 * @param touchfiles Check's touchfile globs
 * @param changedFiles List of changed files from git diff
 * @returns true if the check should run
 */
function shouldRunCheck(touchfiles, changedFiles) {
    if (!touchfiles || touchfiles.length === 0) {
        return true; // No touchfiles = always run
    }
    if (changedFiles.length === 0) {
        return true; // No git diff info = run conservatively
    }
    return changedFiles.some((file) => matchesTouchfiles(file, touchfiles));
}
//# sourceMappingURL=diff-select.js.map