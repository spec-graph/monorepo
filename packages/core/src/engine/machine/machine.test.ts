import { describe, it, expect } from "vitest";
import { StateMachineEngine } from "./index";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Graph } from "../../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-machine-"));
}

async function makeStatePath(): Promise<string> {
  return path.join(await makeTempDir(), "machine-state.yaml");
}

function makeGraph(): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks: [],
    gates: [
      {
        id: "gate/tuple-transition",
        on_transition: ["plan", "implement"],
        require_artifacts: ["plan/story"],
        require_checks: ["story-slicing"],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "test",
      },
    ],
    tracks: [],
    pipeline_skeleton: {
      stages: ["plan", "implement", "review"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
  };
}

describe("StateMachineEngine", () => {
  it("should initialize from the inferred workflow root stage", async () => {
    const graph = makeGraph();
    graph.pipeline_skeleton.stages = ["implement", "review"];
    const engine = new StateMachineEngine(graph, await makeStatePath());
    const state = await engine.initialize();

    expect(state.current_stage).toBe("plan");
    expect(state.stage_history).toEqual([]);
  });

  it("should block tuple-style gated transitions when requirements are missing", async () => {
    const engine = new StateMachineEngine(makeGraph(), await makeStatePath());
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.gate_evaluation?.gate_id).toBe("gate/tuple-transition");
    expect(result.gate_evaluation?.missing_artifacts).toEqual(["plan/story"]);
    expect(result.gate_evaluation?.failed_checks).toEqual(["story-slicing"]);
  });

  it("should allow tuple-style gated transitions after artifact and check pass", async () => {
    const engine = new StateMachineEngine(makeGraph(), await makeStatePath());
    await engine.initialize();
    await engine.updateArtifact("plan/story", { status: "completed" });
    await engine.updateCheck("story-slicing", { status: "passed" });

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(true);
    expect(result.new_state.current_stage).toBe("implement");
    expect(result.new_state.stage_history).toHaveLength(1);
  });

  it("should reject transitions from a non-current stage", async () => {
    const engine = new StateMachineEngine(makeGraph(), await makeStatePath());
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "implement",
      to_stage: "review",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("current stage is plan");
  });

  it("should reject invalid jumps from the current stage", async () => {
    const engine = new StateMachineEngine(makeGraph(), await makeStatePath());
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "review",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid transition: plan → review");
  });

  it("should block transitions when required trace queries are missing", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
      recursive: true,
    });
    const graph = makeGraph();
    graph.artifacts = [
      { id: "plan/story", kind: "plan/story" },
      { id: "requirement/prd", kind: "requirement/prd" },
    ];
    graph.gates[0].require_checks = [];
    graph.gates[0].require_traces = [
      {
        name: "story_to_req",
        from_kind: "plan/story",
        to_kind: "requirement/prd",
        via: ["derives"],
        cardinality: "every",
      },
    ];

    const engine = new StateMachineEngine(
      graph,
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();
    await engine.updateArtifact("plan/story", { status: "completed" });

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.gate_evaluation?.missing_traces).toEqual(["story_to_req"]);
  });

  it("should allow transitions when required trace queries are satisfied", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".spec-graph", "traces", "story-to-req.yaml"),
      [
        "traces:",
        "  - from: plan/story",
        "    from_kind: plan/story",
        "    to: requirement/prd",
        "    to_kind: requirement/prd",
        "    relation: derives",
      ].join("\n"),
      "utf-8",
    );

    const graph = makeGraph();
    graph.artifacts = [
      { id: "plan/story", kind: "plan/story" },
      { id: "requirement/prd", kind: "requirement/prd" },
    ];
    graph.gates[0].require_checks = [];
    graph.gates[0].require_traces = [
      {
        name: "story_to_req",
        from_kind: "plan/story",
        to_kind: "requirement/prd",
        via: ["derives"],
        cardinality: "every",
      },
    ];

    const engine = new StateMachineEngine(
      graph,
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();
    await engine.updateArtifact("plan/story", { status: "completed" });

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(true);
    expect(result.gate_evaluation?.missing_traces).toEqual([]);
  });
});

describe("StateMachineEngine: contract currency enforcement (require_contracts_current)", () => {
  async function writeContract(projectRoot: string, entry: any): Promise<void> {
    const dir = path.join(projectRoot, ".spec-graph", "contracts");
    await fs.mkdir(dir, { recursive: true });
    const { writeYaml } = await import("../../utils/yaml");
    await writeYaml(
      path.join(dir, `${entry.contract_id.replace(/\//g, "_")}.yaml`),
      entry,
    );
  }

  function graphWithContractGate(requireContractsCurrent: boolean): Graph {
    const g = makeGraph();
    g.gates[0].require_artifacts = [];
    g.gates[0].require_checks = [];
    g.gates[0].require_traces = [];
    g.gates[0].require_contracts_current = requireContractsCurrent;
    return g;
  }

  it("blocks transition when a consumer is bound to a stale contract version", async () => {
    const projectRoot = await makeTempDir();
    await writeContract(projectRoot, {
      contract_id: "contract/api",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        { version: "2.0.0", published_at: "2026-01-01", producer: "be" },
      ],
      consumers: [
        // fe is on 1.0.0 while current is 2.0.0 → stale
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: "2025-01-01",
          status: "stale",
        },
      ],
    });

    const engine = new StateMachineEngine(
      graphWithContractGate(true),
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.gate_evaluation?.passed).toBe(false);
    expect(result.gate_evaluation?.missing_contracts.length).toBe(1);
    expect(result.gate_evaluation?.missing_contracts[0]).toContain(
      "contract/api",
    );
    expect(result.gate_evaluation?.missing_contracts[0]).toContain("fe");
    expect(result.gate_evaluation?.missing_contracts[0]).toContain("stale");
    expect(
      result.gate_evaluation?.warnings.some((w) => w.includes("stale")),
    ).toBe(true);
  });

  it("blocks transition when a consumer is explicitly marked broken", async () => {
    const projectRoot = await makeTempDir();
    await writeContract(projectRoot, {
      contract_id: "contract/api",
      producer: "be",
      current_version: "1.0.0",
      versions: [
        { version: "1.0.0", published_at: "2026-01-01", producer: "be" },
      ],
      consumers: [
        {
          consumer: "mobile",
          bound_version: "1.0.0",
          bound_at: "2025-01-01",
          status: "broken",
        },
      ],
    });

    const engine = new StateMachineEngine(
      graphWithContractGate(true),
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(false);
    expect(result.gate_evaluation?.missing_contracts.length).toBe(1);
    expect(result.gate_evaluation?.missing_contracts[0]).toContain("broken");
  });

  it("allows transition when all consumers are on current_version", async () => {
    const projectRoot = await makeTempDir();
    await writeContract(projectRoot, {
      contract_id: "contract/api",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        { version: "2.0.0", published_at: "2026-01-01", producer: "be" },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "2.0.0",
          bound_at: "2026-01-15",
          status: "current",
        },
        {
          consumer: "mobile",
          bound_version: "2.0.0",
          bound_at: "2026-01-15",
          status: "current",
        },
      ],
    });

    const engine = new StateMachineEngine(
      graphWithContractGate(true),
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(true);
    expect(result.gate_evaluation?.missing_contracts).toEqual([]);
  });

  it("skips the contract check when require_contracts_current is false", async () => {
    const projectRoot = await makeTempDir();
    // Even with a stale consumer, gate should pass because the gate doesn't require currency.
    await writeContract(projectRoot, {
      contract_id: "contract/api",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        { version: "2.0.0", published_at: "2026-01-01", producer: "be" },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: "2025-01-01",
          status: "stale",
        },
      ],
    });

    const engine = new StateMachineEngine(
      graphWithContractGate(false),
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(true);
    expect(result.gate_evaluation?.missing_contracts).toEqual([]);
  });

  it("passes vacuously when require_contracts_current is true but no contracts registered", async () => {
    const projectRoot = await makeTempDir();
    // Create .spec-graph/ so machine-state.yaml can be written, but no contracts/ dir
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    const engine = new StateMachineEngine(
      graphWithContractGate(true),
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      projectRoot,
    );
    await engine.initialize();

    const result = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });

    expect(result.success).toBe(true);
    expect(result.gate_evaluation?.missing_contracts).toEqual([]);
  });
});
