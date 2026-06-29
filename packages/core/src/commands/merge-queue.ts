import chalk from "chalk";
import { MergeQueueManager } from "../engine/isolation/merge-queue";

export interface MergeQueueOptions {
  subcommand?: string;
  unitId?: string;
  files?: string;
  target?: string;
  reason?: string;
  json?: boolean;
}

export async function mergeQueueCommand(
  projectRoot: string,
  options: MergeQueueOptions,
): Promise<void> {
  const sub = options.subcommand || "list";
  const mq = new MergeQueueManager(projectRoot, options.target || "main");

  try {
    switch (sub) {
      case "enqueue":
        await enqueueCmd(mq, options);
        break;
      case "dequeue":
        await dequeueCmd(mq, options);
        break;
      case "list":
        await listCmd(mq, options);
        break;
      case "overlaps":
        await overlapsCmd(mq, options);
        break;
      case "mark-merged":
        await markMergedCmd(mq, options);
        break;
      case "mark-failed":
        await markFailedCmd(mq, options);
        break;
      case "remove":
        await removeCmd(mq, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${sub}`));
        console.log(
          "Available: enqueue, dequeue, list, overlaps, mark-merged, mark-failed, remove",
        );
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}

async function enqueueCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red(
        "✗ Unit ID required. Usage: spec-graph merge-queue enqueue <id> --files <list>",
      ),
    );
    process.exit(1);
    return;
  }
  const fileList = opts.files
    ? opts.files
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  const item = await mq.enqueue(opts.unitId, { fileList });
  console.log(
    chalk.green(`\n✓ Enqueued ${opts.unitId} at position ${item.position}\n`),
  );
}

async function dequeueCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  const item = await mq.dequeue();

  if (!item) {
    console.log(chalk.yellow("\nQueue empty — nothing to dequeue.\n"));
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  console.log(
    chalk.green(`\n✓ Dequeued ${item.unit_id} (status=${item.status})`),
  );
  console.log(`  Files: ${item.file_list.length}\n`);
}

async function listCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  const items = await mq.listItems();
  const queue = await mq.getQueue();

  if (items.length === 0) {
    console.log(chalk.yellow("\nMerge queue empty."));
    console.log(
      chalk.gray(
        "  Run `spec-graph merge-queue enqueue <id> --files <list>` to add items.\n",
      ),
    );
    return;
  }

  if (opts.json) {
    console.log(
      JSON.stringify({ target_branch: queue.target_branch, items }, null, 2),
    );
    return;
  }

  console.log(
    chalk.bold(`\n🔀 Merge Queue (target: ${queue.target_branch})\n`),
  );
  for (const item of items) {
    const statusColor = colorForStatus(item.status);
    const overlapNote = item.overlaps?.length
      ? chalk.yellow(` ⚠ overlaps: ${item.overlaps.join(", ")}`)
      : "";
    console.log(
      `  ${item.position}. ${item.unit_id} [${statusColor(item.status)}] files=${item.file_list.length}${overlapNote}`,
    );
  }
  console.log("");
}

async function overlapsCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  const reports = await mq.detectOverlaps();

  if (opts.json) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  if (reports.length === 0) {
    console.log(
      chalk.green("\n✓ No overlaps detected between queued items.\n"),
    );
    return;
  }

  console.log(chalk.yellow(`\n⚠ ${reports.length} overlap(s) detected:\n`));
  for (const r of reports) {
    console.log(
      chalk.bold(`  ${r.unit_id}`) +
        chalk.yellow(` overlaps with ${r.overlaps_with.join(", ")}`),
    );
    for (const f of r.shared_files) {
      console.log(chalk.yellow(`    • ${f}`));
    }
  }
  console.log("");
}

async function markMergedCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  await mq.markMerged(opts.unitId);
  console.log(chalk.green(`\n✓ Marked ${opts.unitId} as merged\n`));
}

async function markFailedCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  await mq.markFailed(opts.unitId, opts.reason || "unspecified");
  console.log(
    chalk.red(
      `\n✗ Marked ${opts.unitId} as failed: ${opts.reason || "unspecified"}\n`,
    ),
  );
}

async function removeCmd(
  mq: MergeQueueManager,
  opts: MergeQueueOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  await mq.remove(opts.unitId);
  console.log(chalk.green(`\n✓ Removed ${opts.unitId} from queue\n`));
}

function colorForStatus(status: string): chalk.Chalk {
  switch (status) {
    case "merged":
      return chalk.green;
    case "queued":
      return chalk.cyan;
    case "checking":
      return chalk.yellow;
    case "merging":
      return chalk.magenta;
    case "failed":
      return chalk.red;
    default:
      return chalk.white;
  }
}
