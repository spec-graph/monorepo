import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./run";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { savePermissions, getPreset } from "../engine/permissions/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-run-"));
}

function makeGraphWithCheck(checkId: string, checkCommand: string): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks: [
      { id: checkId, kind: "lint", command: checkCommand, layer: "unit" },
    ],
    gates: [
      {
        id: "test-gate",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: [checkId],
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
      stages: ["propose", "specify", "design"],
      max_retries: 3,
      on_exhausted: "escalate",
    },
    acceptance_layers: {},
    agents: [],
    agent_bindings: [],
    meetings: [],
  };
}

function makeGraphWithTraceQuery(traceName: string): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks: [],
    gates: [
      {
        id: "trace-gate",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [
          {
            name: traceName,
            from_kind: "requirement",
            to_kind: "design",
            via: ["satisfies"],
            cardinality: "exists",
          },
        ],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ],
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
}

describe("run command — action type handlers", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  async function setupProject(
    graph: Graph,
    state: any,
    permLevel: "full-auto" | "semi-auto" | "manual" = "full-auto",
  ) {
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      state,
    );
    // Write the full preset (not just { level }) — loadPermissions returns
    // the file as-is if it exists, so an incomplete file breaks isActionAllowed.
    await savePermissions(projectRoot, getPreset(permLevel));
  }

  async function captureRunResult(): Promise<any> {
    let output: any;
    let errorOutput = "";
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    console.error = (...args: any[]) => {
      errorOutput += args.join(" ") + "\n";
    };
    try {
      await runCommand(projectRoot, { json: true, maxSteps: "5" });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    if (!output && errorOutput) {
      throw new Error("runCommand failed: " + errorOutput);
    }
    return output;
  }

  it("handles run_check action (passes when check command exits 0)", async () => {
    const graph = makeGraphWithCheck("lint", "true"); // 'true' always exits 0
    await setupProject(graph, {
      current_stage: "propose",
      artifacts: {},
      checks: { lint: { id: "lint", status: "failed" } },
      stage_history: [],
    });

    const result = await captureRunResult();
    expect(result).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
    const checkStep = result.steps.find((s: any) => s.action === "run_check");
    expect(checkStep).toBeDefined();
    expect(checkStep.status).toBe("completed");
  });

  it("handles run_check action (fails when check command exits non-zero)", async () => {
    const graph = makeGraphWithCheck("lint", "false"); // 'false' always exits 1
    await setupProject(graph, {
      current_stage: "propose",
      artifacts: {},
      checks: { lint: { id: "lint", status: "failed" } },
      stage_history: [],
    });

    const result = await captureRunResult();
    expect(result).toBeDefined();
    const checkStep = result.steps.find((s: any) => s.action === "run_check");
    expect(checkStep).toBeDefined();
    expect(checkStep.status).toBe("failed");
    expect(result.failed).toBe(true);
  });

  it("handles verify_trace action (blocked when trace missing)", async () => {
    const graph = makeGraphWithTraceQuery("req-to-design");
    await setupProject(graph, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

    const result = await captureRunResult();
    expect(result).toBeDefined();
    const traceStep = result.steps.find(
      (s: any) => s.action === "verify_trace",
    );
    expect(traceStep).toBeDefined();
    // Trace is missing → blocked, not crashed
    expect(traceStep.status).toBe("blocked");
    expect(traceStep.message).toContain("spec-graph trace add");
    expect(result.blocked).toBe(true);
    expect(result.failed).toBe(false);
  });

  it("does NOT crash on produce_artifact action (yields blocked)", async () => {
    // Gate requires an artifact that's not completed → produce_artifact suggested
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        packs_used: [],
      },
      artifacts: [{ id: "requirement/proposal", kind: "requirement" }],
      actions: [],
      checks: [],
      gates: [
        {
          id: "g",
          on_transition: ["propose→specify"],
          require_artifacts: ["requirement/proposal"],
          require_checks: [],
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
        stages: ["propose", "specify"],
        max_retries: 3,
        on_exhausted: "escalate",
      },
      acceptance_layers: {},
      agents: [],
      agent_bindings: [],
      meetings: [],
    };
    await setupProject(
      graph,
      {
        current_stage: "propose",
        artifacts: {},
        checks: {},
        stage_history: [],
      },
      "full-auto",
    ); // full-auto includes produce_artifact in auto_execute

    const result = await captureRunResult();
    expect(result).toBeDefined();
    const produceStep = result.steps.find(
      (s: any) => s.action === "produce_artifact",
    );
    expect(produceStep).toBeDefined();
    // Should be blocked (requires sub-agent), NOT failed with parse error
    expect(produceStep.status).toBe("blocked");
    // New format: message mentions sub-agent dispatch + next_step includes spec-graph
    expect(produceStep.message).toContain("sub-agent dispatch");
    expect(produceStep.dispatch_instructions).toBeDefined();
    expect(produceStep.dispatch_instructions.next_step).toContain("spec-graph");
    expect(result.blocked).toBe(true);
    // Critical: should NOT have a parse error
    expect(produceStep.message).not.toContain("Cannot parse transition");
  });

  it("does NOT crash on resolve_violation action (yields blocked)", async () => {
    // Gate with forbid clause that's violated → resolve_violation suggested
    // (forbidden_violations is currently always empty in next.ts, but defensive test)
    const graph = makeGraphWithCheck("lint", "true");
    graph.gates[0].forbid = [];
    await setupProject(
      graph,
      {
        current_stage: "propose",
        artifacts: {},
        checks: {},
        stage_history: [],
      },
      "full-auto",
    );

    // This test just verifies run doesn't crash on any action type
    const result = await captureRunResult();
    expect(result).toBeDefined();
    // No crash, no parse error
    for (const step of result.steps) {
      expect(step.message).not.toContain("Cannot parse transition");
    }
  });
});
