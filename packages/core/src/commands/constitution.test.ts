import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { constitutionCommand, loadConstitution } from "./constitution";
import { readYaml, writeYaml } from "../utils/yaml";
import { Constitution, Graph, CheckDecl } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-const-"));
}

async function writeConstitution(
  projectRoot: string,
  c: Constitution,
): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "constitution.yaml"),
    c,
  );
}

async function writeGraph(
  projectRoot: string,
  checks: CheckDecl[],
): Promise<void> {
  const graph: Graph = {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks,
    gates: [],
    tracks: [],
    pipeline_skeleton: { stages: [], max_retries: 3, on_exhausted: "block" },
    acceptance_layers: {},
  };
  await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);
}

function validConstitution(): Constitution {
  return {
    version: "0.1.0",
    project_name: "test-project",
    project_description: "Test project",
    effective_date: "2026-01-01",
    last_revised: new Date().toISOString(),
    quality: {
      thresholds: {
        test_coverage: 0.8,
        cyclomatic_complexity: 15,
        ambiguity_score: 0,
        placeholder_count: 0,
        non_measurable_count: 5,
        lint_warnings: 0,
      },
      required_linters: ["lint", "typecheck"],
      require_review_approvers: 1,
    },
    traceability: {
      required_traces: [
        {
          name: "story_to_prd",
          from_kind: "plan/story",
          to_kind: "requirement/prd",
          via: ["derives"],
          cardinality: "every",
        },
      ],
      require_ac_test_binding: true,
      require_commit_story_ref: true,
    },
    semver: {
      major_bump_on: ["contract-removed"],
      minor_bump_on: ["feature-added"],
      patch_bump_on: ["bugfix"],
      deprecation_grace_releases: 2,
    },
  };
}

describe("constitution command", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  describe("init", () => {
    it("creates a constitution from defaults when no profile/package.json exists", async () => {
      await constitutionCommand(projectRoot, { subcommand: "init" });

      const c = await loadConstitution(projectRoot);
      expect(c).not.toBeNull();
      expect(c!.version).toBe("0.1.0");
      expect(c!.project_name).toBeDefined();
      expect(c!.quality.thresholds.test_coverage).toBe(0.8);
      expect(c!.quality.thresholds.cyclomatic_complexity).toBe(15);
      expect(c!.quality.required_linters).toEqual(["lint", "typecheck"]);
      expect(c!.traceability.required_traces.length).toBeGreaterThan(0);
      expect(c!.semver.deprecation_grace_releases).toBe(2);
    });

    it("reads project name from package.json when present", async () => {
      await fs.writeFile(
        path.join(projectRoot, "package.json"),
        JSON.stringify({ name: "my-app", description: "Cool app" }, null, 2),
      );

      await constitutionCommand(projectRoot, { subcommand: "init" });

      const c = await loadConstitution(projectRoot);
      expect(c!.project_name).toBe("my-app");
      expect(c!.project_description).toBe("Cool app");
    });

    it("refuses to overwrite without --force", async () => {
      await writeConstitution(projectRoot, validConstitution());

      await constitutionCommand(projectRoot, { subcommand: "init" });

      // Existing content should be preserved
      const c = await loadConstitution(projectRoot);
      expect(c!.project_name).toBe("test-project");
    });

    it("overwrites when --force is set", async () => {
      await writeConstitution(projectRoot, validConstitution());

      await constitutionCommand(projectRoot, {
        subcommand: "init",
        force: true,
      });

      const c = await loadConstitution(projectRoot);
      // After force-init, project_name should be the directory basename (no package.json)
      expect(c!.project_name).not.toBe("test-project");
    });
  });

  describe("show", () => {
    it("renders the constitution with thresholds and traces", async () => {
      await writeConstitution(projectRoot, validConstitution());
      await constitutionCommand(projectRoot, { subcommand: "show" });
      // No throw = success
    });

    it("emits JSON when --json is set", async () => {
      await writeConstitution(projectRoot, validConstitution());
      await constitutionCommand(projectRoot, {
        subcommand: "show",
        json: true,
      });
    });

    it("exits when no constitution exists", async () => {
      await expect(
        constitutionCommand(projectRoot, { subcommand: "show" }),
      ).rejects.toThrow();
    });
  });

  describe("validate", () => {
    it("passes for a valid constitution", async () => {
      await writeConstitution(projectRoot, validConstitution());
      await constitutionCommand(projectRoot, { subcommand: "validate" });
    });

    it("fails when test_coverage is out of range", async () => {
      const c = validConstitution();
      (c.quality.thresholds as any).test_coverage = 1.5;
      await writeConstitution(projectRoot, c);

      await expect(
        constitutionCommand(projectRoot, { subcommand: "validate" }),
      ).rejects.toThrow();
    });

    it("fails when cyclomatic_complexity is below 1", async () => {
      const c = validConstitution();
      c.quality.thresholds.cyclomatic_complexity = 0;
      await writeConstitution(projectRoot, c);

      await expect(
        constitutionCommand(projectRoot, { subcommand: "validate" }),
      ).rejects.toThrow();
    });

    it("fails when trace cardinality is invalid", async () => {
      const c = validConstitution();
      c.traceability.required_traces[0].cardinality = "sometimes" as any;
      await writeConstitution(projectRoot, c);

      await expect(
        constitutionCommand(projectRoot, { subcommand: "validate" }),
      ).rejects.toThrow();
    });

    it("warns when pack-declared threshold diverges from constitution", async () => {
      await writeConstitution(projectRoot, validConstitution());
      // Pack says 25, constitution says 15
      await writeGraph(projectRoot, [
        {
          id: "complexity-budget",
          kind: "lint",
          command: "<complexity-scan>",
          threshold: { cyclomatic: 25 },
        },
      ]);

      // validate should NOT throw (only warnings, no errors) but should output the drift
      await constitutionCommand(projectRoot, { subcommand: "validate" });
    });
  });

  describe("diff-packs", () => {
    it("reports pack thresholds that differ from constitution", async () => {
      await writeConstitution(projectRoot, validConstitution());
      await writeGraph(projectRoot, [
        {
          id: "complexity-budget",
          kind: "lint",
          command: "<complexity-scan>",
          threshold: { cyclomatic: 25 },
        },
        {
          id: "clarify-scan",
          kind: "lint",
          command: "<clarify-scan>",
          threshold: { ambiguity: 0 },
        },
      ]);

      await constitutionCommand(projectRoot, { subcommand: "diff-packs" });
      // No throw = success; output should mention complexity-budget drift
    });

    it("reports no drift when pack and constitution match", async () => {
      await writeConstitution(projectRoot, validConstitution());
      await writeGraph(projectRoot, [
        {
          id: "complexity-budget",
          kind: "lint",
          command: "<complexity-scan>",
          threshold: { cyclomatic: 15 },
        },
      ]);

      await constitutionCommand(projectRoot, { subcommand: "diff-packs" });
    });
  });
});

describe("loadConstitution", () => {
  it("returns null when no constitution exists", async () => {
    const projectRoot = await makeTempDir();
    const c = await loadConstitution(projectRoot);
    expect(c).toBeNull();
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("returns parsed constitution when present", async () => {
    const projectRoot = await makeTempDir();
    await writeConstitution(projectRoot, validConstitution());
    const c = await loadConstitution(projectRoot);
    expect(c?.project_name).toBe("test-project");
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });
});
