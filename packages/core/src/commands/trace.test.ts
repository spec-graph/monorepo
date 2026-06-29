import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { traceCommand } from "./trace";
import { writeYaml, readYaml } from "../utils/yaml";
import { Graph } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-trace-"));
}

function makeGraph(): Graph {
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
    checks: [],
    gates: [
      {
        id: "design-gate",
        on_transition: ["design→implement"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [
          {
            name: "req-to-design",
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
      stages: ["propose", "design", "implement"],
      max_retries: 3,
      on_exhausted: "escalate",
    },
    acceptance_layers: {},
    agents: [],
    agent_bindings: [],
    meetings: [],
  };
}

describe("trace add command", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "graph.yaml"),
      makeGraph(),
    );
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
      /* cleanup best-effort */
    }
  });

  it("creates a trace entry when --from/--to are valid artifact ids", async () => {
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
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        to: "design/architecture",
        via: "satisfies",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.added).toBe(true);
    expect(output.from).toBe("requirement/proposal");
    expect(output.to).toBe("design/architecture");
    expect(output.trace_name).toBe("req-to-design");
    expect(output.matching_gate_query).toBe("req-to-design");

    // Verify file written
    const traceFile = path.join(
      projectRoot,
      ".spec-graph",
      "traces",
      "req_to_design.yaml",
    );
    const data = await readYaml<any>(traceFile);
    expect(data.traces).toHaveLength(1);
    expect(data.traces[0].from).toBe("requirement/proposal");
    expect(data.traces[0].to).toBe("design/architecture");
    expect(data.traces[0].from_kind).toBe("requirement");
    expect(data.traces[0].to_kind).toBe("design");
    expect(data.traces[0].relation).toBe("satisfies");
  });

  it("appends to existing trace file without overwriting", async () => {
    // Pre-create a trace file with one entry
    const traceFile = path.join(
      projectRoot,
      ".spec-graph",
      "traces",
      "req_to_design.yaml",
    );
    await fs.mkdir(path.dirname(traceFile), { recursive: true });
    await writeYaml(traceFile, {
      traces: [
        {
          from: "requirement/other",
          from_kind: "requirement",
          to: "design/other",
          to_kind: "design",
          relation: "satisfies",
        },
      ],
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
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        to: "design/architecture",
        via: "satisfies",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.added).toBe(true);

    // Verify file has both entries
    const data = await readYaml<any>(traceFile);
    expect(data.traces).toHaveLength(2);
    expect(
      data.traces.some((t: any) => t.from === "requirement/proposal"),
    ).toBe(true);
    expect(data.traces.some((t: any) => t.from === "requirement/other")).toBe(
      true,
    );
  });

  it("does not add duplicate trace entry (same from/to/relation)", async () => {
    // First add
    const silence = (data: string) => {
      try {
        JSON.parse(data);
      } catch {
        /* */
      }
    };
    const originalLog = console.log;
    console.log = silence as any;
    try {
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        to: "design/architecture",
        via: "satisfies",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    // Second add — should be duplicate
    let output: any;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        to: "design/architecture",
        via: "satisfies",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.added).toBe(false);
    expect(output.reason).toBe("duplicate");
  });

  it("rejects --from that is not in graph", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      output.push(args.join(" "));
    };
    try {
      await traceCommand(projectRoot, "add", {
        from: "nonexistent/artifact",
        to: "design/architecture",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }
    expect(process.exitCode).toBe(1);
    expect(output.join("\n")).toMatch(/not found in graph/);
  });

  it("rejects when --from or --to missing", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      output.push(args.join(" "));
    };
    try {
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }
    expect(process.exitCode).toBe(1);
    expect(output.join("\n")).toMatch(/--from and --to are required/);
  });

  it('defaults relation to "satisfies" when --via/--relation omitted', async () => {
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
      await traceCommand(projectRoot, "add", {
        from: "requirement/proposal",
        to: "design/architecture",
        json: true,
      });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.relation).toBe("satisfies");
  });

  it('still works as legacy view when arg is a node-id (not "add")', async () => {
    // Prime traces first so the index has something
    await traceCommand(projectRoot, "add", {
      from: "requirement/proposal",
      to: "design/architecture",
      via: "satisfies",
      json: true,
    });

    // Legacy view should not crash
    let threw = false;
    const originalLog = console.log;
    console.log = () => {};
    try {
      await traceCommand(projectRoot, "requirement/proposal", {
        direction: "forward",
      });
    } catch {
      threw = true;
    } finally {
      console.log = originalLog;
    }
    expect(threw).toBe(false);
  });

  it("lists nodes when no arg provided", async () => {
    let threw = false;
    const originalLog = console.log;
    console.log = () => {};
    try {
      await traceCommand(projectRoot, undefined, {});
    } catch {
      threw = true;
    } finally {
      console.log = originalLog;
    }
    expect(threw).toBe(false);
  });
});
