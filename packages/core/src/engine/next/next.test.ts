import { describe, it, expect } from "vitest";
import { computeNextPlan } from "./index";
import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";

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
    checks: [
      { id: "story-slicing", kind: "lint", command: "<story-slicing-check>" },
    ],
    gates: [
      {
        id: "stories-decomposed",
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
      stages: ["plan", "implement"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
  };
}

function makeState(overrides: Partial<MachineState> = {}): MachineState {
  return {
    current_stage: "plan",
    stage_history: [],
    artifacts: {},
    checks: {},
    metadata: {},
    ...overrides,
  };
}

describe("Next Engine", () => {
  it("should report missing artifacts and checks for next transition", async () => {
    const plan = await computeNextPlan(makeGraph(), makeState());

    expect(plan.done).toBe(false);
    expect(plan.current_stage).toBe("plan");
    expect(plan.next_stage).toBe("implement");
    expect(plan.blocking_gate).toBe("stories-decomposed");
    expect(plan.gate_passed).toBe(false);
    expect(plan.missing_artifacts).toEqual(["plan/story"]);
    expect(plan.failed_checks).toEqual(["story-slicing"]);
    expect(plan.suggested_actions.map((a) => a.type)).toEqual([
      "produce_artifact",
      "run_check",
    ]);
  });

  it("should suggest transition when gate requirements are satisfied", async () => {
    const plan = await computeNextPlan(
      makeGraph(),
      makeState({
        artifacts: { "plan/story": { id: "plan/story", status: "completed" } },
        checks: { "story-slicing": { id: "story-slicing", status: "passed" } },
      }),
    );

    expect(plan.gate_passed).toBe(true);
    expect(plan.suggested_actions).toHaveLength(1);
    expect(plan.suggested_actions[0]).toMatchObject({
      type: "transition",
      id: "plan→implement",
    });
  });

  it("should mark workflow done at the final stage", async () => {
    const plan = await computeNextPlan(
      makeGraph(),
      makeState({ current_stage: "implement" }),
    );

    expect(plan.done).toBe(true);
    expect(plan.next_stage).toBeNull();
    expect(plan.suggested_actions).toEqual([]);
  });

  it("should aggregate requirements from all gates on the same transition", async () => {
    const graph = makeGraph();
    graph.gates.push({
      id: "entry-phase4",
      on_transition: ["plan", "implement"],
      require_artifacts: ["requirement/prd"],
      require_checks: ["clarify-scan"],
      require_traces: [],
      forbid: [],
      fail_mode: "block",
      enabled: true,
      provided_by: "test",
    });

    const plan = await computeNextPlan(graph, makeState());

    expect(plan.blocking_gate).toBe("stories-decomposed, entry-phase4");
    expect(plan.missing_artifacts).toEqual(["plan/story", "requirement/prd"]);
    expect(plan.failed_checks).toEqual(["story-slicing", "clarify-scan"]);
  });

  it("should suggest transition when a gated transition has all requirements met", async () => {
    const plan = await computeNextPlan(
      makeGraph(),
      makeState({
        artifacts: { "plan/story": { id: "plan/story", status: "completed" } },
        checks: { "story-slicing": { id: "story-slicing", status: "passed" } },
      }),
    );

    expect(plan.gate_passed).toBe(true);
    expect(plan.suggested_actions[0].type).toBe("transition");
  });

  it("should suggest perform_stage for an ungated pipeline-adjacent transition", async () => {
    const graph = makeGraph();
    graph.pipeline_skeleton.stages = ["plan", "implement", "review"];
    // No gate on implement → review — it's agent work, not auto-transition

    const state = makeState({
      current_stage: "implement",
      artifacts: { "plan/story": { id: "plan/story", status: "completed" } },
      checks: { "story-slicing": { id: "story-slicing", status: "passed" } },
    });

    const plan = await computeNextPlan(graph, state);

    expect(plan.done).toBe(false);
    expect(plan.next_stage).toBe("review");
    expect(plan.blocking_gate).toBeNull();
    expect(plan.gate_passed).toBe(true);
    expect(plan.suggested_actions).toHaveLength(1);
    expect(plan.suggested_actions[0]).toMatchObject({
      type: "perform_stage",
      id: "review",
    });
  });

  it("should suggest transition for an explicit gated transition beyond the first", async () => {
    const graph = makeGraph();
    graph.pipeline_skeleton.stages = ["plan", "implement", "review"];

    const state = makeState({
      current_stage: "plan",
      artifacts: { "plan/story": { id: "plan/story", status: "completed" } },
      checks: { "story-slicing": { id: "story-slicing", status: "passed" } },
    });

    const plan = await computeNextPlan(graph, state);

    // plan → implement has an explicit gate → transition
    expect(plan.gate_passed).toBe(true);
    expect(plan.suggested_actions[0].type).toBe("transition");
  });

  it("surfaces missing_contracts when gate requires contracts_current and drift exists", async () => {
    const graph = makeGraph();
    graph.gates[0].require_contracts_current = true;
    // Satisfy artifacts + checks so only contract drift blocks
    const state = makeState({
      artifacts: { "plan/story": { id: "plan/story", status: "completed" } },
      checks: { "story-slicing": { id: "story-slicing", status: "passed" } },
    });

    // No projectRoot → contract check skipped (plan can't load registry)
    const planNoRoot = await computeNextPlan(
      graph,
      state,
      undefined,
      undefined,
    );
    expect(planNoRoot.missing_contracts).toEqual([]);
    expect(planNoRoot.gate_passed).toBe(true); // can't check, so doesn't block

    // With projectRoot pointing to a temp dir with no contracts/ → no drift
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-next-"));
    try {
      const planNoDrift = await computeNextPlan(
        graph,
        state,
        undefined,
        tmpDir,
      );
      expect(planNoDrift.missing_contracts).toEqual([]);
      expect(planNoDrift.gate_passed).toBe(true);

      // Now create a drifted contract entry
      const contractsDir = path.join(tmpDir, ".spec-graph", "contracts");
      await fs.mkdir(contractsDir, { recursive: true });
      await fs.writeFile(
        path.join(contractsDir, "contract_api.yaml"),
        JSON.stringify(
          {
            contract_id: "contract/api",
            producer: "backend",
            current_version: "2.0.0",
            versions: [],
            consumers: [
              {
                consumer: "frontend",
                bound_version: "1.0.0",
                bound_at: "2026-01-01",
                status: "current",
              },
            ],
          },
          null,
          2,
        ),
      );

      const planDrifted = await computeNextPlan(
        graph,
        state,
        undefined,
        tmpDir,
      );
      expect(planDrifted.missing_contracts.length).toBeGreaterThan(0);
      expect(planDrifted.missing_contracts[0]).toContain("contract/api");
      expect(planDrifted.missing_contracts[0]).toContain("frontend");
      expect(planDrifted.gate_passed).toBe(false);
      // Should suggest resolve_violation action for the drift
      const resolveActions = planDrifted.suggested_actions.filter(
        (a) => a.type === "resolve_violation",
      );
      expect(resolveActions.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
