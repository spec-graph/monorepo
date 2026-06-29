import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { primeCommand } from "./prime";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-prime-"));
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
    artifacts: [
      { id: "plan/story", kind: "plan/story" },
      { id: "requirement/prd", kind: "requirement/prd" },
    ],
    actions: [],
    checks: [
      { id: "story-slicing", kind: "lint", command: "<story-slicing-check>" },
      { id: "lint", kind: "lint", command: "npm run lint" },
    ],
    gates: [
      {
        id: "entry-phase4",
        on_transition: ["plan", "implement"],
        require_artifacts: ["plan/story"],
        require_checks: ["story-slicing"],
        require_traces: [
          {
            name: "story_to_req",
            from_kind: "plan/story",
            to_kind: "requirement/prd",
            via: ["derives"],
            cardinality: "every",
          },
        ],
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

describe("prime command", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  it("seeds all graph-declared artifacts into machine state as pending", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    await primeCommand(projectRoot, {});

    const state = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    );
    expect(state.artifacts["plan/story"]).toBeDefined();
    expect(state.artifacts["plan/story"].status).toBe("pending");
    expect(state.artifacts["requirement/prd"]).toBeDefined();
    expect(state.artifacts["requirement/prd"].status).toBe("pending");
  });

  it("seeds all graph-declared checks into machine state as pending", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    await primeCommand(projectRoot, {});

    const state = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    );
    expect(state.checks["story-slicing"]).toBeDefined();
    expect(state.checks["story-slicing"].status).toBe("pending");
    expect(state.checks["lint"]).toBeDefined();
    expect(state.checks["lint"].status).toBe("pending");
  });

  it("bootstraps placeholder checks as passed when --bootstrap is set", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    await primeCommand(projectRoot, { bootstrap: true });

    const state = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    );
    expect(state.checks["story-slicing"].status).toBe("passed");
    // Real check still pending
    expect(state.checks["lint"].status).toBe("pending");
  });

  it("creates trace skeleton files for gate-required trace queries", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    await primeCommand(projectRoot, { bootstrap: true });

    const tracePath = path.join(
      projectRoot,
      ".spec-graph",
      "traces",
      "story_to_req.yaml",
    );
    const trace = await readYaml<any>(tracePath);
    expect(trace.traces).toHaveLength(1);
    expect(trace.traces[0].from_kind).toBe("plan/story");
    expect(trace.traces[0].to_kind).toBe("requirement/prd");
  });

  it("does not overwrite existing machine state entries", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    // Pre-populate with a completed artifact
    const engine = new StateMachineEngine(
      graph,
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    );
    await engine.getState();
    await engine.updateArtifact("plan/story", {
      status: "completed",
      produced_by: "pm",
    });

    await primeCommand(projectRoot, {});

    const state = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
    );
    expect(state.artifacts["plan/story"].status).toBe("completed");
    expect(state.artifacts["plan/story"].produced_by).toBe("pm");
    // New artifact still gets seeded
    expect(state.artifacts["requirement/prd"]).toBeDefined();
  });

  it("does not overwrite existing trace files", async () => {
    const graph = makeGraph();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
      recursive: true,
    });
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "traces", "story_to_req.yaml"),
      {
        traces: [
          {
            from: "plan/story",
            from_kind: "plan/story",
            to: "requirement/prd",
            to_kind: "requirement/prd",
            relation: "derives",
          },
        ],
      },
    );

    await primeCommand(projectRoot, { bootstrap: true });

    const trace = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "traces", "story_to_req.yaml"),
    );
    // Our pre-written content should be preserved (not the skeleton)
    expect(trace.traces[0].from).toBe("plan/story");
    expect(trace.traces[0].to).toBe("requirement/prd");
  });
});
