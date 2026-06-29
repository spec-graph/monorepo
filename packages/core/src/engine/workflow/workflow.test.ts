import { describe, expect, it } from "vitest";
import { findNextStage, inferStageOrder, isValidTransition } from "./index";
import { Graph } from "../../types/index";

function makeGraph(): Graph {
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
        id: "entry-phase4",
        on_transition: ["plan", "implement"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "test",
      },
      {
        id: "exit-merged",
        on_transition: ["accept", "integrate"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [],
        forbid: [],
        fail_mode: "block",
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

describe("Workflow stage order", () => {
  it("should prepend gated stages before the pipeline skeleton", () => {
    expect(inferStageOrder(makeGraph())).toEqual([
      "plan",
      "implement",
      "review",
      "test",
      "accept",
      "integrate",
    ]);
  });

  it("should find next stages from the inferred order", () => {
    const graph = makeGraph();

    expect(findNextStage(graph, "plan")).toBe("implement");
    expect(findNextStage(graph, "implement")).toBe("review");
    expect(findNextStage(graph, "accept")).toBe("integrate");
    expect(findNextStage(graph, "integrate")).toBeNull();
  });

  it("should prefer direct transition into the pipeline over unrelated branch ordering", () => {
    const graph = makeGraph();
    graph.gates.unshift({
      id: "requirements-clarified",
      on_transition: ["specify", "design"],
      require_artifacts: [],
      require_checks: [],
      require_traces: [],
      forbid: [],
      fail_mode: "block",
      enabled: true,
      provided_by: "test",
    });

    expect(findNextStage(graph, "plan")).toBe("implement");
  });

  it("should validate explicit and adjacent transitions only", () => {
    const graph = makeGraph();

    expect(isValidTransition(graph, "plan", "implement")).toBe(true);
    expect(isValidTransition(graph, "implement", "review")).toBe(true);
    expect(isValidTransition(graph, "accept", "integrate")).toBe(true);
    expect(isValidTransition(graph, "plan", "review")).toBe(false);
    expect(isValidTransition(graph, "implement", "accept")).toBe(false);
  });
});
