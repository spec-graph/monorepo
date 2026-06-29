import { describe, it, expect } from "vitest";
import { shouldRunCheck, matchesTouchfiles } from "./diff-select";

describe("diff-select: shouldRunCheck", () => {
  it("returns true when touchfiles is undefined (backward compat)", () => {
    expect(shouldRunCheck(undefined, ["src/index.ts"])).toBe(true);
  });

  it("returns true when touchfiles is empty array", () => {
    expect(shouldRunCheck([], ["src/index.ts"])).toBe(true);
  });

  it("returns true when changedFiles is empty (conservative)", () => {
    expect(shouldRunCheck(["src/**/*.ts"], [])).toBe(true);
  });

  it("returns true when a changed file matches touchfile glob", () => {
    const touchfiles = ["src/**/*.ts"];
    const changedFiles = ["src/commands/run.ts"];
    expect(shouldRunCheck(touchfiles, changedFiles)).toBe(true);
  });

  it("returns false when no changed file matches touchfile glob", () => {
    const touchfiles = ["src/**/*.ts"];
    const changedFiles = ["docs/README.md"];
    expect(shouldRunCheck(touchfiles, changedFiles)).toBe(false);
  });

  it("handles multiple touchfile patterns", () => {
    const touchfiles = ["src/**/*.ts", "packs/**/*.yaml"];
    const changedFiles = ["packs/foundation.pack/pack.yaml"];
    expect(shouldRunCheck(touchfiles, changedFiles)).toBe(true);
  });

  it("handles multiple changed files", () => {
    const touchfiles = ["src/**/*.ts"];
    const changedFiles = [
      "docs/README.md",
      "src/index.ts",
      "package.json",
    ];
    expect(shouldRunCheck(touchfiles, changedFiles)).toBe(true);
  });
});

describe("diff-select: matchesTouchfiles", () => {
  it("matches single glob pattern", () => {
    expect(matchesTouchfiles("src/index.ts", ["src/**/*.ts"])).toBe(true);
    expect(matchesTouchfiles("docs/README.md", ["src/**/*.ts"])).toBe(false);
  });

  it("matches exact path", () => {
    expect(matchesTouchfiles("src/index.ts", ["src/index.ts"])).toBe(true);
    expect(matchesTouchfiles("src/run.ts", ["src/index.ts"])).toBe(false);
  });

  it("matches nested paths with **", () => {
    expect(
      matchesTouchfiles("src/commands/run.ts", ["src/**/*.ts"]),
    ).toBe(true);
    expect(
      matchesTouchfiles("src/engine/check/index.ts", ["src/**/*.ts"]),
    ).toBe(true);
  });

  it("matches with * wildcard", () => {
    expect(matchesTouchfiles("src/index.ts", ["src/*.ts"])).toBe(true);
    expect(matchesTouchfiles("src/commands/run.ts", ["src/*.ts"])).toBe(
      false,
    ); // * doesn't match /
  });

  it("matches multiple patterns", () => {
    expect(
      matchesTouchfiles("docs/README.md", ["src/**/*.ts", "docs/**/*.md"]),
    ).toBe(true);
    expect(
      matchesTouchfiles("package.json", ["src/**/*.ts", "docs/**/*.md"]),
    ).toBe(false);
  });
});
