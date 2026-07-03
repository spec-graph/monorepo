/**
 * MergeQueue — manages sequential merging of worktree units.
 *
 * When multiple parallel sub-agents complete, their worktrees must be
 * merged back into the main branch in the correct order (respecting
 * wave dependencies). The MergeQueue ensures:
 *   - Wave 0 units merge before Wave 1
 *   - Each merge is verified before proceeding
 *   - Conflicts are detected and reported
 */

import type { IsolationUnit } from '../types/index.js';
import type { WorktreeManager, WorktreeMergeResult } from './index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeQueueItem {
  unitId: string;
  wave: number;
  status: 'pending' | 'merging' | 'merged' | 'failed' | 'skipped';
  result?: WorktreeMergeResult;
}

export interface MergeQueue {
  items: MergeQueueItem[];
  currentWave: number;
}

export interface MergeQueueResult {
  allMerged: boolean;
  merged: string[];
  failed: string[];
  skipped: string[];
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Build a merge queue from units grouped by wave.
 *
 * @param unitsByWave - map of wave number → unit ids
 */
export function buildMergeQueue(
  unitsByWave: Record<number, string[]>,
): MergeQueue {
  const items: MergeQueueItem[] = [];
  const waves = Object.keys(unitsByWave)
    .map(Number)
    .sort((a, b) => a - b);

  for (const wave of waves) {
    for (const unitId of unitsByWave[wave]) {
      items.push({
        unitId,
        wave,
        status: 'pending',
      });
    }
  }

  return {
    items,
    currentWave: waves[0] ?? 0,
  };
}

/**
 * Execute the merge queue sequentially.
 *
 * @param queue - the merge queue
 * @param manager - the worktree manager to perform actual merges
 * @returns merge result summary
 */
export function executeMergeQueue(
  queue: MergeQueue,
  manager: WorktreeManager,
): MergeQueueResult {
  const merged: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];

  // Group items by wave
  const waveItems = new Map<number, MergeQueueItem[]>();
  for (const item of queue.items) {
    if (!waveItems.has(item.wave)) {
      waveItems.set(item.wave, []);
    }
    waveItems.get(item.wave)!.push(item);
  }

  const waves = Array.from(waveItems.keys()).sort((a, b) => a - b);

  for (const wave of waves) {
    const items = waveItems.get(wave)!;

    // Merge all items in this wave
    for (const item of items) {
      item.status = 'merging';
      const result = manager.merge(item.unitId);
      item.result = result;

      if (result.success) {
        item.status = 'merged';
        merged.push(item.unitId);
      } else {
        item.status = 'failed';
        failed.push(item.unitId);
        conflicts.push(...result.conflicts);

        // Skip remaining items in this wave
        for (const remaining of items) {
          if (remaining.status === 'pending') {
            remaining.status = 'skipped';
            skipped.push(remaining.unitId);
          }
        }
        break;
      }
    }

    // If any item in this wave failed, skip all subsequent waves
    if (failed.length > 0) {
      for (const laterWave of waves.filter((w) => w > wave)) {
        for (const item of waveItems.get(laterWave)!) {
          if (item.status === 'pending') {
            item.status = 'skipped';
            skipped.push(item.unitId);
          }
        }
      }
      break;
    }
  }

  return {
    allMerged: failed.length === 0 && skipped.length === 0,
    merged,
    failed,
    skipped,
    conflicts,
  };
}
