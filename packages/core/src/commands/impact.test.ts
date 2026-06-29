import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { impactCommand } from "../commands/impact";
import { writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";

describe("Impact Command", () => {
  let tempDir: string;
  let originalLog: typeof console.log;
  let logs: string[];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-impact-"));
    await fs.mkdir(path.join(tempDir, ".spec-graph"), { recursive: true });
    originalLog = console.log;
    logs = [];
    console.log = (msg: string) => logs.push(msg);
  });

  afterEach(async () => {
    console.log = originalLog;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function setupGraph() {
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        packs_used: [],
      },
      artifacts: [
        { id: "requirement/prd", kind: "requirement" },
        { id: "design/architecture", kind: "design" },
        { id: "design/c4", kind: "design" },
        { id: "plan/story", kind: "plan" },
      ],
      actions: [],
      checks: [
        { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
        { id: "typecheck", kind: "typecheck", command: "npx tsc --noEmit", layer: "unit" },
      ],
      gates: [
        {
          id: "design-ready",
          on_transition: ["propose→specify"],
          require_artifacts: ["design/architecture"],
          require_checks: ["lint"],
          require_traces: [],
          require_contracts_current: false,
          forbid: [],
          fail_mode: "block",
          enabled: true,
          provided_by: "foundation",
        },
      ],
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

    await writeYaml(path.join(tempDir, ".spec-graph", "graph.yaml"), graph);
  }

  it("should show error when no artifact provided", async () => {
    await setupGraph();
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await impactCommand(tempDir, {});
    } catch {
      // Expected
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(logs.some((l) => l.includes("--artifact is required"))).toBe(true);
  });

  it("should show error when artifact not found", async () => {
    await setupGraph();
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await impactCommand(tempDir, { artifact: "nonexistent/artifact" });
    } catch {
      // Expected
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(logs.some((l) => l.includes("not found in graph"))).toBe(true);
  });

  it("should analyze impact for valid artifact", async () => {
    await setupGraph();

    await impactCommand(tempDir, { artifact: "requirement/prd" });

    const output = logs.join("\n");
    expect(output).toContain("Impact Analysis: requirement/prd");
    expect(output).toContain("Direct Dependencies");
    expect(output).toContain("Transitive Dependencies");
    expect(output).toContain("Affected Checks");
    expect(output).toContain("Affected Gates");
  });

  it("should output JSON when --json flag is set", async () => {
    await setupGraph();

    await impactCommand(tempDir, { artifact: "requirement/prd", json: true });

    const output = logs.join("\n");
    const json = JSON.parse(output);
    expect(json.source).toBe("requirement/prd");
    expect(json.directDependencies).toBeDefined();
    expect(json.transitiveDependencies).toBeDefined();
    expect(json.affectedChecks).toBeDefined();
    expect(json.affectedGates).toBeDefined();
  });
});
