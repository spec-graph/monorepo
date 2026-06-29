import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { profileCommand } from "./profile";
import { writeYaml } from "../utils/yaml";
import { Profile } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-profile-"));
}

async function writeProfile(
  projectRoot: string,
  overrides: Partial<Profile> = {},
): Promise<void> {
  const profile: Profile = {
    version: "1",
    meta: {
      created_at: new Date().toISOString(),
      source: { repo_scan: true, llm_classified: false },
    },
    facts: {
      has_ui: { value: "none", confidence: "low", source: "llm" },
      boundary: { value: "internal", confidence: "low", source: "llm" },
      topology: { value: "mono", confidence: "low", source: "llm" },
      deployment: { value: "process", confidence: "low", source: "llm" },
      consumers: { value: "self", confidence: "low", source: "llm" },
      field: { value: "brownfield", confidence: "high", source: "repo" },
      criticality: { value: "standard", confidence: "low", source: "llm" },
      team: { value: "small", confidence: "low", source: "llm" },
      persistence: { value: "unknown", confidence: "low", source: "llm" },
    },
    repo_signals: {},
    ...overrides,
  };
  await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "profile.yaml"),
    profile,
  );
}

describe("profile command", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeTempDir();
  });
  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  describe("show", () => {
    it("renders facts and unreviewed status", async () => {
      await writeProfile(projectRoot);
      await profileCommand(projectRoot, { subcommand: "show" });
    });
    it("exits when no profile exists", async () => {
      await expect(
        profileCommand(projectRoot, { subcommand: "show" }),
      ).rejects.toThrow();
    });
  });

  describe("review", () => {
    it("sets reviewed_at to freeze the profile", async () => {
      await writeProfile(projectRoot);
      await profileCommand(projectRoot, { subcommand: "review" });
      const p = await readProfile(projectRoot);
      expect(p.meta?.source?.reviewed_at).toBeDefined();
    });
  });

  describe("override", () => {
    it("merges key=value pairs into profile.overrides", async () => {
      await writeProfile(projectRoot);
      await profileCommand(projectRoot, {
        subcommand: "override",
        pairs: "criticality=compliance,team=multi",
      });
      const p = await readProfile(projectRoot);
      expect(p.overrides?.criticality).toBe("compliance");
      expect(p.overrides?.team).toBe("multi");
    });
    it("accumulates with existing overrides", async () => {
      await writeProfile(projectRoot, { overrides: { has_ui: "web" } });
      await profileCommand(projectRoot, {
        subcommand: "override",
        pairs: "criticality=compliance",
      });
      const p = await readProfile(projectRoot);
      expect(p.overrides?.has_ui).toBe("web");
      expect(p.overrides?.criticality).toBe("compliance");
    });
    it("refuses empty pairs", async () => {
      await writeProfile(projectRoot);
      await expect(
        profileCommand(projectRoot, { subcommand: "override" }),
      ).rejects.toThrow();
    });
    it("warns on invalid dimension but still applies valid ones", async () => {
      await writeProfile(projectRoot);
      await profileCommand(projectRoot, {
        subcommand: "override",
        pairs: "criticality=compliance,bogus=x",
      });
      const p = await readProfile(projectRoot);
      expect(p.overrides?.criticality).toBe("compliance");
      expect(p.overrides?.bogus as any).toBeUndefined();
    });
  });
});

async function readProfile(projectRoot: string): Promise<Profile> {
  const content = await fs.readFile(
    path.join(projectRoot, ".spec-graph", "profile.yaml"),
    "utf-8",
  );
  return require("js-yaml").load(content) as Profile;
}
