import chalk from "chalk";
import { WorktreeManager } from "../engine/isolation/worktree";

export interface WorktreeOptions {
  subcommand?: string;
  unitId?: string;
  track?: string;
  to?: string;
  dryRun?: boolean;
  branch?: string;
  baseBranch?: string;
  purge?: boolean;
  json?: boolean;
  reason?: string;
  reviewedBy?: string;
}

export async function worktreeCommand(
  projectRoot: string,
  options: WorktreeOptions,
): Promise<void> {
  const sub = options.subcommand || "list";
  const wm = new WorktreeManager({ projectRoot });

  try {
    switch (sub) {
      case "create":
        await createCmd(wm, options);
        break;
      case "list":
        await listCmd(wm, options);
        break;
      case "remove":
        await removeCmd(wm, options);
        break;
      case "merge":
        await mergeCmd(wm, options);
        break;
      case "status":
        await statusCmd(wm, options);
        break;
      case "self-verify":
        await transitionStateCmd(wm, options, "self_verified");
        break;
      case "submit":
        await transitionStateCmd(wm, options, "submitted");
        break;
      case "accept":
        await transitionStateCmd(wm, options, "accepted");
        break;
      case "reject":
        await transitionStateCmd(wm, options, "rejected");
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${sub}`));
        console.log(
          "Available: create, list, remove, merge, status, self-verify, submit, accept, reject",
        );
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}

/**
 * Transition an isolation unit to a new enriched lifecycle state.
 * Used for multi-party handoff: implementer → submitter → reviewer → merger.
 *
 * Valid transitions:
 *   active → self_verified (implementer finished + ran local checks)
 *   self_verified → submitted (ready for reviewer)
 *   submitted → accepted (reviewer approved)
 *   submitted → rejected (reviewer rejected, back to implementer)
 *   rejected → self_verified (rework done, resubmit)
 *   accepted → merged (merger merges — handled by 'merge' subcommand)
 */
async function transitionStateCmd(
  wm: WorktreeManager,
  options: WorktreeOptions,
  newState: "self_verified" | "submitted" | "accepted" | "rejected",
): Promise<void> {
  if (!options.unitId) {
    console.log(chalk.red("✗ --unit-id is required"));
    process.exit(1);
    return;
  }

  const unit = await wm.get(options.unitId);
  if (!unit) {
    console.log(chalk.red(`✗ Isolation unit not found: ${options.unitId}`));
    process.exit(1);
    return;
  }

  const validTransitions: Record<string, string[]> = {
    self_verified: ["active", "rejected"],
    submitted: ["self_verified"],
    accepted: ["submitted"],
    rejected: ["submitted"],
  };

  const allowedFrom = validTransitions[newState];
  if (!allowedFrom.includes(unit.status)) {
    console.log(
      chalk.red(
        `✗ Invalid transition: ${unit.status} → ${newState}. Valid from: ${allowedFrom.join(", ")}`,
      ),
    );
    process.exit(1);
    return;
  }

  const now = new Date().toISOString();
  unit.status = newState;

  if (newState === "self_verified") unit.self_verified_at = now;
  if (newState === "submitted") unit.submitted_at = now;
  if (newState === "accepted") {
    unit.accepted_at = now;
    unit.reviewed_by = options.reviewedBy;
  }
  if (newState === "rejected") {
    unit.rejected_at = now;
    unit.rejected_reason = options.reason || "(no reason given)";
    unit.reviewed_by = options.reviewedBy;
  }

  await wm.update(unit);

  if (options.json) {
    console.log(JSON.stringify({ unit_id: unit.id, status: newState }, null, 2));
  } else {
    console.log(chalk.green(`✓ Unit ${unit.id} transitioned to '${newState}'`));
    if (newState === "rejected" && options.reason) {
      console.log(chalk.gray(`  Reason: ${options.reason}`));
    }
    if (options.reviewedBy) {
      console.log(chalk.gray(`  Reviewed by: ${options.reviewedBy}`));
    }
  }
}

async function createCmd(
  wm: WorktreeManager,
  opts: WorktreeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red(
        "✗ Unit ID required. Usage: spec-graph worktree create <id> --track <track>",
      ),
    );
    process.exit(1);
    return;
  }
  if (!opts.track) {
    console.log(
      chalk.red(
        "✗ Track required. Usage: spec-graph worktree create <id> --track <track>",
      ),
    );
    process.exit(1);
    return;
  }

  const unit = await wm.create(opts.unitId, opts.track, {
    baseBranch: opts.baseBranch,
    branch: opts.branch,
  });

  console.log(chalk.green(`\n✓ Created worktree for ${unit.id}`));
  console.log(`  Branch: ${unit.branch}`);
  console.log(`  Path:   ${unit.path}`);
  console.log(`  Base:   ${unit.base_commit?.substring(0, 8) || "unknown"}\n`);
}

async function listCmd(
  wm: WorktreeManager,
  opts: WorktreeOptions,
): Promise<void> {
  const units = await wm.list();

  if (units.length === 0) {
    console.log(chalk.yellow("\nNo isolation units."));
    console.log(
      chalk.gray(
        "  Run `spec-graph worktree create <id> --track <track>` to create one.\n",
      ),
    );
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(units, null, 2));
    return;
  }

  console.log(chalk.bold("\n🌳 Isolation Units\n"));
  for (const u of units) {
    const statusColor =
      u.status === "active"
        ? chalk.green
        : u.status === "merged"
          ? chalk.gray
          : chalk.yellow;
    console.log(
      `  • ${u.id} [${statusColor(u.status)}] track=${u.track} branch=${u.branch}`,
    );
  }
  console.log("");
}

async function removeCmd(
  wm: WorktreeManager,
  opts: WorktreeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red("✗ Unit ID required. Usage: spec-graph worktree remove <id>"),
    );
    process.exit(1);
    return;
  }

  await wm.remove(opts.unitId, { purge: opts.purge });
  const action = opts.purge ? "Purged" : "Removed";
  console.log(chalk.green(`\n✓ ${action} worktree for ${opts.unitId}\n`));
}

async function mergeCmd(
  wm: WorktreeManager,
  opts: WorktreeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red(
        "✗ Unit ID required. Usage: spec-graph worktree merge <id> --to <branch>",
      ),
    );
    process.exit(1);
    return;
  }
  const target = opts.to || "main";

  const result = await wm.merge(opts.unitId, target, { dryRun: opts.dryRun });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.success) {
    const mode = opts.dryRun ? "(dry-run) " : "";
    console.log(
      chalk.green(`\n✓ ${mode}Merge ${opts.unitId} → ${target} succeeded`),
    );
    if (result.mergedCommit) {
      console.log(
        chalk.gray(`  Commit: ${result.mergedCommit.substring(0, 8)}\n`),
      );
    }
  } else {
    console.log(chalk.red(`\n✗ Merge failed`));
    if (result.error) console.log(chalk.red(`  ${result.error}`));
    if (result.conflicts.length > 0) {
      console.log(chalk.yellow(`  Conflicts (${result.conflicts.length}):`));
      for (const f of result.conflicts) console.log(chalk.yellow(`    • ${f}`));
    }
    console.log("");
    process.exit(1);
  }
}

async function statusCmd(
  wm: WorktreeManager,
  opts: WorktreeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  const unit = await wm.get(opts.unitId);
  if (!unit) {
    console.log(chalk.red(`✗ Unit not found: ${opts.unitId}`));
    process.exit(1);
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(unit, null, 2));
    return;
  }

  console.log(chalk.bold(`\n🌳 Worktree: ${unit.id}\n`));
  console.log(`  Track:   ${unit.track}`);
  console.log(`  Branch:  ${unit.branch}`);
  console.log(`  Path:    ${unit.path}`);
  console.log(`  Status:  ${unit.status}`);
  console.log(`  Created: ${unit.created_at}`);
  if (unit.base_commit)
    console.log(`  Base:    ${unit.base_commit.substring(0, 12)}`);
  if (unit.merged_at) console.log(`  Merged:  ${unit.merged_at}`);
  console.log("");
}
