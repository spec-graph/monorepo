/**
 * Merge-Queue Engine
 *
 * Serializes merge attempts for isolation units targeting a shared branch.
 * Before attempting a merge, the queue detects hidden overlaps: pairs of
 * units whose file lists share paths (a signal of likely conflict even
 * before the merge is attempted).
 *
 * State persisted at: .spec-graph/isolation/merge-queue.yaml
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  MergeQueue,
  MergeQueueItem,
  MergeQueueStatus,
} from "../../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../../utils/yaml";

// ============ Public API ============

export interface EnqueueOptions {
  fileList: string[];
}

export interface OverlapReport {
  unit_id: string;
  overlaps_with: string[];
  shared_files: string[];
}

export class MergeQueueManager {
  private projectRoot: string;
  private queuePath: string;

  constructor(projectRoot: string, targetBranch: string = "main") {
    this.projectRoot = projectRoot;
    this.queuePath = path.join(
      projectRoot,
      ".spec-graph",
      "isolation",
      "merge-queue.yaml",
    );
    this._targetBranch = targetBranch;
  }

  private _targetBranch: string;

  /**
   * Get the full queue state.
   */
  async getQueue(): Promise<MergeQueue> {
    const data = await tryReadYaml<MergeQueue>(this.queuePath);
    if (!data) return { target_branch: this._targetBranch, items: [] };
    return data;
  }

  /**
   * Enqueue a unit for merge.
   */
  async enqueue(unitId: string, opts: EnqueueOptions): Promise<MergeQueueItem> {
    const queue = await this.getQueue();

    // Reject duplicates
    const existing = queue.items.find((i) => i.unit_id === unitId);
    if (existing && existing.status !== "failed") {
      throw new Error(
        `Unit '${unitId}' is already in the queue (status=${existing.status})`,
      );
    }

    // Remove any previous failed entry for this unit
    queue.items = queue.items.filter((i) => i.unit_id !== unitId);

    const item: MergeQueueItem = {
      unit_id: unitId,
      status: "queued",
      position: queue.items.length + 1,
      file_list: opts.fileList,
      enqueued_at: new Date().toISOString(),
    };

    queue.items.push(item);
    await this.saveQueue(queue);
    return item;
  }

  /**
   * Dequeue the next item that is ready to merge.
   * Returns null if the queue is empty or all items are being processed.
   */
  async dequeue(): Promise<MergeQueueItem | null> {
    const queue = await this.getQueue();
    const next = queue.items.find((i) => i.status === "queued");
    if (!next) return null;
    next.status = "checking";
    await this.saveQueue(queue);
    return next;
  }

  /**
   * Mark an item as merged.
   */
  async markMerged(unitId: string): Promise<void> {
    const queue = await this.getQueue();
    const item = queue.items.find((i) => i.unit_id === unitId);
    if (!item) throw new Error(`Unit '${unitId}' not in queue`);
    item.status = "merged";
    item.merged_at = new Date().toISOString();
    await this.saveQueue(queue);
  }

  /**
   * Mark an item as failed, with a reason.
   */
  async markFailed(unitId: string, reason: string): Promise<void> {
    const queue = await this.getQueue();
    const item = queue.items.find((i) => i.unit_id === unitId);
    if (!item) throw new Error(`Unit '${unitId}' not in queue`);
    item.status = "failed";
    item.failure_reason = reason;
    await this.saveQueue(queue);
  }

  /**
   * Remove an item from the queue entirely.
   */
  async remove(unitId: string): Promise<void> {
    const queue = await this.getQueue();
    queue.items = queue.items.filter((i) => i.unit_id !== unitId);
    await this.reindex(queue);
    await this.saveQueue(queue);
  }

  /**
   * Detect hidden overlaps: pairs of queued/active items whose file lists
   * share paths. This is a heuristic — overlapping file lists don't guarantee
   * a git conflict, but they strongly suggest one.
   */
  async detectOverlaps(): Promise<OverlapReport[]> {
    const queue = await this.getQueue();
    const active = queue.items.filter(
      (i) =>
        i.status === "queued" ||
        i.status === "checking" ||
        i.status === "merging",
    );

    const reports: OverlapReport[] = [];

    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const shared = intersectPaths(active[a].file_list, active[b].file_list);
        if (shared.length > 0) {
          reports.push({
            unit_id: active[a].unit_id,
            overlaps_with: [active[b].unit_id],
            shared_files: shared,
          });
          reports.push({
            unit_id: active[b].unit_id,
            overlaps_with: [active[a].unit_id],
            shared_files: shared,
          });
          // Annotate the items
          const overlapsA = active[a].overlaps || [];
          const overlapsB = active[b].overlaps || [];
          if (!overlapsA.includes(active[b].unit_id))
            overlapsA.push(active[b].unit_id);
          if (!overlapsB.includes(active[a].unit_id))
            overlapsB.push(active[a].unit_id);
          active[a].overlaps = overlapsA;
          active[b].overlaps = overlapsB;
        }
      }
    }

    if (reports.length > 0) await this.saveQueue(queue);
    return reports;
  }

  /**
   * Return just the items, ordered by position.
   */
  async listItems(): Promise<MergeQueueItem[]> {
    const queue = await this.getQueue();
    return [...queue.items].sort((a, b) => a.position - b.position);
  }

  // ============ internal ============

  private async saveQueue(queue: MergeQueue): Promise<void> {
    queue.target_branch = this._targetBranch;
    await fs.mkdir(path.dirname(this.queuePath), { recursive: true });
    await writeYaml(this.queuePath, queue);
  }

  private async reindex(queue: MergeQueue): Promise<void> {
    queue.items.forEach((item, idx) => {
      item.position = idx + 1;
    });
  }
}

// ============ helpers ============

/**
 * Find paths that appear in both lists (normalized for comparison).
 * Treats paths as case-sensitive, slash-normalized.
 */
function intersectPaths(a: string[], b: string[]): string[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "");
  const setB = new Set(b.map(norm));
  return a.filter((p) => setB.has(norm(p)));
}
