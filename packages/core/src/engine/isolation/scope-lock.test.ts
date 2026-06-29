import { describe, it, expect } from "vitest";
import {
  validateScopeLock,
  matchGlob,
  summarizeViolations,
  detectScopeOverlaps,
} from "./scope-lock";
import type { ScopeLockDecl } from "../../types/index";

function makeLock(overrides: Partial<ScopeLockDecl> = {}): ScopeLockDecl {
  return {
    unit_id: "story-1",
    allowed_paths: ["src/fe/**"],
    protected_paths: ["src/shared/**"],
    forbidden_paths: ["dist/**", ".env*"],
    enforcement_mode: "strict",
    locked_at: new Date().toISOString(),
    locked_by: "test",
    ...overrides,
  };
}

describe("matchGlob", () => {
  it("matches exact paths", () => {
    expect(matchGlob("src/foo.ts", "src/foo.ts")).toBe(true);
    expect(matchGlob("src/foo.ts", "src/bar.ts")).toBe(false);
  });

  it("matches single-segment wildcard", () => {
    expect(matchGlob("src/foo.ts", "src/*.ts")).toBe(true);
    expect(matchGlob("src/sub/foo.ts", "src/*.ts")).toBe(false);
  });

  it("matches recursive wildcard", () => {
    expect(matchGlob("src/a/b/c.ts", "src/**/*.ts")).toBe(true);
    expect(matchGlob("src/foo.ts", "src/**/*.ts")).toBe(true);
    expect(matchGlob("lib/foo.ts", "src/**/*.ts")).toBe(false);
  });

  it("matches ? wildcard", () => {
    expect(matchGlob("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchGlob("src/ab.ts", "src/?.ts")).toBe(false);
  });
});

describe("validateScopeLock", () => {
  it("passes when all files are in allowed paths", () => {
    const lock = makeLock();
    const result = validateScopeLock(
      ["src/fe/App.tsx", "src/fe/index.ts"],
      lock,
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags forbidden paths", () => {
    const lock = makeLock();
    const result = validateScopeLock(
      ["src/fe/App.tsx", "dist/bundle.js"],
      lock,
    );
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].kind).toBe("forbidden-touched");
    expect(result.violations[0].file).toBe("dist/bundle.js");
  });

  it("flags protected paths (read-only)", () => {
    const lock = makeLock();
    const result = validateScopeLock(["src/shared/utils.ts"], lock);
    expect(result.passed).toBe(false);
    expect(result.violations[0].kind).toBe("protected-modified");
  });

  it("flags files outside allowed paths", () => {
    const lock = makeLock();
    const result = validateScopeLock(["src/be/server.ts"], lock);
    expect(result.passed).toBe(false);
    expect(result.violations[0].kind).toBe("not-allowed");
  });

  it("forbidden trumps allowed", () => {
    // A path in both forbidden and allowed: forbidden wins
    const lock = makeLock({
      allowed_paths: ["dist/**"],
      forbidden_paths: ["dist/**"],
    });
    const result = validateScopeLock(["dist/bundle.js"], lock);
    expect(result.passed).toBe(false);
    expect(result.violations[0].kind).toBe("forbidden-touched");
  });

  it('empty allowed_paths means "anything not forbidden"', () => {
    const lock = makeLock({ allowed_paths: [] });
    const result = validateScopeLock(["anything/goes.ts"], lock);
    expect(result.passed).toBe(true);
  });

  it("handles paths with leading ./", () => {
    const lock = makeLock();
    const result = validateScopeLock(["./src/fe/App.tsx"], lock);
    expect(result.passed).toBe(true);
  });
});

describe("summarizeViolations", () => {
  it("reports OK for passing result", () => {
    const result = validateScopeLock(["src/fe/App.tsx"], makeLock());
    expect(summarizeViolations(result)).toContain("OK");
  });

  it("reports STRICT mode and counts", () => {
    const result = validateScopeLock(["dist/x.js", "src/be/y.ts"], makeLock());
    const summary = summarizeViolations(result);
    expect(summary).toContain("STRICT");
    expect(summary).toContain("forbidden");
    expect(summary).toContain("not-allowed");
  });
});

describe("scope prefix overlap detection", () => {
  function makeLockFor(
    unitId: string,
    allowed: string[],
  ): ScopeLockDecl {
    return {
      unit_id: unitId,
      allowed_paths: allowed,
      protected_paths: [],
      forbidden_paths: [],
      enforcement_mode: "strict",
      locked_at: new Date().toISOString(),
      locked_by: "test",
    };
  }

  it("detects exact overlap when two locks share the same path", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/feature-a"]),
      "unit-b": makeLockFor("unit-b", ["src/feature-a"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].kind).toBe("exact");
  });

  it("detects prefix overlap when one path is subdirectory of another", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/a"]),
      "unit-b": makeLockFor("unit-b", ["src/a/utils"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBeGreaterThan(0);
    expect(overlaps.some((o) => o.kind === "nested" || o.kind === "prefix")).toBe(true);
  });

  it("detects nested overlap with glob patterns", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/module/**"]),
      "unit-b": makeLockFor("unit-b", ["src/module/utils"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBeGreaterThan(0);
  });

  it("returns empty when scopes are disjoint", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/frontend"]),
      "unit-b": makeLockFor("unit-b", ["src/backend"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBe(0);
  });

  it("returns empty for single lock", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/feature"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBe(0);
  });

  it("returns empty for empty locks", () => {
    const overlaps = detectScopeOverlaps({});
    expect(overlaps.length).toBe(0);
  });

  it("detects overlaps among three locks", () => {
    const locks: Record<string, ScopeLockDecl> = {
      "unit-a": makeLockFor("unit-a", ["src/shared"]),
      "unit-b": makeLockFor("unit-b", ["src/shared/components"]),
      "unit-c": makeLockFor("unit-c", ["src/other"]),
    };
    const overlaps = detectScopeOverlaps(locks);
    expect(overlaps.length).toBe(1); // unit-a ↔ unit-b overlap only
  });
});
