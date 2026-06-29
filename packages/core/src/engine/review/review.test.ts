/**
 * Tests for the Review Protocol Engine
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateReviewPrompts, ReviewConfig } from "./index";

describe("review engine", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "review-test-"));
    // Create minimal artifact
    const artifactsDir = path.join(tmpDir, ".spec-graph", "artifacts", "plan");
    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(
      path.join(artifactsDir, "plan-tasks.md"),
      "# Task Plan\n\n- Implement feature X\n- Write tests\n- Deploy\n\nCritical: Must handle edge cases.\n",
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("generateReviewPrompts", () => {
    it("generates prompts for specified models", async () => {
      const config: ReviewConfig = {
        models: ["claude", "codex"],
        includeFull: true,
        focusAreas: [],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0].model).toBe("claude");
      expect(result.reviews[1].model).toBe("codex");
    });

    it("uses model-specific system prompts", async () => {
      const config: ReviewConfig = {
        models: ["claude"],
        includeFull: true,
        focusAreas: [],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      expect(result.reviews[0].system_prompt).toContain("thorough code and specification reviewer");
    });

    it("uses default prompt for unknown models", async () => {
      const config: ReviewConfig = {
        models: ["unknown-model"],
        includeFull: true,
        focusAreas: [],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      expect(result.reviews[0].system_prompt).toContain("specification reviewer");
    });

    it("includes focus areas in user prompt", async () => {
      const config: ReviewConfig = {
        models: ["claude"],
        includeFull: true,
        focusAreas: ["security", "performance"],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      expect(result.reviews[0].user_prompt).toContain("security, performance");
    });

    it("uses distilled content when includeFull is false", async () => {
      const config: ReviewConfig = {
        models: ["claude"],
        includeFull: false,
        focusAreas: [],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      // Distilled content should still contain headings and bullets
      expect(result.reviews[0].artifact_content).toContain("# Task Plan");
    });

    it("throws for non-existent artifact", async () => {
      const config: ReviewConfig = {
        models: ["claude"],
        includeFull: true,
        focusAreas: [],
        format: "prompts",
      };
      await expect(
        generateReviewPrompts(tmpDir, "nonexistent", config),
      ).rejects.toThrow("not found");
    });

    it("includes artifact_id and source_path in result", async () => {
      const config: ReviewConfig = {
        models: ["claude"],
        includeFull: true,
        focusAreas: [],
        format: "prompts",
      };
      const result = await generateReviewPrompts(tmpDir, "plan-tasks", config);
      expect(result.artifact_id).toBe("plan-tasks");
      expect(result.source_path).toContain("plan-tasks.md");
      expect(result.generated_at).toBeTruthy();
    });
  });
});
