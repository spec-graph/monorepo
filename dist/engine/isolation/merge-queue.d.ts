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
import { MergeQueue, MergeQueueItem } from "../../types/index";
export interface EnqueueOptions {
    fileList: string[];
}
export interface OverlapReport {
    unit_id: string;
    overlaps_with: string[];
    shared_files: string[];
}
export declare class MergeQueueManager {
    private projectRoot;
    private queuePath;
    constructor(projectRoot: string, targetBranch?: string);
    private _targetBranch;
    /**
     * Get the full queue state.
     */
    getQueue(): Promise<MergeQueue>;
    /**
     * Enqueue a unit for merge.
     */
    enqueue(unitId: string, opts: EnqueueOptions): Promise<MergeQueueItem>;
    /**
     * Dequeue the next item that is ready to merge.
     * Returns null if the queue is empty or all items are being processed.
     */
    dequeue(): Promise<MergeQueueItem | null>;
    /**
     * Mark an item as merged.
     */
    markMerged(unitId: string): Promise<void>;
    /**
     * Mark an item as failed, with a reason.
     */
    markFailed(unitId: string, reason: string): Promise<void>;
    /**
     * Remove an item from the queue entirely.
     */
    remove(unitId: string): Promise<void>;
    /**
     * Detect hidden overlaps: pairs of queued/active items whose file lists
     * share paths. This is a heuristic — overlapping file lists don't guarantee
     * a git conflict, but they strongly suggest one.
     */
    detectOverlaps(): Promise<OverlapReport[]>;
    /**
     * Return just the items, ordered by position.
     */
    listItems(): Promise<MergeQueueItem[]>;
    private saveQueue;
    private reindex;
}
