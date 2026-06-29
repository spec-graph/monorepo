import { describe, it, expect, beforeEach } from "vitest";
import { MergeQueueManager } from "./merge-queue";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-mq-"));
}

describe("MergeQueueManager", () => {
  let dir: string;
  let mq: MergeQueueManager;

  beforeEach(async () => {
    dir = await makeTempDir();
    mq = new MergeQueueManager(dir, "main");
  });

  it("starts empty", async () => {
    const items = await mq.listItems();
    expect(items).toEqual([]);
  });

  it("enqueues and lists items in order", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    await mq.enqueue("story-2", { fileList: ["src/b.ts"] });

    const items = await mq.listItems();
    expect(items.length).toBe(2);
    expect(items[0].unit_id).toBe("story-1");
    expect(items[0].position).toBe(1);
    expect(items[1].unit_id).toBe("story-2");
    expect(items[1].position).toBe(2);
  });

  it("rejects duplicate enqueues", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    await expect(
      mq.enqueue("story-1", { fileList: ["src/b.ts"] }),
    ).rejects.toThrow(/already in the queue/);
  });

  it("dequeues the next queued item and marks it checking", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    const item = await mq.dequeue();
    expect(item?.unit_id).toBe("story-1");
    expect(item?.status).toBe("checking");
  });

  it("returns null from dequeue when queue is empty", async () => {
    expect(await mq.dequeue()).toBeNull();
  });

  it("marks items as merged", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    await mq.markMerged("story-1");
    const items = await mq.listItems();
    expect(items[0].status).toBe("merged");
    expect(items[0].merged_at).toBeDefined();
  });

  it("marks items as failed with reason", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    await mq.markFailed("story-1", "conflict detected");
    const items = await mq.listItems();
    expect(items[0].status).toBe("failed");
    expect(items[0].failure_reason).toBe("conflict detected");
  });

  it("removes items and reindexes positions", async () => {
    await mq.enqueue("story-1", { fileList: ["src/a.ts"] });
    await mq.enqueue("story-2", { fileList: ["src/b.ts"] });
    await mq.enqueue("story-3", { fileList: ["src/c.ts"] });

    await mq.remove("story-2");
    const items = await mq.listItems();
    expect(items.length).toBe(2);
    expect(items[0].unit_id).toBe("story-1");
    expect(items[0].position).toBe(1);
    expect(items[1].unit_id).toBe("story-3");
    expect(items[1].position).toBe(2);
  });

  it("detects overlaps between queued items", async () => {
    await mq.enqueue("story-1", {
      fileList: ["src/shared/a.ts", "src/fe/x.ts"],
    });
    await mq.enqueue("story-2", {
      fileList: ["src/shared/a.ts", "src/fe/y.ts"],
    });

    const overlaps = await mq.detectOverlaps();
    expect(overlaps.length).toBe(2);
    expect(overlaps[0].shared_files).toContain("src/shared/a.ts");
  });

  it("reports no overlaps for disjoint file lists", async () => {
    await mq.enqueue("story-1", { fileList: ["src/fe/x.ts"] });
    await mq.enqueue("story-2", { fileList: ["src/be/y.ts"] });

    const overlaps = await mq.detectOverlaps();
    expect(overlaps).toEqual([]);
  });
});
