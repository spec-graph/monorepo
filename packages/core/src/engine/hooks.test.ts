import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeHooks, loadHooks } from "../engine/hooks";
import { writeYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-hooks-"));
}

describe("hooks engine", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  it("returns empty hooks when hooks.yaml doesn't exist", async () => {
    const config = await loadHooks(projectRoot);
    expect(config.hooks).toEqual([]);
  });

  it("loads hooks from hooks.yaml", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "echo 'pre-dispatch'",
          when: "pre",
          command_name: "dispatch",
        },
        {
          command: "echo 'post-dispatch'",
          when: "post",
          command_name: "dispatch",
        },
      ],
    });

    const config = await loadHooks(projectRoot);
    expect(config.hooks).toHaveLength(2);
    expect(config.hooks[0].command).toBe("echo 'pre-dispatch'");
    expect(config.hooks[0].when).toBe("pre");
    expect(config.hooks[0].command_name).toBe("dispatch");
  });

  it("executes only hooks matching command_name", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "echo 'dispatch-hook'",
          when: "pre",
          command_name: "dispatch",
        },
        {
          command: "echo 'transition-hook'",
          when: "pre",
          command_name: "transition",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].stdout).toBe("dispatch-hook");
  });

  it("executes hooks with undefined command_name for all commands", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "echo 'global-hook'",
          when: "pre",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].stdout).toBe("global-hook");
  });

  it("passes environment variables to hooks", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "echo $SPEC_GRAPH_COMMAND",
          when: "pre",
          command_name: "dispatch",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].stdout).toBe("dispatch");
  });

  it("handles hook failure gracefully", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "exit 1",
          when: "pre",
          command_name: "dispatch",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].exit_code).toBe(1);
  });

  it("respects timeout", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "sleep 10",
          when: "pre",
          command_name: "dispatch",
          timeout_ms: 100,
        },
      ],
    });

    const startTime = Date.now();
    const results = await executeHooks(projectRoot, "dispatch", "pre");
    const duration = Date.now() - startTime;

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(duration).toBeLessThan(1000); // Should timeout quickly
  });

  it("stops executing hooks when abort_on_failure is true", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "exit 1",
          when: "pre",
          command_name: "dispatch",
          abort_on_failure: true,
        },
        {
          command: "echo 'should-not-run'",
          when: "pre",
          command_name: "dispatch",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });

  it("continues executing hooks when abort_on_failure is false", async () => {
    await writeYaml(path.join(projectRoot, ".spec-graph", "hooks.yaml"), {
      version: "1",
      hooks: [
        {
          command: "exit 1",
          when: "pre",
          command_name: "dispatch",
          abort_on_failure: false,
        },
        {
          command: "echo 'should-run'",
          when: "pre",
          command_name: "dispatch",
        },
      ],
    });

    const results = await executeHooks(projectRoot, "dispatch", "pre");
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
    expect(results[1].stdout).toBe("should-run");
  });
});
