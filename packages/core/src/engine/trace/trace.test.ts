import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildTraceIndex,
  evaluateTraceQuery,
  traceBackward,
  traceForward,
  listTraceNodes,
} from "./index";
import { Graph } from "../../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-trace-"));
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
      { id: "requirement/prd", kind: "requirement" },
      { id: "plan/story", kind: "plan" },
      {
        id: "contract/openapi",
        kind: "contract",
        default_producer: "be",
        default_consumers: ["fe"],
      },
    ],
    actions: [],
    checks: [
      { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
      { id: "unit-test", kind: "test", command: "npm test", layer: "unit" },
    ],
    gates: [
      {
        id: "entry-phase4",
        on_transition: ["plan", "implement"],
        require_artifacts: ["plan/story"],
        require_checks: ["unit-test"],
        require_traces: [
          {
            name: "story_to_req",
            from_kind: "plan",
            to_kind: "requirement",
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
    tracks: [
      { id: "fe", scope: "frontend", actions: ["implement", "review"] },
      { id: "be", scope: "backend", actions: ["contract", "implement"] },
    ],
    pipeline_skeleton: {
      stages: ["implement", "review"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
  };
}

describe("Trace Engine", () => {
  describe("buildTraceIndex", () => {
    it("should index all graph artifacts", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      expect(index.nodes.has("requirement/prd")).toBe(true);
      expect(index.nodes.has("plan/story")).toBe(true);
      expect(index.nodes.has("contract/openapi")).toBe(true);
    });

    it("should index all graph checks", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      expect(index.nodes.has("lint")).toBe(true);
      expect(index.nodes.has("unit-test")).toBe(true);
    });

    it("should index all graph gates", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      expect(index.nodes.has("entry-phase4")).toBe(true);
    });

    it("should index all graph tracks", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      expect(index.nodes.has("fe")).toBe(true);
      expect(index.nodes.has("be")).toBe(true);
    });

    it("should create edges from producers to contracts and contracts to consumers", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      const producerEdge = index.edges.find(
        (e) =>
          e.from === "be" &&
          e.to === "contract/openapi" &&
          e.relation === "produces",
      );
      expect(producerEdge).toBeDefined();

      const consumerEdge = index.edges.find(
        (e) =>
          e.from === "contract/openapi" &&
          e.to === "fe" &&
          e.relation === "consumes",
      );
      expect(consumerEdge).toBeDefined();
    });

    it("should load trace data from .spec-graph/traces/", async () => {
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

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      const edge = index.edges.find(
        (e) =>
          e.from === "plan/story" &&
          e.to === "requirement/prd" &&
          e.relation === "derives",
      );
      expect(edge).toBeDefined();
    });

    it("should index requirement nodes from trace files", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(projectRoot, ".spec-graph", "traces", "reqs.yaml"),
        [
          "requirements:",
          "  - id: REQ-001",
          '    title: "User authentication"',
          "    priority: high",
          "    implemented_by:",
          "      - plan/story",
        ].join("\n"),
        "utf-8",
      );

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      const reqNode = index.nodes.get("REQ-001");
      expect(reqNode).toBeDefined();
      expect(reqNode?.type).toBe("requirement");
      expect(reqNode?.metadata.title).toBe("User authentication");

      const edge = index.edges.find(
        (e) =>
          e.from === "REQ-001" &&
          e.to === "plan/story" &&
          e.relation === "implemented_by",
      );
      expect(edge).toBeDefined();
    });
  });

  describe("evaluateTraceQuery", () => {
    async function makeIndexWithTrace(): Promise<{
      index: Awaited<ReturnType<typeof buildTraceIndex>>;
      projectRoot: string;
    }> {
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

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());
      return { index, projectRoot };
    }

    it("should pass exists query when a trace path is found", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "story_to_req",
        from_kind: "plan",
        to_kind: "requirement",
        via: ["derives"],
        cardinality: "exists",
      });

      expect(evaluation.passed).toBe(true);
    });

    it("should fail exists query when no trace path exists", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "missing_trace",
        from_kind: "plan",
        to_kind: "contract",
        via: ["derives"],
        cardinality: "exists",
      });

      expect(evaluation.passed).toBe(false);
      expect(evaluation.missing_reason).toBe("No matching trace path found");
    });

    it("should fail when no source nodes match from_kind", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "no_source",
        from_kind: "nonexistent_kind",
        to_kind: "requirement",
        via: ["derives"],
        cardinality: "exists",
      });

      expect(evaluation.passed).toBe(false);
      expect(evaluation.missing_reason).toContain("No source nodes found");
    });

    it("should fail when no target nodes match to_kind", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "no_target",
        from_kind: "plan",
        to_kind: "nonexistent_kind",
        via: ["derives"],
        cardinality: "exists",
      });

      expect(evaluation.passed).toBe(false);
      expect(evaluation.missing_reason).toContain("No target nodes found");
    });

    it("should pass single query with exactly one match", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "story_to_req_single",
        from_kind: "plan",
        to_kind: "requirement",
        via: ["derives"],
        cardinality: "single",
      });

      expect(evaluation.passed).toBe(true);
    });

    it("should pass every query when all sources are traced", async () => {
      const { index } = await makeIndexWithTrace();
      const evaluation = evaluateTraceQuery(index, {
        name: "story_to_req_every",
        from_kind: "plan",
        to_kind: "requirement",
        via: ["derives"],
        cardinality: "every",
      });

      expect(evaluation.passed).toBe(true);
    });

    it("should match by node id kind as well as type", async () => {
      const { index } = await makeIndexWithTrace();
      // Query by kind 'lint' — should match the check with kind='lint'
      const evaluation = evaluateTraceQuery(index, {
        name: "lint_query",
        from_kind: "lint",
        to_kind: "requirement",
        via: [],
        cardinality: "exists",
      });

      // No trace path, but source/target should match by metadata.kind
      expect(evaluation.source_count).toBe(1);
    });
  });

  describe("traceBackward", () => {
    it("should trace all incoming edges from a node", async () => {
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
      graph.artifacts.push({ id: "design/c4", kind: "design" });

      // Add backward edge: gate requires plan/story
      const index = await buildTraceIndex(projectRoot, graph);

      const result = traceBackward(index, "entry-phase4");
      expect(result.found).toBe(true);

      const nodeIds = result.path.map((p) => p.node_id);
      // Should include plan/story (incoming edge to gate) and unit-test (incoming edge to gate)
      expect(nodeIds).toContain("plan/story");
      expect(nodeIds).toContain("unit-test");
    });

    it("should return empty path for unknown node", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());
      const result = traceBackward(index, "nonexistent-node");

      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
    });
  });

  describe("traceForward", () => {
    it("should trace all outgoing edges from a node", async () => {
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

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      const result = traceForward(index, "plan/story");
      expect(result.found).toBe(true);

      const nodeIds = result.path.map((p) => p.node_id);
      expect(nodeIds).toContain("requirement/prd");
    });

    it("should follow producer→contract→consumer chain", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());

      const result = traceForward(index, "be");
      expect(result.found).toBe(true);

      const nodeIds = result.path.map((p) => p.node_id);
      expect(nodeIds).toContain("contract/openapi");
      expect(nodeIds).toContain("fe");
    });
  });

  describe("listTraceNodes", () => {
    it("should list all nodes in the index", async () => {
      const projectRoot = await makeTempDir();
      await fs.mkdir(path.join(projectRoot, ".spec-graph", "traces"), {
        recursive: true,
      });

      const index = await buildTraceIndex(projectRoot, makeBaseGraph());
      const nodes = listTraceNodes(index);

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n) => n.id === "requirement/prd")).toBe(true);
      expect(nodes.some((n) => n.id === "lint")).toBe(true);
      expect(nodes.some((n) => n.id === "fe")).toBe(true);
    });
  });
});
