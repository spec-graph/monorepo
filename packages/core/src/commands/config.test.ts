import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCompose } from "../engine/compose/index";
import { configCommand } from "./config";
import { readYaml, writeYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-config-"));
}

describe("Project Config", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it("compose loads config.yaml and injects into graph", async () => {
    // Create minimal profile
    const profile = {
      version: "1",
      meta: {
        created_at: new Date().toISOString(),
        source: { repo_scan: true, llm_classified: false },
      },
      facts: {
        has_ui: "web",
        boundary: "internal",
        topology: "mono",
        deployment: "hosted-service",
        consumers: "self",
        field: "greenfield",
        criticality: "standard",
        team: "solo",
        persistence: "database",
      },
      repo_signals: {},
    };
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "profile.yaml"),
      profile,
    );

    // Create config.yaml
    await writeYaml(path.join(projectRoot, ".spec-graph", "config.yaml"), {
      version: "1",
      context: {
        tech_stack: "React 18 + TypeScript",
        conventions: "kebab-case files",
      },
      rules: { "requirement/proposal": "Must include security considerations" },
      references: { design_system: "https://design.example.com" },
    });

    const result = await runCompose(projectRoot, profile, "feature");

    expect(result.graph.project_config).toBeDefined();
    expect(result.graph.project_config?.version).toBe("1");
    expect(result.graph.project_config?.context?.tech_stack).toBe(
      "React 18 + TypeScript",
    );
    expect(result.graph.project_config?.rules?.["requirement/proposal"]).toBe(
      "Must include security considerations",
    );
    expect(result.graph.project_config?.references?.design_system).toBe(
      "https://design.example.com",
    );
  });

  it("compose handles missing config.yaml gracefully", async () => {
    const profile = {
      version: "1",
      meta: {
        created_at: new Date().toISOString(),
        source: { repo_scan: true, llm_classified: false },
      },
      facts: {
        has_ui: "none",
        boundary: "internal",
        topology: "mono",
        deployment: "process",
        consumers: "self",
        field: "greenfield",
        criticality: "prototype",
        team: "solo",
        persistence: "none",
      },
      repo_signals: {},
    };
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "profile.yaml"),
      profile,
    );

    const result = await runCompose(projectRoot, profile, "feature");

    // Should succeed without config
    expect(result.graph).toBeDefined();
    expect(result.graph.project_config).toBeUndefined();
  });

  it("config init creates template config.yaml", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await configCommand(projectRoot, { subcommand: "init" });

      const configPath = path.join(projectRoot, ".spec-graph", "config.yaml");
      const config = await readYaml<any>(configPath);

      expect(config.version).toBe("1");
      expect(config.context).toBeDefined();
      expect(config.context.tech_stack).toContain("TODO");
      expect(config.rules).toEqual({});
      expect(config.references).toEqual({});
      expect(logs.some((l) => l.includes("initialized"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("config set updates specific fields", async () => {
    // Init first
    await configCommand(projectRoot, { subcommand: "init" });

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await configCommand(projectRoot, {
        subcommand: "set",
        pairs: 'context.tech_stack="Vue 3 + Pinia"',
      });

      const configPath = path.join(projectRoot, ".spec-graph", "config.yaml");
      const config = await readYaml<any>(configPath);

      expect(config.context.tech_stack).toBe("Vue 3 + Pinia");
      expect(logs.some((l) => l.includes("Set context.tech_stack"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("config clear removes config.yaml", async () => {
    await configCommand(projectRoot, { subcommand: "init" });

    const configPath = path.join(projectRoot, ".spec-graph", "config.yaml");
    let exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const originalLog = console.log;
    console.log = () => {};
    try {
      await configCommand(projectRoot, { subcommand: "clear" });

      exists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });

  it("config show displays formatted output", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "config.yaml"), {
      version: "1",
      context: { lang: "TypeScript" },
      rules: { "artifact/x": "must have tests" },
      references: {},
    });

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await configCommand(projectRoot, { subcommand: "show" });

      const output = logs.join("\n");
      expect(output).toContain("Project Config");
      expect(output).toContain("lang: TypeScript");
      expect(output).toContain("artifact/x");
      expect(output).toContain("must have tests");
    } finally {
      console.log = originalLog;
    }
  });

  it("config set handles multiple pairs", async () => {
    await configCommand(projectRoot, { subcommand: "init" });

    const originalLog = console.log;
    console.log = () => {};
    try {
      await configCommand(projectRoot, {
        subcommand: "set",
        pairs: 'context.a="value1",context.b="value2",rules.x="rule1"',
      });

      const configPath = path.join(projectRoot, ".spec-graph", "config.yaml");
      const config = await readYaml<any>(configPath);

      expect(config.context.a).toBe("value1");
      expect(config.context.b).toBe("value2");
      expect(config.rules.x).toBe("rule1");
    } finally {
      console.log = originalLog;
    }
  });

  it("config set rejects invalid pairs", async () => {
    await configCommand(projectRoot, { subcommand: "init" });

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await configCommand(projectRoot, {
        subcommand: "set",
        pairs: "invalid_no_equals",
      });

      expect(logs.some((l) => l.includes("Skipping malformed pair"))).toBe(
        true,
      );
    } finally {
      console.log = originalLog;
    }
  });
});
