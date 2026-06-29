import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { constitutionCommand } from "./constitution";
import { writeYaml, readYaml } from "../utils/yaml";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-constitution-version-"));
}

async function setupProject(projectRoot: string) {
  // Create minimal constitution
  const constitution = {
    version: "1.0.0",
    project_name: "test-project",
    project_description: "Test",
    effective_date: "2026-01-01",
    last_revised: "2026-01-01T00:00:00.000Z",
    quality: {
      thresholds: {
        test_coverage: 0.8,
        cyclomatic_complexity: 15,
        ambiguity_score: 0,
      },
      required_linters: ["lint"],
      require_review_approvers: 1,
      articles: [
        {
          id: "story-has-ac",
          description: "Every story must have acceptance criteria",
          rule: {
            type: "required_section",
            artifact_kind: "plan/story",
            section: "Acceptance Criteria",
          },
        },
      ],
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
      minor_bump_on: ["contract-added"],
      patch_bump_on: ["bugfix"],
      deprecation_grace_releases: 2,
    },
  };

  await writeYaml(
    path.join(projectRoot, ".spec-graph", "constitution.yaml"),
    constitution,
  );
}

describe("Constitution Versioning", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
    await setupProject(projectRoot);
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it("constitution bump saves snapshot and bumps patch version", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "patch",
      });

      // Check version was bumped
      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      expect(constitution.version).toBe("1.0.1");

      // Check snapshot was created
      const snapshot = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", ".constitution-snapshot.json"),
      );
      expect(snapshot.version).toBe("1.0.0");
      expect(snapshot.constitution.version).toBe("1.0.0");
      expect(snapshot.snapshot_at).toBeDefined();

      // Check output
      expect(logs.some((l) => l.includes("1.0.0 → 1.0.1"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution bump minor increments minor version", async () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "minor",
      });

      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      expect(constitution.version).toBe("1.1.0");
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution bump major increments major version", async () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "major",
      });

      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      expect(constitution.version).toBe("2.0.0");
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution diff shows no changes when constitution unchanged", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      // Create snapshot first
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "patch",
      });

      // Now diff (should show no changes since we just bumped)
      await constitutionCommand(projectRoot, { subcommand: "diff" });

      const output = logs.join("\n");
      expect(output).toContain("No changes detected");
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution diff detects threshold changes", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      // Create snapshot
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "patch",
      });

      // Modify constitution
      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      constitution.quality.thresholds.test_coverage = 0.9;
      await writeYaml(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
        constitution,
      );

      // Diff should show change
      await constitutionCommand(projectRoot, { subcommand: "diff" });

      const output = logs.join("\n");
      expect(output).toContain("test_coverage");
      expect(output).toMatch(/0\.8.*0\.9/);
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution diff detects article additions", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      // Create snapshot
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "patch",
      });

      // Add new article
      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      constitution.quality.articles.push({
        id: "c4-has-context",
        description: "C4 diagram must include a Context section",
        rule: {
          type: "required_section",
          artifact_kind: "design/c4",
          section: "Context",
        },
      });
      await writeYaml(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
        constitution,
      );

      // Diff should show addition
      await constitutionCommand(projectRoot, { subcommand: "diff" });

      const output = logs.join("\n");
      expect(output).toContain("c4-has-context");
      expect(output).toMatch(/\+\s+c4-has-context/);
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution diff outputs JSON when --json flag set", async () => {
    const originalLog = console.log;
    let jsonOutput: any = null;
    console.log = (msg: string) => {
      try {
        jsonOutput = JSON.parse(msg);
      } catch {
        // Not JSON, ignore
      }
    };

    try {
      // Create snapshot
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "patch",
      });

      // Modify and diff with JSON output
      const constitution = await readYaml<any>(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
      );
      constitution.quality.thresholds.ambiguity_score = 5;
      await writeYaml(
        path.join(projectRoot, ".spec-graph", "constitution.yaml"),
        constitution,
      );

      await constitutionCommand(projectRoot, {
        subcommand: "diff",
        json: true,
      });

      expect(jsonOutput).toBeDefined();
      expect(jsonOutput.from_version).toBe("1.0.0");
      expect(jsonOutput.to_version).toBe("1.0.1");
      expect(jsonOutput.diff.thresholds.changed).toBeDefined();
      expect(jsonOutput.diff.thresholds.changed.length).toBeGreaterThan(0);
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution diff shows message when no snapshot exists", async () => {
    // Remove snapshot
    await fs.rm(
      path.join(projectRoot, ".spec-graph", ".constitution-snapshot.json"),
      { force: true },
    );

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);

    try {
      await constitutionCommand(projectRoot, { subcommand: "diff" });

      const output = logs.join("\n");
      expect(output).toContain("No constitution snapshot found");
    } finally {
      console.log = originalLog;
    }
  });

  it("constitution bump rejects invalid bump type", async () => {
    const originalLog = console.log;
    const originalExit = process.exit;
    let exitCode: number | undefined;
    console.log = () => {};
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as any;

    try {
      await constitutionCommand(projectRoot, {
        subcommand: "bump",
        type: "invalid",
      });
    } catch {
      // Expected to throw due to process.exit
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
