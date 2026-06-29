import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { statusCommand } from "./status";
import { writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { getPreset, savePermissions } from "../engine/permissions/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-status-"));
}

function makeGraph(traceName?: string): Graph {
  return {
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
    checks: [{ id: "lint", kind: "lint", command: "true", layer: "unit" }],
    gates: [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: ["lint"],
        require_traces: traceName
          ? [
              {
                name: traceName,
                from_kind: "requirement",
                to_kind: "design",
                via: ["satisfies"],
                cardinality: "exists" as const,
              },
            ]
          : [],
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

describe("status command", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    await writeYaml(path.join(projectRoot, ".spec-graph", "profile.yaml"), {
      version: "1",
      meta: {
        created_at: new Date().toISOString(),
        source: { repo_scan: false, llm_classified: false },
      },
      facts: {},
      repo_signals: {},
    });
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

  async function setup(graph: Graph, state: any) {
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      state,
    );
    await savePermissions(projectRoot, getPreset("full-auto"));
  }

  async function captureJson(): Promise<any> {
    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await statusCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }
    return output;
  }

  it("JSON output exposes all four gate failure arrays when gate_blocked", async () => {
    const graph = makeGraph("req-to-design");
    await setup(graph, {
      current_stage: "propose",
      artifacts: {}, // missing requirement/proposal
      checks: { lint: { id: "lint", status: "failed" } }, // failed
      stage_history: [],
    });

    const output = await captureJson();
    expect(output).toBeDefined();
    expect(output.plan.gate_passed).toBe(false);
    expect(output.plan.missing_artifacts).toContain("requirement/proposal");
    expect(output.plan.failed_checks).toContain("lint");
    expect(output.plan.missing_traces).toContain("req-to-design");
    expect(Array.isArray(output.plan.forbidden_violations)).toBe(true);
    expect(output.plan.done).toBe(false);
  });

  it("JSON output has empty failure arrays when gate_passed", async () => {
    const graph = makeGraph();
    await setup(graph, {
      current_stage: "propose",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: { lint: { id: "lint", status: "passed" } },
      stage_history: [],
    });

    const output = await captureJson();
    expect(output).toBeDefined();
    expect(output.plan.gate_passed).toBe(true);
    expect(output.plan.missing_artifacts).toEqual([]);
    expect(output.plan.failed_checks).toEqual([]);
    expect(output.plan.missing_traces).toEqual([]);
    expect(output.plan.forbidden_violations).toEqual([]);
  });

  it("JSON output includes done flag and suggested_actions", async () => {
    const graph = makeGraph();
    await setup(graph, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

    const output = await captureJson();
    expect(output).toBeDefined();
    expect(output.plan).toHaveProperty("done");
    expect(output.plan).toHaveProperty("suggested_actions");
    expect(Array.isArray(output.plan.suggested_actions)).toBe(true);
  });

  it("human-readable output classifies verify_trace as Auto: spec-graph run", async () => {
    const graph = makeGraph("req-to-design");
    await setup(graph, {
      current_stage: "propose",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: { lint: { id: "lint", status: "passed" } },
      stage_history: [],
    });

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      output.push(args.join(" "));
    };
    try {
      await statusCommand(projectRoot, {});
    } finally {
      console.log = originalLog;
    }
    const all = output.join("\n");
    // verify_trace is deterministic → should suggest `spec-graph run`, not `spec-graph dispatch`
    expect(all).toContain("Auto: spec-graph run");
    expect(all).not.toContain("Manual: spec-graph dispatch");
  });

  it("human-readable output classifies produce_artifact as Manual: spec-graph dispatch", async () => {
    const graph = makeGraph();
    await setup(graph, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      output.push(args.join(" "));
    };
    try {
      await statusCommand(projectRoot, {});
    } finally {
      console.log = originalLog;
    }
    const all = output.join("\n");
    expect(all).toContain("Manual: spec-graph dispatch");
  });
});
