import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installCommand } from "./install";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-install-"));
}

describe("install command", () => {
  it("should install skills to .claude/skills/ for Claude Code", async () => {
    const projectRoot = await makeTempDir();

    await installCommand(projectRoot, { ide: "claude-code", json: true });

    const skillsDir = path.join(projectRoot, ".claude", "skills");
    const entries = await fs.readdir(skillsDir);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries).toContain("spec-graph-init");
    expect(entries).toContain("spec-graph-sense");
    expect(entries).toContain("spec-graph-compose");
  });

  it("should create .spec-graph/ directory", async () => {
    const projectRoot = await makeTempDir();

    await installCommand(projectRoot, { ide: "claude-code", json: true });

    const specGraphDir = path.join(projectRoot, ".spec-graph");
    const stat = await fs.stat(specGraphDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("should not overwrite existing skills without --force", async () => {
    const projectRoot = await makeTempDir();
    const skillsDir = path.join(
      projectRoot,
      ".claude",
      "skills",
      "spec-graph-init",
    );
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "marker.txt"), "existing");

    await installCommand(projectRoot, { ide: "claude-code", json: true });

    // The marker file should still be there (not overwritten)
    const markerExists = await fs
      .access(path.join(skillsDir, "marker.txt"))
      .then(
        () => true,
        () => false,
      );
    expect(markerExists).toBe(true);
  });

  it("should overwrite existing skills with --force", async () => {
    const projectRoot = await makeTempDir();
    const skillsDir = path.join(
      projectRoot,
      ".claude",
      "skills",
      "spec-graph-init",
    );
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "marker.txt"), "existing");

    await installCommand(projectRoot, {
      ide: "claude-code",
      force: true,
      json: true,
    });

    // The marker file should be gone (skill was reinstalled)
    const markerExists = await fs
      .access(path.join(skillsDir, "marker.txt"))
      .then(
        () => true,
        () => false,
      );
    expect(markerExists).toBe(false);

    // SKILL.md should be present
    const skillExists = await fs.access(path.join(skillsDir, "SKILL.md")).then(
      () => true,
      () => false,
    );
    expect(skillExists).toBe(true);
  });

  it("should install to .agents/skills/ for Cursor IDE", async () => {
    const projectRoot = await makeTempDir();

    await installCommand(projectRoot, { ide: "cursor", json: true });

    const skillsDir = path.join(projectRoot, ".agents", "skills");
    const entries = await fs.readdir(skillsDir);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries).toContain("spec-graph-init");
  });

  it("should copy SKILL.md with proper frontmatter", async () => {
    const projectRoot = await makeTempDir();

    await installCommand(projectRoot, { ide: "claude-code", json: true });

    const skillPath = path.join(
      projectRoot,
      ".claude",
      "skills",
      "spec-graph-init",
      "SKILL.md",
    );
    const content = await fs.readFile(skillPath, "utf-8");
    expect(content).toContain("---");
    expect(content).toContain("name: spec-graph-init");
    expect(content).toContain("description:");
  });

  it("should skip OS artifacts like .DS_Store", async () => {
    const projectRoot = await makeTempDir();

    await installCommand(projectRoot, { ide: "claude-code", json: true });

    const skillsDir = path.join(projectRoot, ".claude", "skills");
    // Walk all skill directories and verify no .DS_Store files
    const entries = await fs.readdir(skillsDir);
    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      const stat = await fs.stat(skillDir);
      if (stat.isDirectory()) {
        const files = await fs.readdir(skillDir);
        expect(files).not.toContain(".DS_Store");
      }
    }
  });

  it("should auto-detect Claude Code when .claude/ exists", async () => {
    const projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".claude"), { recursive: true });

    await installCommand(projectRoot, { json: true });

    // Should install to .claude/skills/
    const skillsDir = path.join(projectRoot, ".claude", "skills");
    const entries = await fs.readdir(skillsDir);
    expect(entries.length).toBeGreaterThan(0);
  });
});
