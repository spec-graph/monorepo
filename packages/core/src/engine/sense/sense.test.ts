import { describe, it, expect } from "vitest";
import { runSense } from "./index";
import path from "node:path";

describe("Sense Engine (minimal — no scanning)", () => {
  it("should return a profile skeleton with all dimensions = unknown", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    expect(result.profile).toBeDefined();
    expect(result.profile.version).toBe("1");
    expect(result.profile.facts).toBeDefined();
  });

  it("should not scan repo or return signals", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    // signals field no longer exists — spec-graph does not scan
    expect((result as any).signals).toBeUndefined();
  });

  it("should mark all 9 dimensions as unknown (agent fills via overrides)", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    const dimensions = [
      "has_ui",
      "boundary",
      "topology",
      "deployment",
      "consumers",
      "field",
      "criticality",
      "team",
      "persistence",
    ];

    for (const dim of dimensions) {
      const fact = result.profile.facts[dim as keyof typeof result.profile.facts];
      expect(fact).toBeDefined();
      expect(fact.value).toBe("unknown");
      expect(fact.source).toBe("fallback");
    }
  });

  it("should store description for agent reference", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot, {
      description: "Test project description",
    });

    expect((result.profile as any).description).toBe("Test project description");
  });
});
