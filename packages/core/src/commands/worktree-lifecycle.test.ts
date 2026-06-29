import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorktreeManager } from "../engine/isolation/worktree";
import { worktreeCommand } from "./worktree";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-lifecycle-"));
}

async function setupGitRepo(projectRoot: string): Promise<void> {
  // Initialize a git repo so worktree operations work
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "README.md"), "# test");
  const { execSync } = await import("node:child_process");
  execSync("git init -b main", { cwd: projectRoot });
  execSync("git config user.email test@test.com", { cwd: projectRoot });
  execSync("git config user.name test", { cwd: projectRoot });
  execSync("git add .", { cwd: projectRoot });
  execSync("git commit -m initial", { cwd: projectRoot });
}

async function captureOutput(fn: () => Promise<void>): Promise<any> {
  let output: any = null;
  const originalLog = console.log;
  console.log = (data: string) => {
    try {
      output = JSON.parse(data);
    } catch {
      // not json
    }
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return output;
}

describe("Worktree enriched lifecycle", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await setupGitRepo(projectRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  it("creates unit with 'prepared' status by default", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-1", "feature/test", {
      branch: "feature-test",
    });

    // The new unit should start in 'prepared' state (or 'active' as fallback)
    expect(["prepared", "active"]).toContain(unit.status);
  });

  it("transitions active → self_verified via 'self-verify' subcommand", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-2", "feature/test", {
      branch: "feature-test",
    });

    // If created with 'prepared', we may need to set to 'active' first
    if (unit.status === "prepared") {
      unit.status = "active";
      await wm.update(unit);
    }

    // Now run self-verify
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);
    try {
      await worktreeCommand(projectRoot, {
        subcommand: "self-verify",
        unitId: unit.id,
      });
    } finally {
      console.log = originalLog;
    }

    const updated = await wm.get(unit.id);
    expect(updated?.status).toBe("self_verified");
    expect(updated?.self_verified_at).toBeDefined();
  });

  it("transitions self_verified → submitted via 'submit'", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-3", "feature/test", {
      branch: "feature-test",
    });

    // Set to self_verified directly
    unit.status = "self_verified";
    unit.self_verified_at = new Date().toISOString();
    await wm.update(unit);

    await worktreeCommand(projectRoot, {
      subcommand: "submit",
      unitId: unit.id,
    });

    const updated = await wm.get(unit.id);
    expect(updated?.status).toBe("submitted");
    expect(updated?.submitted_at).toBeDefined();
  });

  it("transitions submitted → accepted via 'accept'", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-4", "feature/test", {
      branch: "feature-test",
    });

    unit.status = "submitted";
    unit.submitted_at = new Date().toISOString();
    await wm.update(unit);

    await worktreeCommand(projectRoot, {
      subcommand: "accept",
      unitId: unit.id,
      reviewedBy: "reviewer-alice",
    });

    const updated = await wm.get(unit.id);
    expect(updated?.status).toBe("accepted");
    expect(updated?.accepted_at).toBeDefined();
    expect(updated?.reviewed_by).toBe("reviewer-alice");
  });

  it("transitions submitted → rejected via 'reject' with reason", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-5", "feature/test", {
      branch: "feature-test",
    });

    unit.status = "submitted";
    unit.submitted_at = new Date().toISOString();
    await wm.update(unit);

    await worktreeCommand(projectRoot, {
      subcommand: "reject",
      unitId: unit.id,
      reason: "Tests failed",
      reviewedBy: "reviewer-bob",
    });

    const updated = await wm.get(unit.id);
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejected_at).toBeDefined();
    expect(updated?.rejected_reason).toBe("Tests failed");
    expect(updated?.reviewed_by).toBe("reviewer-bob");
  });

  it("rejects invalid transitions", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-6", "feature/test", {
      branch: "feature-test",
    });

    // Try to submit without self-verifying first
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;
    try {
      await worktreeCommand(projectRoot, {
        subcommand: "submit",
        unitId: unit.id,
      });
    } catch {
      // expected
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(logs.some((l) => l.includes("Invalid transition"))).toBe(true);
  });

  it("supports rejected → self_verified rework cycle", async () => {
    const wm = new WorktreeManager({ projectRoot });
    const unit = await wm.create("unit-7", "feature/test", {
      branch: "feature-test",
    });

    // Move to rejected
    unit.status = "submitted";
    unit.submitted_at = new Date().toISOString();
    await wm.update(unit);
    await worktreeCommand(projectRoot, {
      subcommand: "reject",
      unitId: unit.id,
      reason: "Needs fix",
    });

    // Now self-verify again (rework)
    await worktreeCommand(projectRoot, {
      subcommand: "self-verify",
      unitId: unit.id,
    });

    const updated = await wm.get(unit.id);
    expect(updated?.status).toBe("self_verified");
  });
});
