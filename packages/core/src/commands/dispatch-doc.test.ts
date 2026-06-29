import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dispatchCommand } from "./dispatch";
import { writeYaml, readYaml } from "../utils/yaml";
import { Graph } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-dispatch-doc-"));
}

function makeGraphWithArtifact(): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      packs_used: [],
    },
    artifacts: [
      { id: "requirement/prd/PRD-001", kind: "requirement/prd" },
      { id: "design/architecture/ARCH-001", kind: "design/architecture" },
      { id: "plan/story/S-001", kind: "plan/story" },
    ],
    actions: [],
    checks: [],
    gates: [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/prd/PRD-001"],
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

describe("dispatch command — document guidance", () => {
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

  it("includes template_ref for produce_artifact actions", async () => {
    const graph = makeGraphWithArtifact();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

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
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("produce_artifact");
    expect(output.actions[0].template_ref).toBe("prd");
  });

  it("includes suggested_doc_path for produce_artifact actions", async () => {
    const graph = makeGraphWithArtifact();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

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
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].suggested_doc_path).toBe(
      ".spec-graph/artifacts/prd/PRD-001.md",
    );
  });

  it("includes document_guidance for produce_artifact actions", async () => {
    const graph = makeGraphWithArtifact();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

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
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].document_guidance).toContain(
      "Product Requirements Document",
    );
    expect(output.actions[0].document_guidance).toContain(
      "acceptance criteria",
    );
  });

  it("template_ref is undefined for non-produce_artifact actions", async () => {
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        packs_used: [],
      },
      artifacts: [],
      actions: [],
      checks: [{ id: "lint", kind: "lint", command: "true", layer: "unit" }],
      gates: [
        {
          id: "g",
          on_transition: ["propose→specify"],
          require_artifacts: [],
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
        stages: ["propose", "specify"],
        max_retries: 3,
        on_exhausted: "escalate",
      },
      acceptance_layers: {},
      agents: [],
      agent_bindings: [],
      meetings: [],
    };
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: { lint: { id: "lint", status: "failed" } },
      stage_history: [],
    });

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
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("run_check");
    expect(output.actions[0].template_ref).toBeUndefined();
    expect(output.actions[0].suggested_doc_path).toBeUndefined();
    expect(output.actions[0].document_guidance).toBeUndefined();
  });

  it("maps different artifact kinds to correct templates", async () => {
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        packs_used: [],
      },
      artifacts: [
        { id: "design/architecture/ARCH-001", kind: "design/architecture" },
      ],
      actions: [],
      checks: [],
      gates: [
        {
          id: "g",
          on_transition: ["design→implement"],
          require_artifacts: ["design/architecture/ARCH-001"],
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
        stages: ["design", "implement"],
        max_retries: 3,
        on_exhausted: "escalate",
      },
      acceptance_layers: {},
      agents: [],
      agent_bindings: [],
      meetings: [],
    };
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

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
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].template_ref).toBe("architecture");
    expect(output.actions[0].suggested_doc_path).toBe(
      ".spec-graph/artifacts/architecture/ARCH-001.md",
    );
    expect(output.actions[0].document_guidance).toContain(
      "Architecture Document",
    );
  });
});
