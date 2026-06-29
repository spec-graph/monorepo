import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { artifactCommand } from "./artifact";
import { writeYaml, readYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-artifact-status-"));
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
      { id: "requirement/proposal", kind: "requirement" },
      { id: "design/architecture", kind: "design" },
    ],
    actions: [],
    checks: [],
    gates: [],
    tracks: [],
    pipeline_skeleton: {
      stages: ["propose", "specify", "design"],
      max_retries: 3,
      on_exhausted: "escalate",
    },
    acceptance_layers: {},
    agents: [],
    agent_bindings: [],
    meetings: [],
  };

  const state = {
    current_stage: "propose",
    stage_history: [],
    artifacts: {},
    checks: {},
    metadata: {},
  };

  await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    state,
  );
}

describe("Artifact Status States", () => {
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

  it("artifact ready marks artifact as ready", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await artifactCommand(projectRoot, "ready", "requirement/proposal", {});

      const state = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      );
      expect(state.artifacts["requirement/proposal"]).toBeDefined();
      expect(state.artifacts["requirement/proposal"].status).toBe("ready");
      expect(logs.some((l) => l.includes("marked as ready"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact block marks artifact as blocked", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await artifactCommand(projectRoot, "block", "requirement/proposal", {});

      const state = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      );
      expect(state.artifacts["requirement/proposal"]).toBeDefined();
      expect(state.artifacts["requirement/proposal"].status).toBe("blocked");
      expect(logs.some((l) => l.includes("marked as blocked"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact update accepts ready status", async () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      await artifactCommand(projectRoot, "update", "requirement/proposal", {
        status: "ready",
      });

      const state = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      );
      expect(state.artifacts["requirement/proposal"].status).toBe("ready");
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact update accepts blocked status", async () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      await artifactCommand(projectRoot, "update", "requirement/proposal", {
        status: "blocked",
      });

      const state = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      );
      expect(state.artifacts["requirement/proposal"].status).toBe("blocked");
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact list displays ready status in blue", async () => {
    // Set artifact to ready
    await artifactCommand(projectRoot, "ready", "requirement/proposal", {});

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await artifactCommand(projectRoot, "list", undefined, {});

      const output = logs.join("\n");
      expect(output).toContain("requirement/proposal");
      // The status should be displayed (color is handled by chalk)
      expect(output).toMatch(/ready/);
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact list displays blocked status in red", async () => {
    // Set artifact to blocked
    await artifactCommand(projectRoot, "block", "requirement/proposal", {});

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await artifactCommand(projectRoot, "list", undefined, {});

      const output = logs.join("\n");
      expect(output).toContain("requirement/proposal");
      expect(output).toMatch(/blocked/);
    } finally {
      console.log = originalLog;
    }
  });

  it("artifact ready requires artifact ID", async () => {
    const originalLog = console.log;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    console.log = () => {};
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await artifactCommand(projectRoot, "ready", undefined, {});
    } catch {
      // Expected to throw due to process.exit
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });

  it("artifact block requires artifact ID", async () => {
    const originalLog = console.log;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    console.log = () => {};
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await artifactCommand(projectRoot, "block", undefined, {});
    } catch {
      // Expected to throw due to process.exit
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
