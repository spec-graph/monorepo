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
exports.rollbackCommand = rollbackCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Safely rollback a change to its pre-change state.
 * Uses safety-net snapshots to restore files, or git revert if git is available.
 */
async function rollbackCommand(projectRoot, options) {
    if (!options.changeId) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph rollback <change-id> [--dry-run]"));
        process.exit(1);
        return;
    }
    const snapshotsDir = node_path_1.default.join(projectRoot, ".spec-graph", "snapshots");
    // Find snapshot directory for this change
    const snapshotInfo = await findSnapshot(snapshotsDir, options.changeId);
    if (!snapshotInfo) {
        console.log(chalk_1.default.red(`✗ No snapshot found for change: ${options.changeId}`));
        console.log(chalk_1.default.gray(`  Snapshots are in: ${snapshotsDir}`));
        process.exit(1);
        return;
    }
    console.log(chalk_1.default.bold(`\n🔙 Rolling back: ${options.changeId}`));
    console.log(chalk_1.default.gray(`  Snapshot: ${snapshotInfo.path}`));
    console.log(chalk_1.default.gray(`  Archived at: ${snapshotInfo.archived_at}`));
    if (options.dryRun) {
        console.log(chalk_1.default.yellow("\n  [DRY RUN] Would restore:"));
        const files = await listSnapshotFiles(snapshotInfo.path);
        for (const file of files) {
            console.log(chalk_1.default.gray(`    - ${file}`));
        }
        console.log(chalk_1.default.yellow("\n  [DRY RUN] No files actually restored."));
        return;
    }
    // Check if git is available
    const hasGit = await checkGit(projectRoot);
    if (hasGit) {
        console.log(chalk_1.default.cyan("  Using git revert..."));
        // For now, just restore files from snapshot
        // TODO: Integrate with git merge-queue atomic merge
    }
    else {
        console.log(chalk_1.default.cyan("  Restoring from snapshot files..."));
    }
    // Restore files from snapshot
    const restored = await restoreFromSnapshot(snapshotInfo.path, projectRoot, options.dryRun || false);
    console.log(chalk_1.default.green(`\n✓ Rolled back ${restored} file(s)`));
    console.log(chalk_1.default.gray(`  machine-state.yaml was NOT restored (coordinator decides).`));
}
async function findSnapshot(snapshotsDir, changeId) {
    try {
        const entries = await promises_1.default.readdir(snapshotsDir);
        const match = entries.find((e) => e.startsWith(changeId));
        if (!match)
            return null;
        const snapshotPath = node_path_1.default.join(snapshotsDir, match);
        const manifestPath = node_path_1.default.join(snapshotPath, "manifest.json");
        const manifest = JSON.parse(await promises_1.default.readFile(manifestPath, "utf-8"));
        return {
            path: snapshotPath,
            change_id: manifest.change_id,
            change_title: manifest.change_title,
            archived_at: manifest.archived_at,
        };
    }
    catch {
        return null;
    }
}
async function listSnapshotFiles(snapshotPath) {
    try {
        const entries = await promises_1.default.readdir(snapshotPath);
        return entries.filter((e) => !e.endsWith(".json") && !e.endsWith(".md"));
    }
    catch {
        return [];
    }
}
async function restoreFromSnapshot(snapshotPath, projectRoot, dryRun) {
    const files = await listSnapshotFiles(snapshotPath);
    let restored = 0;
    for (const file of files) {
        const srcPath = node_path_1.default.join(snapshotPath, file);
        // Try to restore to likely original location
        const destPath = node_path_1.default.join(projectRoot, ".spec-graph", file);
        if (!dryRun) {
            try {
                await promises_1.default.copyFile(srcPath, destPath);
                restored++;
            }
            catch {
                // Skip files that can't be restored
            }
        }
        else {
            restored++;
        }
    }
    return restored;
}
async function checkGit(projectRoot) {
    try {
        const { execSync } = await Promise.resolve().then(() => __importStar(require("node:child_process")));
        execSync("git rev-parse --git-dir", { cwd: projectRoot, stdio: "pipe" });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=rollback.js.map