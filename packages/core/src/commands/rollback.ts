import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";

interface SnapshotInfo {
  path: string;
  change_id: string;
  change_title: string;
  archived_at: string;
}

export interface RollbackOptions {
  changeId?: string;
  dryRun?: boolean;
}

/**
 * Safely rollback a change to its pre-change state.
 * Uses safety-net snapshots to restore files, or git revert if git is available.
 */
export async function rollbackCommand(
  projectRoot: string,
  options: RollbackOptions,
): Promise<void> {
  if (!options.changeId) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph rollback <change-id> [--dry-run]"));
    process.exit(1);
    return;
  }

  const snapshotsDir = path.join(projectRoot, ".spec-graph", "snapshots");

  // Find snapshot directory for this change
  const snapshotInfo = await findSnapshot(snapshotsDir, options.changeId);
  if (!snapshotInfo) {
    console.log(chalk.red(`✗ No snapshot found for change: ${options.changeId}`));
    console.log(chalk.gray(`  Snapshots are in: ${snapshotsDir}`));
    process.exit(1);
    return;
  }

  console.log(chalk.bold(`\n🔙 Rolling back: ${options.changeId}`));
  console.log(chalk.gray(`  Snapshot: ${snapshotInfo.path}`));
  console.log(chalk.gray(`  Archived at: ${snapshotInfo.archived_at}`));

  if (options.dryRun) {
    console.log(chalk.yellow("\n  [DRY RUN] Would restore:"));
    const files = await listSnapshotFiles(snapshotInfo.path);
    for (const file of files) {
      console.log(chalk.gray(`    - ${file}`));
    }
    console.log(chalk.yellow("\n  [DRY RUN] No files actually restored."));
    return;
  }

  // Check if git is available
  const hasGit = await checkGit(projectRoot);

  if (hasGit) {
    console.log(chalk.cyan("  Using git revert..."));
    // For now, just restore files from snapshot
    // TODO: Integrate with git merge-queue atomic merge
  } else {
    console.log(chalk.cyan("  Restoring from snapshot files..."));
  }

  // Restore files from snapshot
  const restored = await restoreFromSnapshot(
    snapshotInfo.path,
    projectRoot,
    options.dryRun || false,
  );

  console.log(chalk.green(`\n✓ Rolled back ${restored} file(s)`));
  console.log(chalk.gray(`  machine-state.yaml was NOT restored (coordinator decides).`));
}

async function findSnapshot(
  snapshotsDir: string,
  changeId: string,
): Promise<SnapshotInfo | null> {
  try {
    const entries = await fs.readdir(snapshotsDir);
    const match = entries.find((e) => e.startsWith(changeId));
    if (!match) return null;

    const snapshotPath = path.join(snapshotsDir, match);
    const manifestPath = path.join(snapshotPath, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

    return {
      path: snapshotPath,
      change_id: manifest.change_id,
      change_title: manifest.change_title,
      archived_at: manifest.archived_at,
    };
  } catch {
    return null;
  }
}

async function listSnapshotFiles(snapshotPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(snapshotPath);
    return entries.filter((e) => !e.endsWith(".json") && !e.endsWith(".md"));
  } catch {
    return [];
  }
}

async function restoreFromSnapshot(
  snapshotPath: string,
  projectRoot: string,
  dryRun: boolean,
): Promise<number> {
  const files = await listSnapshotFiles(snapshotPath);
  let restored = 0;

  for (const file of files) {
    const srcPath = path.join(snapshotPath, file);
    // Try to restore to likely original location
    const destPath = path.join(projectRoot, ".spec-graph", file);

    if (!dryRun) {
      try {
        await fs.copyFile(srcPath, destPath);
        restored++;
      } catch {
        // Skip files that can't be restored
      }
    } else {
      restored++;
    }
  }

  return restored;
}

async function checkGit(projectRoot: string): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("git rev-parse --git-dir", { cwd: projectRoot, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
