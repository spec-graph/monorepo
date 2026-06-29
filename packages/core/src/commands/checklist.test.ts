import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checklistCommand } from "./checklist";
import { writeYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-checklist-"));
}

async function setupProject(projectRoot: string) {
  const graph = {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      packs_used: [],
    },
    artifacts: [
      { id: "requirement/R-001", kind: "requirement" },
      { id: "plan/story/S-001", kind: "plan/story" },
    ],
    actions: [],
    checks: [],
    gates: [],
    tracks: [],
    pipeline_skeleton: {
      stages: ["propose", "specify", "design", "implement"],
      max_retries: 3,
      on_exhausted: "escalate",
    },
    acceptance_layers: {},
    agents: [],
    agent_bindings: [],
    meetings: [],
  };

  const state = {
    current_stage: "specify",
    stage_history: [],
    artifacts: {
      "requirement/R-001": {
        id: "requirement/R-001",
        status: "completed",
      },
      "plan/story/S-001": {
        id: "plan/story/S-001",
        status: "pending",
      },
    },
    checks: {},
    metadata: {},
    traces: [],
  };

  await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    state,
  );

  // Create trace file
  const tracesDir = path.join(projectRoot, ".spec-graph", "traces");
  await fs.mkdir(tracesDir, { recursive: true });
  await writeYaml(path.join(tracesDir, "story_to_req.yaml"), {
    traces: [
      {
        from: "plan/story/S-001",
        from_kind: "plan/story",
        to: "requirement/R-001",
        to_kind: "requirement",
        relation: "derives",
      },
    ],
  });
}

describe("Checklist Command", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    await setupProject(projectRoot);
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it("generates checklist file for a story", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await checklistCommand(projectRoot, "plan/story/S-001", {});

      // Check file was created
      const checklistPath = path.join(
        projectRoot,
        ".spec-graph",
        "checklists",
        "plan_story_S-001.md",
      );
      const exists = await fs
        .access(checklistPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Check content
      const content = await fs.readFile(checklistPath, "utf-8");
      expect(content).toContain("# Checklist: plan/story/S-001");
      expect(content).toContain("Mechanical Checks");
      expect(content).toContain("Soft Checks");
      expect(content).toContain("Story references at least one requirement");
      expect(content).toContain("Scope is atomic");
      expect(content).toContain("Has at least 2 acceptance criteria");
      expect(content).toContain("All referenced requirements are resolved");
      expect(content).toContain("No file paths outside project scope");
      expect(content).toContain("No ambiguous adjectives");
      expect(content).toContain("Each acceptance criterion is verifiable");
      expect(content).toContain("Edge cases considered");
      expect(content).toContain(
        "Dependencies on other stories/components declared",
      );
      expect(content).toContain("Out-of-scope items explicitly listed");

      // Check output
      expect(logs.some((l) => l.includes("Checklist generated"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("generates JSON output when --json flag set", async () => {
    const originalLog = console.log;
    let jsonOutput: any = null;
    console.log = (msg: string) => {
      try {
        jsonOutput = JSON.parse(msg);
      } catch {
        // Not JSON, ignore
      }
    };

    try {
      await checklistCommand(projectRoot, "plan/story/S-001", { json: true });

      expect(jsonOutput).toBeDefined();
      expect(jsonOutput.story_id).toBe("plan/story/S-001");
      expect(jsonOutput.checklist_path).toBeDefined();
      expect(jsonOutput.mechanical_checks).toHaveLength(5);
      expect(jsonOutput.soft_checks).toHaveLength(5);
      expect(jsonOutput.mechanical_checks[0].name).toContain("requirement");
    } finally {
      console.log = originalLog;
    }
  });

  it("fails when story not found", async () => {
    const originalLog = console.log;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    console.log = () => {};
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await checklistCommand(projectRoot, "plan/story/NONEXISTENT", {});
    } catch {
      // Expected to throw due to process.exit
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });

  it("warns when story is already completed", async () => {
    // Update story status to completed
    const state = await import("../utils/yaml").then((m) =>
      m.readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      ),
    );
    state.artifacts["plan/story/S-001"].status = "completed";
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      state,
    );

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await checklistCommand(projectRoot, "plan/story/S-001", {});

      expect(logs.some((l) => l.includes("already completed"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("mechanical checks detect missing requirement references", async () => {
    // Remove trace file from story to requirement
    const traceFile = path.join(
      projectRoot,
      ".spec-graph",
      "traces",
      "story_to_req.yaml",
    );
    await fs.unlink(traceFile);

    const originalLog = console.log;
    let jsonOutput: any = null;
    console.log = (msg: string) => {
      try {
        jsonOutput = JSON.parse(msg);
      } catch {
        // Not JSON, ignore
      }
    };

    try {
      await checklistCommand(projectRoot, "plan/story/S-001", { json: true });

      expect(jsonOutput).toBeDefined();
      const reqMappingCheck = jsonOutput.mechanical_checks.find((c: any) =>
        c.name.includes("references at least one requirement"),
      );
      expect(reqMappingCheck).toBeDefined();
      expect(reqMappingCheck.passed).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });

  it("mechanical checks detect unresolved requirements", async () => {
    // Set referenced requirement to pending (not completed)
    const state = await import("../utils/yaml").then((m) =>
      m.readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      ),
    );
    state.artifacts["requirement/R-001"].status = "pending";
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      state,
    );

    const originalLog = console.log;
    let jsonOutput: any = null;
    console.log = (msg: string) => {
      try {
        jsonOutput = JSON.parse(msg);
      } catch {
        // Not JSON, ignore
      }
    };

    try {
      await checklistCommand(projectRoot, "plan/story/S-001", { json: true });

      expect(jsonOutput).toBeDefined();
      const reqResolutionCheck = jsonOutput.mechanical_checks.find((c: any) =>
        c.name.includes("referenced requirements are resolved"),
      );
      expect(reqResolutionCheck).toBeDefined();
      expect(reqResolutionCheck.passed).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });
});
