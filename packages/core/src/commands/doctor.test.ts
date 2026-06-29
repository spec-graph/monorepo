import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { doctorCommand, DoctorCheck } from "./doctor";
import { writeYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-doctor-"));
}

function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const original = console.log;
    let output = "";
    console.log = (...args: any[]) => {
      output += args.map(String).join(" ") + "\n";
    };
    fn()
      .then(() => {
        console.log = original;
        resolve({ stdout: output });
      })
      .catch((err) => {
        console.log = original;
        reject(err);
      });
  });
}

describe("doctor command", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  it("reports missing .spec-graph/ directory as error", async () => {
    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain(".spec-graph/ directory is missing");
  });

  it("reports missing graph.yaml as error when dir exists but graph is missing", async () => {
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    await writeYaml(path.join(projectRoot, ".spec-graph", "profile.yaml"), {
      facts: { has_ui: { value: "yes", confidence: "low", source: "user" } },
    });
    await writeYaml(path.join(projectRoot, ".spec-graph", "permissions.yaml"), {
      level: "semi-auto",
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("graph.yaml is missing");
  });

  it("passes all checks for a fully initialized and composed project", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await fs.mkdir(path.join(specGraphDir, "traces"), { recursive: true });

    await writeYaml(path.join(specGraphDir, "profile.yaml"), {
      version: "1",
      facts: { has_ui: { value: "yes", confidence: "high", source: "user" } },
    });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [{ id: "plan/story", kind: "plan" }],
      actions: [],
      checks: [{ id: "lint", kind: "lint", command: "npm run lint" }],
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: { "plan/story": { id: "plan/story", status: "pending" } },
      checks: { lint: { id: "lint", status: "pending" } },
      metadata: {
        created_at: new Date().toISOString(),
        change_type: "feature",
      },
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("All checks passed");
  });

  it("detects invalid graph.yaml YAML", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await fs.writeFile(path.join(specGraphDir, "graph.yaml"), "{{{bad yaml!!!");

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("invalid YAML");
  });

  it("detects missing machine-state.yaml", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("machine-state.yaml is missing");
  });

  it("detects invalid machine-state.yaml", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await fs.writeFile(
      path.join(specGraphDir, "machine-state.yaml"),
      "{{{bad yaml!!!",
    );

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("invalid YAML");
  });

  it("detects orphaned state entries", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [{ id: "plan/story", kind: "plan" }],
      actions: [],
      checks: [{ id: "lint", kind: "lint", command: "npm run lint" }],
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {
        "plan/story": { id: "plan/story", status: "pending" },
        "old-gone-artifact": { id: "old-gone-artifact", status: "completed" },
      },
      checks: {
        lint: { id: "lint", status: "pending" },
        "old-gone-check": { id: "old-gone-check", status: "passed" },
      },
      metadata: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("orphaned");
  });

  it("detects missing state entries (in graph but not seeded)", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [{ id: "plan/story", kind: "plan" }],
      actions: [],
      checks: [{ id: "lint", kind: "lint", command: "npm run lint" }],
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("not seeded");
  });

  it("detects stage inconsistency", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "nonexistent-stage",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("not in graph pipeline stages");
  });

  it("detects invalid permission level", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "super-auto",
    }); // invalid level
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("Invalid permission level");
  });

  it("outputs JSON when --json flag is set", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, { json: true }),
    );
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty("ok");
    expect(parsed).toHaveProperty("errors");
    expect(parsed).toHaveProperty("warnings");
    expect(parsed).toHaveProperty("checks");
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it("auto-fix creates missing machine-state.yaml when graph exists", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });

    await doctorCommand(projectRoot, { fix: true });

    // State file should now exist
    const state = await fs.readFile(
      path.join(specGraphDir, "machine-state.yaml"),
      "utf-8",
    );
    expect(state).toContain("current_stage");
    expect(state).toContain("plan");
  });

  it("validates trace files", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await fs.mkdir(path.join(specGraphDir, "traces"), { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [{ id: "plan/story", kind: "plan" }],
      actions: [],
      checks: [],
      gates: [
        {
          id: "entry",
          on_transition: ["plan", "implement"],
          require_artifacts: [],
          require_checks: [],
          require_traces: [
            {
              name: "t1",
              from_kind: "plan",
              to_kind: "plan",
              via: ["derives"],
              cardinality: "exists",
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
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });
    // Valid trace
    await writeYaml(path.join(specGraphDir, "traces", "t1.yaml"), {
      traces: [
        {
          from: "plan/story",
          from_kind: "plan",
          to: "plan/story",
          to_kind: "plan",
          relation: "derives",
        },
      ],
    });
    // Invalid trace
    await fs.writeFile(
      path.join(specGraphDir, "traces", "bad.yaml"),
      "{{{bad yaml!!!",
    );

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("invalid YAML");
    expect(stdout).toContain("valid");
  });

  it("detects placeholders in trace files", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await fs.mkdir(path.join(specGraphDir, "traces"), { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });
    await writeYaml(path.join(specGraphDir, "traces", "t1.yaml"), {
      traces: [
        {
          from: "<source-artifact-id>",
          to: "<target-artifact-id>",
          relation: "derives",
        },
      ],
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("placeholder");
  });

  it("detects graph with no artifacts, checks, or gates", async () => {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    await fs.mkdir(specGraphDir, { recursive: true });
    await writeYaml(path.join(specGraphDir, "profile.yaml"), { facts: {} });
    await writeYaml(path.join(specGraphDir, "permissions.yaml"), {
      level: "semi-auto",
    });
    await writeYaml(path.join(specGraphDir, "graph.yaml"), {
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
      gates: [],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    });
    await writeYaml(path.join(specGraphDir, "machine-state.yaml"), {
      current_stage: "plan",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    });

    const { stdout } = await captureOutput(() =>
      doctorCommand(projectRoot, {}),
    );
    expect(stdout).toContain("no artifacts, checks, or gates");
  });
});
