"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeQueueCommand = mergeQueueCommand;
const chalk_1 = __importDefault(require("chalk"));
const merge_queue_1 = require("../engine/isolation/merge-queue");
async function mergeQueueCommand(projectRoot, options) {
    const sub = options.subcommand || "list";
    const mq = new merge_queue_1.MergeQueueManager(projectRoot, options.target || "main");
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
                console.log(chalk_1.default.red(`✗ Unknown subcommand: ${sub}`));
                console.log("Available: enqueue, dequeue, list, overlaps, mark-merged, mark-failed, remove");
                process.exit(1);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        process.exit(1);
    }
}
async function enqueueCmd(mq, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required. Usage: spec-graph merge-queue enqueue <id> --files <list>"));
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
    console.log(chalk_1.default.green(`\n✓ Enqueued ${opts.unitId} at position ${item.position}\n`));
}
async function dequeueCmd(mq, opts) {
    const item = await mq.dequeue();
    if (!item) {
        console.log(chalk_1.default.yellow("\nQueue empty — nothing to dequeue.\n"));
        return;
    }
    if (opts.json) {
        console.log(JSON.stringify(item, null, 2));
        return;
    }
    console.log(chalk_1.default.green(`\n✓ Dequeued ${item.unit_id} (status=${item.status})`));
    console.log(`  Files: ${item.file_list.length}\n`);
}
async function listCmd(mq, opts) {
    const items = await mq.listItems();
    const queue = await mq.getQueue();
    if (items.length === 0) {
        console.log(chalk_1.default.yellow("\nMerge queue empty."));
        console.log(chalk_1.default.gray("  Run `spec-graph merge-queue enqueue <id> --files <list>` to add items.\n"));
        return;
    }
    if (opts.json) {
        console.log(JSON.stringify({ target_branch: queue.target_branch, items }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold(`\n🔀 Merge Queue (target: ${queue.target_branch})\n`));
    for (const item of items) {
        const statusColor = colorForStatus(item.status);
        const overlapNote = item.overlaps?.length
            ? chalk_1.default.yellow(` ⚠ overlaps: ${item.overlaps.join(", ")}`)
            : "";
        console.log(`  ${item.position}. ${item.unit_id} [${statusColor(item.status)}] files=${item.file_list.length}${overlapNote}`);
    }
    console.log("");
}
async function overlapsCmd(mq, opts) {
    const reports = await mq.detectOverlaps();
    if (opts.json) {
        console.log(JSON.stringify(reports, null, 2));
        return;
    }
    if (reports.length === 0) {
        console.log(chalk_1.default.green("\n✓ No overlaps detected between queued items.\n"));
        return;
    }
    console.log(chalk_1.default.yellow(`\n⚠ ${reports.length} overlap(s) detected:\n`));
    for (const r of reports) {
        console.log(chalk_1.default.bold(`  ${r.unit_id}`) +
            chalk_1.default.yellow(` overlaps with ${r.overlaps_with.join(", ")}`));
        for (const f of r.shared_files) {
            console.log(chalk_1.default.yellow(`    • ${f}`));
        }
    }
    console.log("");
}
async function markMergedCmd(mq, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required."));
        process.exit(1);
        return;
    }
    await mq.markMerged(opts.unitId);
    console.log(chalk_1.default.green(`\n✓ Marked ${opts.unitId} as merged\n`));
}
async function markFailedCmd(mq, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required."));
        process.exit(1);
        return;
    }
    await mq.markFailed(opts.unitId, opts.reason || "unspecified");
    console.log(chalk_1.default.red(`\n✗ Marked ${opts.unitId} as failed: ${opts.reason || "unspecified"}\n`));
}
async function removeCmd(mq, opts) {
    if (!opts.unitId) {
        console.log(chalk_1.default.red("✗ Unit ID required."));
        process.exit(1);
        return;
    }
    await mq.remove(opts.unitId);
    console.log(chalk_1.default.green(`\n✓ Removed ${opts.unitId} from queue\n`));
}
function colorForStatus(status) {
    switch (status) {
        case "merged":
            return chalk_1.default.green;
        case "queued":
            return chalk_1.default.cyan;
        case "checking":
            return chalk_1.default.yellow;
        case "merging":
            return chalk_1.default.magenta;
        case "failed":
            return chalk_1.default.red;
        default:
            return chalk_1.default.white;
    }
}
//# sourceMappingURL=merge-queue.js.map