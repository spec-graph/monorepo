import { describe, it, expect, beforeEach } from "vitest";
import { WorktreeManager, parseMergeTreeConflicts } from "./worktree";
import { GitBackend } from "../../types/index";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Fake git backend for testing. Tracks calls and returns pre-configured
 * responses so we don't need a real git repo.
 */
class FakeGitBackend implements GitBackend {
  calls: Array<{ args: string[]; cwd?: string }> = [];
  responses: Map<string, { stdout: string; stderr: string; exitCode: number }> =
    new Map();
  paths: Set<string> = new Set();

  defaultResponse = { stdout: "", stderr: "", exitCode: 0 };

  setResponse(
    cmdPrefix: string,
    resp: { stdout?: string; stderr?: string; exitCode?: number },
  ): void {
    this.responses.set(cmdPrefix, {
      stdout: resp.stdout || "",
      stderr: resp.stderr || "",
      exitCode: resp.exitCode ?? 0,
    });
  }

  async exec(
    args: string[],
    opts?: { cwd?: string },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.calls.push({ args, cwd: opts?.cwd });
    const key = args.join(" ");
    // Find best matching prefix
    for (const [prefix, resp] of this.responses.entries()) {
      if (key.startsWith(prefix)) return { ...resp };
    }
    return { ...this.defaultResponse };
  }

  async exists(p: string): Promise<boolean> {
    return this.paths.has(p);
  }
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-wt-"));
}

describe("WorktreeManager", () => {
  let dir: string;
  let backend: FakeGitBackend;
  let wm: WorktreeManager;

  beforeEach(async () => {
    dir = await makeTempDir();
    backend = new FakeGitBackend();
    // Default responses for a successful create flow
    backend.setResponse("rev-parse --verify main", { stdout: "abc123\n" });
    backend.setResponse("rev-parse main", { stdout: "abc123\n" });
    backend.setResponse("rev-parse --abbrev-ref HEAD", { stdout: "main\n" });
    backend.setResponse("worktree add", { stdout: "" });
    wm = new WorktreeManager({
      projectRoot: dir,
      backend,
      worktreesDir: path.join(dir, ".worktrees"),
    });
  });

  it("creates a worktree with correct branch naming", async () => {
    const unit = await wm.create("story-1", "fe");
    expect(unit.id).toBe("story-1");
    expect(unit.track).toBe("fe");
    expect(unit.branch).toBe("spec-graph/story-1-fe");
    expect(unit.status).toBe("active");
    expect(unit.base_commit).toBe("abc123");

    // Verify the git command was issued correctly
    const addCall = backend.calls.find(
      (c) => c.args.includes("worktree") && c.args.includes("add"),
    );
    expect(addCall).toBeDefined();
    expect(addCall!.args).toContain("-b");
    expect(addCall!.args).toContain("spec-graph/story-1-fe");
  });

  it("rejects duplicate create", async () => {
    await wm.create("story-1", "fe");
    await expect(wm.create("story-1", "fe")).rejects.toThrow(/already exists/);
  });

  it("lists and retrieves units", async () => {
    await wm.create("story-1", "fe");
    await wm.create("story-2", "be");

    const all = await wm.list();
    expect(all.length).toBe(2);

    const one = await wm.get("story-1");
    expect(one?.track).toBe("fe");

    expect(await wm.get("nonexistent")).toBeNull();
  });

  it("removes a unit and marks it abandoned", async () => {
    await wm.create("story-1", "fe");
    await wm.remove("story-1");

    const unit = await wm.get("story-1");
    expect(unit?.status).toBe("abandoned");
  });

  it("purges a unit completely", async () => {
    await wm.create("story-1", "fe");
    await wm.remove("story-1", { purge: true });

    expect(await wm.get("story-1")).toBeNull();
    expect((await wm.list()).length).toBe(0);
  });

  it("dry-run merge succeeds when no conflicts", async () => {
    backend.setResponse("merge-base", { stdout: "base123\n" });
    backend.setResponse("merge-tree", { stdout: "" });

    await wm.create("story-1", "fe");
    const result = await wm.merge("story-1", "main", { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it("dry-run merge reports conflicts", async () => {
    backend.setResponse("merge-base", { stdout: "base123\n" });
    backend.setResponse("merge-tree", {
      stdout: `changed in both
  base   100644 abc our100 their100 src/shared/types.ts
CONFLICT (content): merge conflict in src/shared/types.ts
`,
    });

    await wm.create("story-1", "fe");
    const result = await wm.merge("story-1", "main", { dryRun: true });
    expect(result.success).toBe(false);
    expect(result.conflicts).toContain("src/shared/types.ts");
  });

  it("refuses to merge non-active units", async () => {
    await wm.create("story-1", "fe");
    await wm.remove("story-1");
    const result = await wm.merge("story-1", "main");
    expect(result.success).toBe(false);
    expect(result.error).toContain("abandoned");
  });

  it("listByStatus filters correctly", async () => {
    await wm.create("story-1", "fe");
    await wm.create("story-2", "be");
    await wm.remove("story-1");

    expect((await wm.listByStatus("active")).length).toBe(1);
    expect((await wm.listByStatus("abandoned")).length).toBe(1);
  });
});

describe("parseMergeTreeConflicts", () => {
  it("returns empty for clean output", () => {
    expect(parseMergeTreeConflicts("")).toEqual([]);
  });

  it("extracts conflict file paths", () => {
    const output = `changed in both
  base   100644 abc our100 their100 src/shared/types.ts
CONFLICT (content): merge conflict in src/shared/types.ts
`;
    expect(parseMergeTreeConflicts(output)).toContain("src/shared/types.ts");
  });

  it("deduplicates conflict files", () => {
    const output = `CONFLICT (content): merge conflict in src/a.ts
CONFLICT (content): merge conflict in src/a.ts
`;
    expect(parseMergeTreeConflicts(output).length).toBe(1);
  });
});
