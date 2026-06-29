import { describe, it, expect } from "vitest";
import { runSense } from "./index";
import path from "node:path";
import fs from "node:fs/promises";

describe("Sense Engine", () => {
  it("should analyze the spec-graph project itself", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    expect(result.profile).toBeDefined();
    expect(result.profile.version).toBe("1");
    expect(result.profile.facts).toBeDefined();
    expect(result.signals).toBeDefined();
  });

  it("should detect all 9 dimensions", async () => {
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
      expect(
        result.profile.facts[dim as keyof typeof result.profile.facts],
      ).toBeDefined();
    }
  });

  it("should detect source files", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    expect(result.signals.srcFileCount).toBeGreaterThan(0);
  });

  it("should detect package.json", async () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const result = await runSense(projectRoot);

    expect(result.signals.hasPackageJson).toBe(true);
  });
});
