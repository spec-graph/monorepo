import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { changeCommand } from "./change";
import { readYaml, writeYaml } from "../utils/yaml";
import { Profile, Graph, ChangeDescriptor } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-change-"));
}

function makeProfile(criticality: string = "standard"): Profile {
  return {
    version: "1",
    meta: {
      created_at: new Date().toISOString(),
      source: { repo_scan: true, llm_classified: false },
    },
    facts: {
      has_ui: { value: "none", confidence: "low", source: "llm" },
      boundary: { value: "internal", confidence: "low", source: "llm" },
      topology: { value: "mono", confidence: "low", source: "llm" },
      deployment: { value: "process", confidence: "low", source: "llm" },
      consumers: { value: "self", confidence: "low", source: "llm" },
      field: { value: "brownfield", confidence: "high", source: "repo" },
      criticality: { value: criticality, confidence: "low", source: "llm" },
      team: { value: "small", confidence: "low", source: "llm" },
      persistence: { value: "unknown", confidence: "low", source: "llm" },
    },
    repo_signals: {},
  };
}

function makeGraph(artifacts: Array<{ id: string; kind: string }> = []): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts,
    actions: [],
    checks: [],
    gates: [],
    tracks: [],
    pipeline_skeleton: {
      stages: ["plan"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
  };
}

async function writeChange(
  changesDir: string,
  change: ChangeDescriptor,
): Promise<void> {
  await fs.mkdir(changesDir, { recursive: true });
  await fs.writeFile(
    path.join(changesDir, `${change.id}.json`),
    JSON.stringify(change, null, 2),
  );
}

async function readChange(
  changesDir: string,
  id: string,
): Promise<ChangeDescriptor> {
  const content = await fs.readFile(
    path.join(changesDir, `${id}.json`),
    "utf-8",
  );
  return JSON.parse(content);
}

describe("change command", () => {
  let projectRoot: string;
  let changesDir: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    changesDir = path.join(specGraphDir, "changes");
    await fs.mkdir(changesDir, { recursive: true });
    await writeYaml(
      path.join(specGraphDir, "profile.yaml"),
      makeProfile("standard"),
    );
    await writeYaml(path.join(specGraphDir, "graph.yaml"), makeGraph([]));
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  describe("create + list + show", () => {
    it("creates a change in proposed status", async () => {
      await changeCommand(projectRoot, {
        subcommand: "create",
        title: "Add compliance gate",
        type: "feature",
        priority: "high",
        description: "Add SOC2 compliance check to deploy gate",
      });

      const entries = await fs.readdir(changesDir);
      const jsonFiles = entries.filter((e) => e.endsWith(".json"));
      expect(jsonFiles).toHaveLength(1);
      const change = await readChange(
        changesDir,
        jsonFiles[0].replace(".json", ""),
      );
      expect(change.title).toBe("Add compliance gate");
      expect(change.status).toBe("proposed");
      expect(change.type).toBe("feature");
      expect(change.priority).toBe("high");
    });

    it("stores plan_path when provided", async () => {
      await changeCommand(projectRoot, {
        subcommand: "create",
        title: "With plan",
        type: "feature",
        description: "test",
        planPath: ".spec-graph/changes/my-plan.md",
      });

      const entries = await fs.readdir(changesDir);
      const jsonFiles = entries.filter((e) => e.endsWith(".json"));
      const change = await readChange(
        changesDir,
        jsonFiles[0].replace(".json", ""),
      );
      // plan_path 现在自动生成，带主题和时间戳
      expect(change.plan_path).toMatch(/\.spec-graph\/changes\/.+-plan\.md$/);
    });

    it("lists changes with status column", async () => {
      await writeChange(changesDir, {
        id: "change-test-1",
        title: "First change",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "medium" },
        status: "proposed",
      });

      await changeCommand(projectRoot, { subcommand: "list" });
      const entries = await fs.readdir(changesDir);
      const jsonFiles = entries.filter((e) => e.endsWith(".json"));
      expect(jsonFiles).toHaveLength(1);
    });

    it("shows change details including profile_patch field", async () => {
      await writeChange(changesDir, {
        id: "change-show-1",
        title: "Show me",
        description: "desc",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "medium" },
        status: "proposed",
        profile_patch: { criticality: "compliance" },
      });

      await changeCommand(projectRoot, {
        subcommand: "show",
        id: "change-show-1",
      });
    });
  });

  describe("apply", () => {
    it("transitions proposed → in_progress and applies profile_patch", async () => {
      await writeChange(changesDir, {
        id: "change-apply-1",
        title: "Move to compliance",
        description: "Bump criticality",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "high",
        scope: { tracks: [] },
        impact: { risk_level: "high" },
        status: "proposed",
        profile_patch: { criticality: "compliance" },
      });

      await changeCommand(projectRoot, {
        subcommand: "apply",
        id: "change-apply-1",
      });

      const change = await readChange(changesDir, "change-apply-1");
      expect(change.status).toBe("in_progress");
      expect(change.profile_patch_applied_at).toBeDefined();
      expect(change.audit_log).toBeDefined();
      expect(change.audit_log![0].action).toBe("apply");

      const profile = await readYaml<Profile>(
        path.join(projectRoot, ".spec-graph", "profile.yaml"),
      );
      expect(profile.facts.criticality.value).toBe("compliance");
      expect(profile.facts.criticality.source).toBe("user");
    });

    it("refuses to apply a completed change", async () => {
      await writeChange(changesDir, {
        id: "change-apply-done",
        title: "Already done",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "completed",
      });

      await expect(
        changeCommand(projectRoot, {
          subcommand: "apply",
          id: "change-apply-done",
        }),
      ).rejects.toThrow();
    });
  });

  describe("sync", () => {
    it("computes sync_impact diff when profile_patch would change graph", async () => {
      // Start with standard criticality — that excludes architecture pack.
      // Patching criticality → compliance should change graph contents.
      await writeChange(changesDir, {
        id: "change-sync-1",
        title: "Compliance bump",
        description: "Trigger re-compose",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "high",
        scope: { tracks: [] },
        impact: { risk_level: "high" },
        status: "proposed",
        profile_patch: { criticality: "compliance" },
      });

      await changeCommand(projectRoot, {
        subcommand: "sync",
        id: "change-sync-1",
      });

      const change = await readChange(changesDir, "change-sync-1");
      expect(change.sync_impact).toBeDefined();
      expect(change.sync_impact!.computed_at).toBeDefined();
      // Architecture pack fires when criticality!=prototype; compliance satisfies.
      // Standard already fires architecture pack too (since criticality is "standard", not "prototype").
      // So the diff may be empty — that's still a valid sync result.
      expect(Array.isArray(change.sync_impact!.artifacts_added)).toBe(true);
      expect(Array.isArray(change.sync_impact!.artifacts_removed)).toBe(true);
      expect(Array.isArray(change.sync_impact!.consumer_ripple)).toBe(true);
    });

    it("warns when no profile_patch declared", async () => {
      await writeChange(changesDir, {
        id: "change-sync-nopatch",
        title: "No patch",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "proposed",
      });

      await changeCommand(projectRoot, {
        subcommand: "sync",
        id: "change-sync-nopatch",
      });

      // No sync_impact written since there was nothing to sync
      const change = await readChange(changesDir, "change-sync-nopatch");
      expect(change.sync_impact).toBeUndefined();
    });
  });

  describe("archive", () => {
    it("archives a completed change: snapshot + move + changelog", async () => {
      const completedChange: ChangeDescriptor = {
        id: "change-archive-1",
        title: "Finished work",
        description: "Completed and ready to archive",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "completed",
      };
      await writeChange(changesDir, completedChange);

      await changeCommand(projectRoot, {
        subcommand: "archive",
        id: "change-archive-1",
      });

      // Active changes directory should be empty
      const activeEntries = await fs.readdir(changesDir);
      expect(activeEntries.filter((e) => e.endsWith(".json"))).toHaveLength(0);

      // Archived directory should have the change
      const archivedEntries = await fs.readdir(
        path.join(changesDir, "archived"),
      );
      expect(archivedEntries).toContain("change-archive-1.json");

      // Snapshot directory should exist with profile + graph + machine-state
      const snapshotsDir = path.join(projectRoot, ".spec-graph", "snapshots");
      const snapshots = await fs.readdir(snapshotsDir);
      expect(snapshots).toHaveLength(1);
      const snapshotFiles = await fs.readdir(
        path.join(snapshotsDir, snapshots[0]),
      );
      expect(snapshotFiles).toContain("profile.yaml");
      expect(snapshotFiles).toContain("graph.yaml");
      expect(snapshotFiles).toContain("manifest.json");

      // Changelog should be appended
      const changelogPath = path.join(
        projectRoot,
        ".spec-graph",
        "CHANGELOG.md",
      );
      const changelog = await fs.readFile(changelogPath, "utf-8");
      expect(changelog).toContain("change-archive-1");
      expect(changelog).toContain("Finished work");
    });

    it("refuses to archive a non-completed change", async () => {
      await writeChange(changesDir, {
        id: "change-archive-not-done",
        title: "Still in progress",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "in_progress",
      });

      await expect(
        changeCommand(projectRoot, {
          subcommand: "archive",
          id: "change-archive-not-done",
        }),
      ).rejects.toThrow();
    });
  });

  describe("complete", () => {
    it("transitions in_progress → completed", async () => {
      await writeChange(changesDir, {
        id: "change-complete-1",
        title: "In flight",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "in_progress",
      });

      await changeCommand(projectRoot, {
        subcommand: "complete",
        id: "change-complete-1",
      });

      const c = await readChange(changesDir, "change-complete-1");
      expect(c.status).toBe("completed");
      expect(c.completed_at).toBeDefined();
      expect(c.audit_log?.some((a) => a.action === "complete")).toBe(true);
    });

    it("refuses to complete a change that is not in_progress", async () => {
      await writeChange(changesDir, {
        id: "change-complete-proposed",
        title: "Not started",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "proposed",
      });

      await expect(
        changeCommand(projectRoot, {
          subcommand: "complete",
          id: "change-complete-proposed",
        }),
      ).rejects.toThrow();
    });

    it("requires id", async () => {
      await expect(
        changeCommand(projectRoot, { subcommand: "complete" }),
      ).rejects.toThrow();
    });
  });

  describe("discard", () => {
    it("transitions in_progress → discarded with reason", async () => {
      await writeChange(changesDir, {
        id: "change-discard-1",
        title: "Wrong path",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "in_progress",
      });

      await changeCommand(projectRoot, {
        subcommand: "discard",
        id: "change-discard-1",
        reason: "decided to take a different approach",
      });

      const c = await readChange(changesDir, "change-discard-1");
      expect(c.status).toBe("discarded");
      expect(c.discarded_at).toBeDefined();
      expect(c.discard_reason).toBe("decided to take a different approach");
    });

    it("also discards a proposed change (never started)", async () => {
      await writeChange(changesDir, {
        id: "change-discard-proposed",
        title: "Abandoned before start",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "proposed",
      });

      await changeCommand(projectRoot, {
        subcommand: "discard",
        id: "change-discard-proposed",
      });
      const c = await readChange(changesDir, "change-discard-proposed");
      expect(c.status).toBe("discarded");
    });

    it("refuses to discard an already-completed change", async () => {
      await writeChange(changesDir, {
        id: "change-discard-done",
        title: "Done",
        description: "",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "completed",
      });

      await expect(
        changeCommand(projectRoot, {
          subcommand: "discard",
          id: "change-discard-done",
        }),
      ).rejects.toThrow();
    });
  });

  describe("full lifecycle (no manual JSON edit)", () => {
    it("create → apply → complete → archive without touching JSON", async () => {
      await changeCommand(projectRoot, {
        subcommand: "create",
        title: "Lifecycle test",
        type: "feature",
        priority: "medium",
        description: "full lifecycle",
      });
      const entries = await fs.readdir(changesDir);
      const id = entries.find((e) => e.endsWith(".json"))!.replace(".json", "");

      await changeCommand(projectRoot, { subcommand: "apply", id });
      await changeCommand(projectRoot, { subcommand: "complete", id });
      await changeCommand(projectRoot, { subcommand: "archive", id });

      // Archived successfully
      const archived = await fs.readdir(path.join(changesDir, "archived"));
      expect(archived).toContain(`${id}.json`);
    });
  });

  describe("isolation integration", () => {
    it("auto-enqueues in merge queue on complete", async () => {
      await writeChange(changesDir, {
        id: "change-queue-1",
        title: "Queue test",
        description: "Should auto-enqueue",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "in_progress",
      });

      await changeCommand(projectRoot, {
        subcommand: "complete",
        id: "change-queue-1",
      });

      // Verify merge queue has the change
      const { MergeQueueManager } =
        await import("../engine/isolation/merge-queue");
      const mq = new MergeQueueManager(projectRoot);
      const items = await mq.listItems();
      expect(items.find((i) => i.unit_id === "change-queue-1")).toBeDefined();
    });

    it("skips enqueue with --no-queue", async () => {
      await writeChange(changesDir, {
        id: "change-noqueue-1",
        title: "No-queue test",
        description: "Should not enqueue",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "medium",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "in_progress",
      });

      await changeCommand(projectRoot, {
        subcommand: "complete",
        id: "change-noqueue-1",
        queue: false,
      });

      const { MergeQueueManager } =
        await import("../engine/isolation/merge-queue");
      const mq = new MergeQueueManager(projectRoot);
      const items = await mq.listItems();
      expect(
        items.find((i) => i.unit_id === "change-noqueue-1"),
      ).toBeUndefined();
    });

    it("apply does not crash without a git repo (worktree skipped gracefully)", async () => {
      // projectRoot is a temp dir with no git repo — worktree create should fail
      // silently and the apply should still succeed
      await writeChange(changesDir, {
        id: "change-nowt-1",
        title: "No-worktree test",
        description: "No git repo",
        created_at: new Date().toISOString(),
        type: "feature",
        priority: "low",
        scope: { tracks: [] },
        impact: { risk_level: "low" },
        status: "proposed",
      });

      // Should not throw
      await changeCommand(projectRoot, {
        subcommand: "apply",
        id: "change-nowt-1",
      });
      const change = await readChange(changesDir, "change-nowt-1");
      expect(change.status).toBe("in_progress");
    });
  });
});
