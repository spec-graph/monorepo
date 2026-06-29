import { describe, it, expect } from "vitest";
import {
  parseBuildTargets,
  parseProfileOverrides,
  collectOverrides,
  BUILD_TARGET_MAP,
} from "./overrides";

describe("parseBuildTargets", () => {
  it("expands known targets to dimension overrides", () => {
    const r = parseBuildTargets("spa,api");
    expect(r.overrides.has_ui).toBe("web");
    expect(r.overrides.boundary).toBe("published-api");
    expect(r.warnings).toHaveLength(0);
  });
  it("warns on unknown target", () => {
    const r = parseBuildTargets("spa,unknown");
    expect(
      r.warnings.some((w) => w.includes("unknown build target 'unknown'")),
    ).toBe(true);
  });
  it("later target wins on conflict with a warning", () => {
    // web → has_ui=web; embedded → has_ui=none. Last wins.
    const r = parseBuildTargets("web,embedded");
    expect(r.overrides.has_ui).toBe("none");
    expect(r.warnings.some((w) => w.includes("overriding earlier"))).toBe(true);
  });
  it("accepts array input", () => {
    const r = parseBuildTargets(["lib", "embedded"]);
    expect(r.overrides.boundary).toBe("published-lib");
    expect(r.overrides.deployment).toBe("firmware");
  });
  it("returns empty for no input", () => {
    const r = parseBuildTargets(undefined);
    expect(Object.keys(r.overrides)).toHaveLength(0);
  });
});

describe("parseProfileOverrides", () => {
  it("parses key=value pairs", () => {
    const r = parseProfileOverrides("criticality=compliance,team=multi");
    expect(r.overrides.criticality).toBe("compliance");
    expect(r.overrides.team).toBe("multi");
  });
  it("warns on invalid dimension key", () => {
    const r = parseProfileOverrides("not_a_dim=foo");
    expect(
      r.warnings.some((w) => w.includes("unknown dimension 'not_a_dim'")),
    ).toBe(true);
    expect(r.overrides.not_a_dim as any).toBeUndefined();
  });
  it("warns on missing equals", () => {
    const r = parseProfileOverrides("criticality");
    expect(r.warnings.some((w) => w.includes("malformed override"))).toBe(true);
  });
  it("warns on empty value", () => {
    const r = parseProfileOverrides("criticality=");
    expect(r.warnings.some((w) => w.includes("empty value"))).toBe(true);
  });
});

describe("collectOverrides", () => {
  it("explicit profile-override wins over build shorthand", () => {
    // --build=web says has_ui=web; --profile-override=has_ui=native wins.
    const r = collectOverrides("web", "has_ui=native");
    expect(r.overrides.has_ui).toBe("native");
  });
  it("merges non-conflicting dimensions", () => {
    const r = collectOverrides("api", "criticality=compliance");
    expect(r.overrides.boundary).toBe("published-api");
    expect(r.overrides.criticality).toBe("compliance");
  });
});

describe("BUILD_TARGET_MAP coverage", () => {
  it("covers the canonical targets from the design", () => {
    for (const t of [
      "web",
      "spa",
      "api",
      "lib",
      "embedded",
      "cli",
      "gui",
      "app",
      "plugin",
    ]) {
      expect(BUILD_TARGET_MAP[t]).toBeDefined();
    }
  });
});
