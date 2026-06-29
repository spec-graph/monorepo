import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runEnforce } from "./index";
import { Graph } from "../../types/index";
import { writeYaml } from "../../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-enforce-"));
}

function makeBaseGraph(): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [
      { id: "plan/story", kind: "plan" },
      { id: "requirement/prd", kind: "requirement" },
    ],
    actions: [],
    checks: [
      { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
      { id: "unit-test", kind: "test", command: "npm test", layer: "unit" },
    ],
    gates: [
      {
        id: "entry-gate",
        on_transition: ["plan", "implement"],
        require_artifacts: ["plan/story"],
        require_checks: ["lint"],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "test",
      },
      {
        id: "exit-gate",
        on_transition: ["accept", "integrate"],
        require_artifacts: ["requirement/prd"],
        require_checks: ["unit-test"],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "test",
      },
      {
        id: "disabled-gate",
        on_transition: ["design", "plan"],
        require_artifacts: ["requirement/prd"],
        require_checks: [],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
        enabled: false,
        provided_by: "test",
      },
      {
        id: "warn-gate",
        on_transition: ["review", "test"],
        require_artifacts: ["plan/story"],
        require_checks: [],
        require_traces: [],
        forbid: [],
        fail_mode: "warn",
        enabled: true,
        provided_by: "test",
      },
    ],
    tracks: [],
    pipeline_skeleton: {
      stages: ["implement", "review", "test", "accept"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
  };
}

describe("Enforce Engine", () => {
  it("should report blocking gates when artifacts and checks are missing", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const result = await runEnforce(projectRoot, makeBaseGraph());

    // All enabled blocking gates should be evaluated
    expect(result.evaluated_gates.length).toBeGreaterThanOrEqual(3); // entry-gate, exit-gate, warn-gate (disabled skipped)
    expect(result.all_passed).toBe(false);
    expect(result.blocking_gates).toContain("entry-gate");
    expect(result.blocking_gates).toContain("exit-gate");
    // warn-gate fails but fail_mode=warn, so not blocking
    expect(result.blocking_gates).not.toContain("warn-gate");
  });

  it("should skip disabled gates", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const result = await runEnforce(projectRoot, makeBaseGraph());

    const disabledEval = result.evaluated_gates.find(
      (g) => g.gate_id === "disabled-gate",
    );
    expect(disabledEval).toBeUndefined();
  });

  it("should pass all gates when state is satisfied", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    // Write state with all artifacts completed and all checks passed
    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "accept",
      stage_history: [],
      artifacts: {
        "plan/story": { id: "plan/story", status: "completed" },
        "requirement/prd": { id: "requirement/prd", status: "completed" },
      },
      checks: {
        lint: { id: "lint", status: "passed" },
        "unit-test": { id: "unit-test", status: "passed" },
      },
      metadata: {},
    });

    const result = await runEnforce(projectRoot, makeBaseGraph());

    expect(result.all_passed).toBe(true);
    expect(result.blocking_gates).toEqual([]);
  });

  it("should filter gates by phase option", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const result = await runEnforce(projectRoot, makeBaseGraph(), {
      phase: "entry-gate",
    });

    expect(result.evaluated_gates).toHaveLength(1);
    expect(result.evaluated_gates[0].gate_id).toBe("entry-gate");
    expect(result.evaluated_gates[0].passed).toBe(false);
    expect(result.evaluated_gates[0].missing_artifacts).toContain("plan/story");
    expect(result.evaluated_gates[0].missing_checks).toContain("lint");
  });

  it("should detect trace violations when traces are required", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const graph = makeBaseGraph();
    graph.artifacts.push({ id: "design/c4", kind: "design" });
    graph.gates[0].require_traces = [
      {
        name: "story_to_req",
        from_kind: "plan",
        to_kind: "requirement",
        via: ["derives"],
        cardinality: "every",
      },
    ];

    const result = await runEnforce(projectRoot, graph);

    const entryGate = result.evaluated_gates.find(
      (g) => g.gate_id === "entry-gate",
    );
    expect(entryGate?.missing_traces).toContain("story_to_req");
    expect(entryGate?.passed).toBe(false);
  });

  it("should pass trace queries when trace files satisfy them", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".spec-graph", "traces", "story-to-req.yaml"),
      [
        "traces:",
        "  - from: plan/story",
        "    from_kind: plan",
        "    to: requirement/prd",
        "    to_kind: requirement",
        "    relation: derives",
      ].join("\n"),
      "utf-8",
    );

    const graph = makeBaseGraph();
    graph.gates[0] = {
      ...graph.gates[0],
      require_artifacts: [],
      require_checks: [],
      require_traces: [
        {
          name: "story_to_req",
          from_kind: "plan",
          to_kind: "requirement",
          via: ["derives"],
          cardinality: "every",
        },
      ],
    };

    const result = await runEnforce(projectRoot, graph);

    const entryGate = result.evaluated_gates.find(
      (g) => g.gate_id === "entry-gate",
    );
    expect(entryGate?.missing_traces).toEqual([]);
    expect(entryGate?.passed).toBe(true);
  });

  it("should detect forbidden invariant violations", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const graph = makeBaseGraph();
    graph.gates[0] = {
      ...graph.gates[0],
      require_artifacts: [],
      require_checks: [],
      forbid: ["NO_UNTESTED_CODE"],
    };

    // Write invariants with violation
    await fs.writeFile(
      path.join(projectRoot, ".spec-graph", "invariants.json"),
      JSON.stringify({ violations: ["NO_UNTESTED_CODE"] }),
      "utf-8",
    );

    const result = await runEnforce(projectRoot, graph);

    const entryGate = result.evaluated_gates.find(
      (g) => g.gate_id === "entry-gate",
    );
    expect(entryGate?.violated_forbids).toContain("NO_UNTESTED_CODE");
    expect(entryGate?.passed).toBe(false);
  });

  it("should pass when no forbidden invariants are violated", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const graph = makeBaseGraph();
    graph.gates[0] = {
      ...graph.gates[0],
      require_artifacts: [],
      require_checks: [],
      forbid: ["NO_UNTESTED_CODE"],
    };

    // No violations recorded
    await fs.writeFile(
      path.join(projectRoot, ".spec-graph", "invariants.json"),
      JSON.stringify({ violations: [] }),
      "utf-8",
    );

    const result = await runEnforce(projectRoot, graph);

    const entryGate = result.evaluated_gates.find(
      (g) => g.gate_id === "entry-gate",
    );
    expect(entryGate?.violated_forbids).toEqual([]);
    expect(entryGate?.passed).toBe(true);
  });

  it("should handle missing invariants file gracefully", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const graph = makeBaseGraph();
    graph.gates[0] = {
      ...graph.gates[0],
      require_artifacts: [],
      require_checks: [],
      forbid: ["SOME_RULE"],
    };

    // No invariants file — should be treated as no violations
    const result = await runEnforce(projectRoot, graph);

    const entryGate = result.evaluated_gates.find(
      (g) => g.gate_id === "entry-gate",
    );
    expect(entryGate?.violated_forbids).toEqual([]);
    expect(entryGate?.passed).toBe(true);
  });

  it("should use pipeline first stage as default when no state file exists", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    const result = await runEnforce(projectRoot, makeBaseGraph());

    // Should not crash — gracefully uses default state
    expect(result.evaluated_gates.length).toBeGreaterThan(0);
  });
});
