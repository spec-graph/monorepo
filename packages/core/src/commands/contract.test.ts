import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { contractCommand } from "./contract";
import { readYaml, writeYaml } from "../utils/yaml";
import { ContractRegistryEntry, Graph, Gate } from "../types/index";
import { runEnforce } from "../engine/enforce/index";
import { runBuiltinCheck } from "../engine/checks/builtin";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-contract-"));
}

function makeGraph(
  contracts: Array<{
    id: string;
    kind: string;
    default_producer?: string;
    default_consumers?: string[];
  }>,
): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: contracts,
    actions: [],
    checks: [],
    gates: [],
    tracks: [
      {
        id: "be",
        scope: "backend",
        actions: [],
        produces: ["contract/openapi"],
        consumes: [],
      },
      {
        id: "fe",
        scope: "frontend",
        actions: [],
        produces: [],
        consumes: ["contract/openapi"],
      },
    ],
    pipeline_skeleton: { stages: [], max_retries: 3, on_exhausted: "block" },
    acceptance_layers: {},
  };
}

async function readContract(
  contractsDir: string,
  id: string,
): Promise<ContractRegistryEntry> {
  const safe = id.replace(/\//g, "_");
  return readYaml<ContractRegistryEntry>(
    path.join(contractsDir, `${safe}.yaml`),
  );
}

describe("contract command", () => {
  let projectRoot: string;
  let contractsDir: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    contractsDir = path.join(projectRoot, ".spec-graph", "contracts");
    await fs.mkdir(contractsDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  describe("init-from-graph", () => {
    it("seeds contract entries from graph artifacts with producer/consumer tracks", async () => {
      const graph = makeGraph([
        {
          id: "contract/openapi",
          kind: "contract/openapi",
          default_producer: "be",
          default_consumers: ["fe"],
        },
      ]);
      await fs.mkdir(path.join(projectRoot, ".spec-graph"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(projectRoot, ".spec-graph", "graph.yaml"),
        // Use YAML directly to match what compose actually writes
        require("js-yaml").dump(graph),
      );

      await contractCommand(projectRoot, { subcommand: "init-from-graph" });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.contract_id).toBe("contract/openapi");
      expect(entry.producer).toBe("be");
      expect(entry.current_version).toBe("0.0.0");
      expect(entry.consumers).toHaveLength(1);
      expect(entry.consumers[0].consumer).toBe("fe");
      expect(entry.consumers[0].bound_version).toBe("0.0.0");
      expect(entry.consumers[0].status).toBe("current");
    });

    it("is idempotent — skips contracts that already exist", async () => {
      const graph = makeGraph([
        {
          id: "contract/openapi",
          kind: "contract/openapi",
          default_producer: "be",
          default_consumers: ["fe"],
        },
      ]);
      await fs.mkdir(path.join(projectRoot, ".spec-graph"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(projectRoot, ".spec-graph", "graph.yaml"),
        require("js-yaml").dump(graph),
      );

      await contractCommand(projectRoot, { subcommand: "init-from-graph" });
      await contractCommand(projectRoot, { subcommand: "init-from-graph" });

      const files = await fs.readdir(contractsDir);
      expect(files.filter((f) => f.endsWith(".yaml"))).toHaveLength(1);
    });

    it("reports when graph has no contracts", async () => {
      const graph = makeGraph([]);
      await fs.mkdir(path.join(projectRoot, ".spec-graph"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(projectRoot, ".spec-graph", "graph.yaml"),
        require("js-yaml").dump(graph),
      );

      await contractCommand(projectRoot, { subcommand: "init-from-graph" });
      // No contracts file should exist
      const files = await fs.readdir(contractsDir);
      expect(files.filter((f) => f.endsWith(".yaml"))).toHaveLength(0);
    });
  });

  describe("publish", () => {
    it("publishes a new version and records it", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
        notes: "initial release",
      });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.current_version).toBe("1.0.0");
      expect(entry.versions).toHaveLength(1);
      expect(entry.versions[0].version).toBe("1.0.0");
      expect(entry.versions[0].producer).toBe("be");
    });

    it("refuses to publish the same version twice", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.versions).toHaveLength(1);
    });

    it("marks existing consumers as stale when a new version is published", async () => {
      // Seed a contract with a consumer bound to v1.0.0
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });

      let entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.consumers[0].status).toBe("current");

      // Publish v1.1.0 — fe should now be stale
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.1.0",
        producer: "be",
      });

      entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.current_version).toBe("1.1.0");
      expect(entry.consumers[0].status).toBe("stale");
      expect(entry.drift?.stale_consumers).toContain("fe");
    });
  });

  describe("bind", () => {
    it("binds a new consumer and marks it current when version matches", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.consumers).toHaveLength(1);
      expect(entry.consumers[0].consumer).toBe("fe");
      expect(entry.consumers[0].bound_version).toBe("1.0.0");
      expect(entry.consumers[0].status).toBe("current");
    });

    it("binds a consumer to an outdated version and marks it stale", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "2.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.consumers[0].status).toBe("stale");
    });

    it("updates an existing binding when re-bound to a new version", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "2.0.0",
        producer: "be",
      });
      // Re-bind to catch up
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "2.0.0",
      });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.consumers).toHaveLength(1);
      expect(entry.consumers[0].bound_version).toBe("2.0.0");
      expect(entry.consumers[0].status).toBe("current");
    });
  });

  describe("unbind", () => {
    it("removes a consumer binding", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });
      await contractCommand(projectRoot, {
        subcommand: "unbind",
        id: "contract/openapi",
        consumer: "fe",
      });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.consumers).toHaveLength(0);
    });
  });

  describe("drift", () => {
    it("reports zero drift when all consumers are on current versions", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });

      await contractCommand(projectRoot, { subcommand: "drift" });

      const entry = await readContract(contractsDir, "contract/openapi");
      expect(entry.drift?.stale_consumers).toHaveLength(0);
    });

    it("reports stale consumers across multiple contracts", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/db-schema",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/openapi",
        consumer: "fe",
        version: "1.0.0",
      });
      await contractCommand(projectRoot, {
        subcommand: "bind",
        id: "contract/db-schema",
        consumer: "fe",
        version: "1.0.0",
      });

      // Bump both contracts
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "2.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/db-schema",
        version: "2.0.0",
        producer: "be",
      });

      await contractCommand(projectRoot, { subcommand: "drift" });

      const openapi = await readContract(contractsDir, "contract/openapi");
      const dbSchema = await readContract(contractsDir, "contract/db-schema");
      expect(openapi.drift?.stale_consumers).toContain("fe");
      expect(dbSchema.drift?.stale_consumers).toContain("fe");
    });
  });

  describe("list", () => {
    it("lists all registered contracts", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/db-schema",
        version: "1.0.0",
        producer: "be",
      });

      await contractCommand(projectRoot, { subcommand: "list" });

      const files = await fs.readdir(contractsDir);
      expect(files.filter((f) => f.endsWith(".yaml"))).toHaveLength(2);
    });

    it("emits JSON when --json is set", async () => {
      await contractCommand(projectRoot, {
        subcommand: "publish",
        id: "contract/openapi",
        version: "1.0.0",
        producer: "be",
      });
      await contractCommand(projectRoot, { subcommand: "list", json: true });
      // No throw = success; we'd verify the JSON shape in a stricter test
    });
  });
});

async function writeContractEntry(
  projectRoot: string,
  entry: ContractRegistryEntry,
): Promise<void> {
  const safe = entry.contract_id.replace(/\//g, "_");
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "contracts", `${safe}.yaml`),
    entry,
  );
}

function makeGate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: "exit-merged",
    on_transition: ["accept", "integrate"],
    require_artifacts: [],
    require_checks: [],
    require_traces: [],
    require_contracts_current: false,
    forbid: [],
    fail_mode: "block",
    enabled: true,
    provided_by: "foundation",
    ...overrides,
  };
}

function graphWithGate(gate: Gate): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "t",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks: [],
    gates: [gate],
    tracks: [],
    pipeline_skeleton: { stages: [], max_retries: 3, on_exhausted: "block" },
    acceptance_layers: {},
  };
}

describe("contract drift as a gate", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "contracts"), {
      recursive: true,
    });
  });
  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("passes when require_contracts_current is false (no drift check)", async () => {
    // Even with drifted consumers, gate ignores contracts when flag is off.
    await writeContractEntry(projectRoot, {
      contract_id: "contract/openapi",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        {
          version: "2.0.0",
          published_at: new Date().toISOString(),
          producer: "be",
        },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: new Date().toISOString(),
          status: "stale",
        },
      ],
    });
    const graph = graphWithGate(makeGate({ require_contracts_current: false }));
    const r = await runEnforce(projectRoot, graph);
    expect(r.evaluated_gates[0].passed).toBe(true);
    expect(r.evaluated_gates[0].missing_contracts).toHaveLength(0);
  });

  it("blocks when require_contracts_current is true and a consumer is stale", async () => {
    await writeContractEntry(projectRoot, {
      contract_id: "contract/openapi",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        {
          version: "2.0.0",
          published_at: new Date().toISOString(),
          producer: "be",
        },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: new Date().toISOString(),
          status: "stale",
        },
      ],
    });
    const graph = graphWithGate(makeGate({ require_contracts_current: true }));
    const r = await runEnforce(projectRoot, graph);
    expect(r.evaluated_gates[0].passed).toBe(false);
    expect(r.evaluated_gates[0].missing_contracts.length).toBeGreaterThan(0);
    expect(r.blocking_gates).toContain("exit-merged");
  });

  it("passes when require_contracts_current is true and all consumers are current", async () => {
    await writeContractEntry(projectRoot, {
      contract_id: "contract/openapi",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        {
          version: "2.0.0",
          published_at: new Date().toISOString(),
          producer: "be",
        },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "2.0.0",
          bound_at: new Date().toISOString(),
          status: "current",
        },
      ],
    });
    const graph = graphWithGate(makeGate({ require_contracts_current: true }));
    const r = await runEnforce(projectRoot, graph);
    expect(r.evaluated_gates[0].passed).toBe(true);
  });

  it("passes when require_contracts_current is true but no registry exists", async () => {
    const graph = graphWithGate(makeGate({ require_contracts_current: true }));
    const r = await runEnforce(projectRoot, graph);
    expect(r.evaluated_gates[0].passed).toBe(true);
  });
});

describe("contract-drift-scan builtin check", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "contracts"), {
      recursive: true,
    });
  });
  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("passes when no registry exists", async () => {
    const r = await runBuiltinCheck("contract-drift-scan", {
      projectRoot,
      graph: {} as any,
      state: {} as any,
    });
    expect(r.passed).toBe(true);
  });

  it("passes when all consumers are current", async () => {
    await writeContractEntry(projectRoot, {
      contract_id: "contract/openapi",
      producer: "be",
      current_version: "1.0.0",
      versions: [
        {
          version: "1.0.0",
          published_at: new Date().toISOString(),
          producer: "be",
        },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: new Date().toISOString(),
          status: "current",
        },
      ],
    });
    const r = await runBuiltinCheck("contract-drift-scan", {
      projectRoot,
      graph: {} as any,
      state: {} as any,
    });
    expect(r.passed).toBe(true);
  });

  it("fails when a consumer is on a stale version", async () => {
    await writeContractEntry(projectRoot, {
      contract_id: "contract/openapi",
      producer: "be",
      current_version: "2.0.0",
      versions: [
        {
          version: "2.0.0",
          published_at: new Date().toISOString(),
          producer: "be",
        },
      ],
      consumers: [
        {
          consumer: "fe",
          bound_version: "1.0.0",
          bound_at: new Date().toISOString(),
          status: "stale",
        },
      ],
    });
    const r = await runBuiltinCheck("contract-drift-scan", {
      projectRoot,
      graph: {} as any,
      state: {} as any,
    });
    expect(r.passed).toBe(false);
    expect(r.details.drifted.length).toBeGreaterThan(0);
  });
});

describe("contract reverify", () => {
  let projectRoot: string;
  let contractsDir: string;
  beforeEach(async () => {
    projectRoot = await makeTempDir();
    contractsDir = path.join(projectRoot, ".spec-graph", "contracts");
    await fs.mkdir(contractsDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("bumps consumer to current_version and stamps reverified_at", async () => {
    // Seed: fe bound to 1.0.0, producer publishes 2.0.0 → fe becomes stale.
    await contractCommand(projectRoot, {
      subcommand: "publish",
      id: "contract/openapi",
      version: "1.0.0",
      producer: "be",
    });
    await contractCommand(projectRoot, {
      subcommand: "bind",
      id: "contract/openapi",
      consumer: "fe",
      version: "1.0.0",
    });
    await contractCommand(projectRoot, {
      subcommand: "publish",
      id: "contract/openapi",
      version: "2.0.0",
      producer: "be",
    });

    // Confirm stale.
    let entry = await readContract(contractsDir, "contract/openapi");
    expect(entry.consumers.find((c) => c.consumer === "fe")!.status).toBe(
      "stale",
    );
    expect(entry.drift?.stale_consumers).toContain("fe");

    // Consumer re-verifies.
    await contractCommand(projectRoot, {
      subcommand: "reverify",
      id: "contract/openapi",
      consumer: "fe",
    });

    entry = await readContract(contractsDir, "contract/openapi");
    const c = entry.consumers.find((x) => x.consumer === "fe")!;
    expect(c.status).toBe("current");
    expect(c.bound_version).toBe("2.0.0");
    expect(c.reverified_at).toBeDefined();
    expect(entry.drift?.stale_consumers).not.toContain("fe");
  });

  it("refuses to reverify an unbound consumer", async () => {
    await contractCommand(projectRoot, {
      subcommand: "publish",
      id: "contract/openapi",
      version: "1.0.0",
      producer: "be",
    });
    await expect(
      contractCommand(projectRoot, {
        subcommand: "reverify",
        id: "contract/openapi",
        consumer: "ghost",
      }),
    ).rejects.toThrow();
  });

  it("refuses without consumer", async () => {
    await expect(
      contractCommand(projectRoot, {
        subcommand: "reverify",
        id: "contract/openapi",
      }),
    ).rejects.toThrow();
  });

  it("ripple closes the loop: stale gate clears after reverify", async () => {
    // Producer publishes → consumer stale → gate would block.
    await contractCommand(projectRoot, {
      subcommand: "publish",
      id: "contract/openapi",
      version: "1.0.0",
      producer: "be",
    });
    await contractCommand(projectRoot, {
      subcommand: "bind",
      id: "contract/openapi",
      consumer: "fe",
      version: "1.0.0",
    });
    await contractCommand(projectRoot, {
      subcommand: "publish",
      id: "contract/openapi",
      version: "2.0.0",
      producer: "be",
    });

    // Gate blocks on stale consumer.
    const gate: Gate = {
      id: "exit-merged",
      on_transition: ["accept", "integrate"],
      require_artifacts: [],
      require_checks: [],
      require_traces: [],
      require_contracts_current: true,
      forbid: [],
      fail_mode: "block",
      enabled: true,
      provided_by: "foundation",
    };
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: "",
        profile_hash: "",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [],
      actions: [],
      checks: [],
      gates: [gate],
      tracks: [],
      pipeline_skeleton: { stages: [], max_retries: 3, on_exhausted: "block" },
      acceptance_layers: {},
    };
    let result = await runEnforce(projectRoot, graph);
    expect(result.blocking_gates).toContain("exit-merged");

    // Consumer reverifies.
    await contractCommand(projectRoot, {
      subcommand: "reverify",
      id: "contract/openapi",
      consumer: "fe",
    });

    // Gate now passes.
    result = await runEnforce(projectRoot, graph);
    expect(result.blocking_gates).not.toContain("exit-merged");
    expect(result.evaluated_gates[0].missing_contracts).toHaveLength(0);
  });
});
