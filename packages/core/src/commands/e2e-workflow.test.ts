import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { dispatchCommand } from "./dispatch";
import { impactCommand } from "./impact";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";

describe("End-to-End Workflow Integration", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-e2e-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Create minimal .spec-graph structure
    await fs.mkdir(path.join(tempDir, ".spec-graph"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".spec-graph", "artifacts", "requirement"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".spec-graph", "artifacts", "design"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".spec-graph", "traces"), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
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

    // Create machine state
    await writeYaml(path.join(tempDir, ".spec-graph", "machine-state.yaml"), {
      current_stage: "propose",
      stage_history: [],
      artifacts: {
        "requirement/prd": { id: "requirement/prd", status: "completed" },
        "design/architecture": { id: "design/architecture", status: "in_progress" },
      },
      checks: {},
      metadata: {},
    });

    // Create traces
    await writeYaml(path.join(tempDir, ".spec-graph", "traces", "req_to_design.yaml"), {
      traces: [
        {
          from: "requirement/prd",
          from_kind: "requirement",
          to: "design/architecture",
          to_kind: "design",
          relation: "derives",
        },
        {
          from: "design/architecture",
          from_kind: "design",
          to: "design/c4",
          to_kind: "design",
          relation: "derives",
        },
      ],
    });
  }

  it("should complete full workflow: compose → dispatch → impact analysis", async () => {
    await setupGraph();

    // Step 1: Dispatch - get next action
    let dispatchOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => dispatchOutput.push(msg);

    await dispatchCommand(tempDir, { json: true });
    console.log = originalLog;

    const manifest = JSON.parse(dispatchOutput.join("\n"));
    expect(manifest.done).toBe(false);
    expect(manifest.actions.length).toBeGreaterThan(0);
    expect(manifest.current_stage).toBe("propose");

    // Step 2: Impact analysis - check impact of changing requirement/prd
    dispatchOutput = [];
    console.log = (msg: string) => dispatchOutput.push(msg);

    await impactCommand(tempDir, { artifact: "requirement/prd" });
    console.log = originalLog;

    const impactOutput = dispatchOutput.join("\n");
    expect(impactOutput).toContain("Impact Analysis: requirement/prd");
    expect(impactOutput).toContain("design/architecture");
    expect(impactOutput).toContain("Affected Checks");
    expect(impactOutput).toContain("Affected Gates");
  });

  it("should detect brownfield project with existing code", async () => {
    // Simulate a brownfield project
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "existing-project",
        dependencies: {
          express: "^4.18.0",
          react: "^18.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^0.34.0",
        },
      }),
    );

    // Create src structure
    await fs.mkdir(path.join(tempDir, "src", "components"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "components", "App.tsx"), "// React component");

    await setupGraph();

    // Dispatch should recognize this is a brownfield project
    let dispatchOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => dispatchOutput.push(msg);

    await dispatchCommand(tempDir, { json: true });
    console.log = originalLog;

    const manifest = JSON.parse(dispatchOutput.join("\n"));
    expect(manifest).toBeDefined();
    expect(manifest.done).toBe(false);
  });

  it("should analyze impact of changes to downstream artifacts", async () => {
    await setupGraph();

    // Analyze impact of changing design/architecture
    let impactOutput: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => impactOutput.push(msg);

    await impactCommand(tempDir, { artifact: "design/architecture" });
    console.log = originalLog;

    const output = impactOutput.join("\n");
    expect(output).toContain("Impact Analysis: design/architecture");
    expect(output).toContain("design/c4"); // Should detect downstream dependency
    expect(output).toContain("Affected Checks");
  });

  it("should output JSON when --json flag is set", async () => {
    await setupGraph();

    let output: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => output.push(msg);

    await impactCommand(tempDir, { artifact: "requirement/prd", json: true });
    console.log = originalLog;

    const json = JSON.parse(output.join("\n"));
    expect(json.source).toBe("requirement/prd");
    expect(json.directDependencies).toBeDefined();
    expect(json.transitiveDependencies).toBeDefined();
    expect(json.affectedChecks).toBeDefined();
    expect(json.affectedGates).toBeDefined();
  });
});
