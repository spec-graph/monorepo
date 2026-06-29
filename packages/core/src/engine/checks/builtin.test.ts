import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsPromises from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  isBuiltinCheck,
  extractBuiltinName,
  runBuiltinCheck,
  builtinChecks,
  BuiltinCheckContext,
} from "./builtin";
import { Graph, Constitution } from "../../types/index";
import { MachineState } from "../machine/index";
import { writeYaml } from "../../utils/yaml";

async function writeConstitution(
  projectRoot: string,
  overrides: Partial<Constitution> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const c: Constitution = {
    version: "0.1.0",
    project_name: "test-project",
    effective_date: "2026-01-01",
    last_revised: now,
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
      required_traces: [],
      require_ac_test_binding: true,
      require_commit_story_ref: true,
    },
    semver: {
      major_bump_on: [],
      minor_bump_on: [],
      patch_bump_on: [],
      deprecation_grace_releases: 2,
    },
    ...overrides,
  };
  await fsPromises.mkdir(path.join(projectRoot, ".spec-graph"), {
    recursive: true,
  });
  await writeYaml(
    path.join(projectRoot, ".spec-graph", "constitution.yaml"),
    c,
  );
}

function makeCtx(
  overrides: Partial<BuiltinCheckContext> = {},
): BuiltinCheckContext {
  const graph: Graph = {
    version: "1",
    meta: {
      composed_at: "",
      profile_hash: "",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [],
    actions: [],
    checks: [
      {
        id: "clarify-scan",
        kind: "lint",
        command: "<clarify-scan>",
        layer: "unit",
        threshold: { ambiguity: 5, placeholder: 0, non_measurable: 3 },
      },
      {
        id: "story-slicing",
        kind: "lint",
        command: "<story-slicing-check>",
        layer: "unit",
        threshold: { contract_fields_present: 7 },
      },
      {
        id: "complexity-budget",
        kind: "lint",
        command: "<complexity-scan>",
        layer: "unit",
        threshold: { cyclomatic: 15 },
      },
    ],
    gates: [],
    tracks: [],
    pipeline_skeleton: { stages: ["implement", "review", "test", "accept"] },
    acceptance_layers: {},
  };
  const state: MachineState = {
    current_stage: "implement",
    stage_history: [],
    artifacts: {},
    checks: {},
    metadata: {},
  };
  return {
    projectRoot: overrides.projectRoot || "",
    graph,
    state,
    ...overrides,
  };
}

describe("builtin check registry", () => {
  it("registers all 20 checks", () => {
    expect(Object.keys(builtinChecks)).toHaveLength(20);
    expect(Object.keys(builtinChecks)).toContain("constitution-validate");
    expect(Object.keys(builtinChecks)).toContain("contract-drift-scan");
    expect(Object.keys(builtinChecks)).toContain("scope-lock-validate");
    expect(Object.keys(builtinChecks)).toContain("clone-detection");
    expect(Object.keys(builtinChecks)).toContain("reuse-scan");
    expect(Object.keys(builtinChecks)).toContain("acceptance-layer-audit");
    expect(Object.keys(builtinChecks)).toContain("shared-contract-audit");
    expect(Object.keys(builtinChecks)).toContain("command-safety-validate");
    expect(Object.keys(builtinChecks)).toContain("articles-validate");
    expect(Object.keys(builtinChecks)).toContain("bounded-context-audit");
    expect(Object.keys(builtinChecks)).toContain("aggregate-invariant-check");
    expect(Object.keys(builtinChecks)).toContain("context-map-consistency");
    expect(Object.keys(builtinChecks)).toContain("domain-event-coverage");
  });
  it("extractBuiltinName extracts name", () => {
    expect(extractBuiltinName("<clarify-scan>")).toBe("clarify-scan");
    expect(extractBuiltinName("npm test")).toBeNull();
  });
  it("isBuiltinCheck returns true for registered", () => {
    expect(isBuiltinCheck("<clarify-scan>")).toBe(true);
    expect(isBuiltinCheck("<unknown>")).toBe(false);
    expect(isBuiltinCheck("npm test")).toBe(false);
  });
  it("runBuiltinCheck returns error for unknown", async () => {
    const r = await runBuiltinCheck("nonexistent", makeCtx());
    expect(r.passed).toBe(false);
    expect(r.exit_code).toBe(127);
  });
});

describe("clarify-scan", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
  it("passes when no files", async () => {
    const r = await runBuiltinCheck(
      "clarify-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
  });
  it("detects TODO markers", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "s.md"),
      ["# Story", "TODO: impl", "TBD: decide"].join(String.fromCharCode(10)),
    );
    const r = await runBuiltinCheck(
      "clarify-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.placeholder_count).toBeGreaterThan(0);
  });
  it("passes for clean markdown", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "s.md"),
      ["# User Story", "As a developer, I want clear specs."].join(
        String.fromCharCode(10),
      ),
    );
    const r = await runBuiltinCheck(
      "clarify-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
  });
});

describe("story-slicing-check", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
  it("passes vacuously", async () => {
    const r = await runBuiltinCheck(
      "story-slicing-check",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
  });
  it("validates 7 fields", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    const story = [
      "# Story: Login",
      "As a **user**, ",
      "want to log in, ",
      String.fromCharCode(20197) +
        String.fromCharCode(20415) +
        String.fromCharCode(20110) +
        " **access**.",
      "## GIVEN: pre",
      "## WHEN: act",
      "## THEN: res",
      "## Acceptance Criteria",
      "- [ ] AC-001: ok",
    ].join(String.fromCharCode(10));
    await fsPromises.writeFile(path.join(dir, "s.md"), story);
    const r = await runBuiltinCheck(
      "story-slicing-check",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
  });
  it("fails on missing fields", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, "s.md"), "# Incomplete");
    const r = await runBuiltinCheck(
      "story-slicing-check",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
  });
});

describe("complexity-scan", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
  it("passes with no src", async () => {
    const r = await runBuiltinCheck(
      "complexity-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
  });
  it("detects complexity", async () => {
    const srcDir = path.join(tmpDir, "src");
    await fsPromises.mkdir(srcDir, { recursive: true });
    let code = "function f() {" + String.fromCharCode(10);
    for (let i = 0; i < 20; i++)
      code +=
        "  if (x === " +
        i +
        ") { return " +
        i +
        "; }" +
        String.fromCharCode(10);
    code += "}" + String.fromCharCode(10);
    await fsPromises.writeFile(path.join(srcDir, "c.ts"), code);
    const r = await runBuiltinCheck(
      "complexity-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violations.length).toBeGreaterThan(0);
  });
});

describe("schema-drift-scan", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });
  it("first run records hashes", async () => {
    const dir = path.join(tmpDir, "docs");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, "schema.yaml"), "entities:");
    const r = await runBuiltinCheck(
      "schema-drift-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.first_run).toBe(true);
  });
  it("detects drift", async () => {
    const dir = path.join(tmpDir, "docs");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, "schema.yaml"), "v1");
    const ctx = makeCtx({ projectRoot: tmpDir });
    await runBuiltinCheck("schema-drift-scan", ctx);
    await fsPromises.writeFile(path.join(dir, "schema.yaml"), "v2");
    const r = await runBuiltinCheck("schema-drift-scan", ctx);
    expect(r.passed).toBe(false);
    expect(r.details.drifted.length).toBeGreaterThan(0);
  });
});

describe("constitution-validate", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("fails when no constitution exists", async () => {
    const r = await runBuiltinCheck(
      "constitution-validate",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.present).toBe(false);
  });
  it("passes for a valid constitution", async () => {
    await writeConstitution(tmpDir);
    const r = await runBuiltinCheck(
      "constitution-validate",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.present).toBe(true);
  });
  it("fails when constitution schema is invalid", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: { cyclomatic_complexity: 0 },
        required_linters: ["lint"],
        require_review_approvers: 1,
      } as any,
    });
    const r = await runBuiltinCheck(
      "constitution-validate",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.errors.length).toBeGreaterThan(0);
  });
});

describe("constitution overrides pack thresholds", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("complexity-scan uses constitution cyclomatic threshold over pack", async () => {
    // Pack declares cyclomatic: 15. Constitution tightens to 3 → mild code now fails.
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: { cyclomatic_complexity: 3 },
        required_linters: ["lint"],
        require_review_approvers: 1,
      } as any,
    });
    const srcDir = path.join(tmpDir, "src");
    await fsPromises.mkdir(srcDir, { recursive: true });
    let code = "function f() {" + String.fromCharCode(10);
    for (let i = 0; i < 6; i++)
      code +=
        "  if (x === " +
        i +
        ") { return " +
        i +
        "; }" +
        String.fromCharCode(10);
    code += "}" + String.fromCharCode(10);
    await fsPromises.writeFile(path.join(srcDir, "c.ts"), code);
    const r = await runBuiltinCheck(
      "complexity-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.threshold).toBe(3);
  });

  it("clarify-scan uses constitution ambiguity threshold over pack", async () => {
    // Pack declares ambiguity: 5. Constitution tightens to 0 → any ambiguity fails.
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {
          ambiguity_score: 0,
          placeholder_count: 0,
          non_measurable_count: 0,
        },
        required_linters: ["lint"],
        require_review_approvers: 1,
      } as any,
    });
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "s.md"),
      ["# Story", "It should probably be fast and easy."].join(
        String.fromCharCode(10),
      ),
    );
    const r = await runBuiltinCheck(
      "clarify-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(false);
  });
});

describe("scope-lock-validate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builtin-scope-"));
  });

  it("passes vacuously when no scope locks exist", async () => {
    const r = await runBuiltinCheck(
      "scope-lock-validate",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.locks_checked).toBe(0);
  });

  it("passes when a scope lock exists but no files violate it", async () => {
    const isoDir = path.join(tmpDir, ".spec-graph/isolation");
    await fsPromises.mkdir(isoDir, { recursive: true });
    await writeYaml(path.join(isoDir, "scope-story-1.yaml"), {
      unit_id: "story-1",
      allowed_paths: ["src/fe/**"],
      protected_paths: [],
      forbidden_paths: [],
      enforcement_mode: "strict",
      locked_at: new Date().toISOString(),
      locked_by: "test",
    });

    const r = await runBuiltinCheck(
      "scope-lock-validate",
      makeCtx({ projectRoot: tmpDir }),
    );
    // No git repo → no changed files → passes
    expect(r.passed).toBe(true);
    expect(r.details.locks_checked).toBe(1);
  });
});

describe("clone-detection", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builtin-clone-"));
  });

  function ctxWithCloneCheck(
    overrides: Partial<Graph> = {},
  ): BuiltinCheckContext {
    const graph = makeCtx().graph;
    (graph.checks as any).push({
      id: "clone-detection",
      kind: "clone",
      command: "<clone-detection>",
      layer: "unit",
      threshold: { dup_ratio_max: 0.1 },
    });
    return makeCtx({ projectRoot: tmpDir, graph: { ...graph, ...overrides } });
  }

  it("passes with no source files", async () => {
    const r = await runBuiltinCheck("clone-detection", ctxWithCloneCheck());
    expect(r.passed).toBe(true);
    expect(r.details.functions).toBe(0);
  });

  it("detects duplicate function bodies", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    const fn1 = [
      "export function processItem(item) {",
      "  if (!item) return null;",
      "  const result = transform(item);",
      "  return result;",
      "}",
    ].join("\n");
    const fn2 = [
      "export function processOther(other) {",
      "  if (!other) return null;",
      "  const result = transform(other);",
      "  return result;",
      "}",
    ].join("\n");
    await fsPromises.writeFile(path.join(tmpDir, "src/a.ts"), fn1);
    await fsPromises.writeFile(path.join(tmpDir, "src/b.ts"), fn2);

    const r = await runBuiltinCheck("clone-detection", ctxWithCloneCheck());

    expect(r.details.clone_groups).toBeGreaterThan(0);
    expect(r.details.cloned_functions).toBe(2);
  });

  it("does not flag distinct functions as clones", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      "export function add(a, b) { return a + b; }",
    );
    await fsPromises.writeFile(
      path.join(tmpDir, "src/b.ts"),
      'export function greet(name) { console.log("hello " + name); }',
    );

    const r = await runBuiltinCheck("clone-detection", ctxWithCloneCheck());

    expect(r.details.clone_groups).toBe(0);
    expect(r.passed).toBe(true);
  });

  it("blocks when clone ratio exceeds threshold", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    // 4 functions, 2 pairs of clones → ratio 1.0 (4/4 cloned)
    const dup = "export function f(x) { return x + 1; }";
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      `${dup}\nexport function g(x) { return x + 1; }`,
    );
    await fsPromises.writeFile(
      path.join(tmpDir, "src/b.ts"),
      `${dup}\nexport function h(x) { return x + 1; }`,
    );

    const r = await runBuiltinCheck("clone-detection", ctxWithCloneCheck());
    expect(r.passed).toBe(false);
    expect(r.details.ratio).toBeGreaterThan(0.1);
  });

  it("respects custom threshold from graph", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    const dup = "export function f(x) { return x + 1; }";
    await fsPromises.writeFile(path.join(tmpDir, "src/a.ts"), dup);
    await fsPromises.writeFile(path.join(tmpDir, "src/b.ts"), dup);

    // Threshold 0.0 → any clone fails
    const graph = makeCtx().graph;
    (graph.checks as any).push({
      id: "clone-detection",
      kind: "clone",
      command: "<clone-detection>",
      layer: "unit",
      threshold: { dup_ratio_max: 0.0 },
    });
    const ctx = makeCtx({ projectRoot: tmpDir, graph });

    const r = await runBuiltinCheck("clone-detection", ctx);
    expect(r.passed).toBe(false);
  });
});

describe("reuse-scan", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "builtin-reuse-"));
  });

  it("passes with no source files", async () => {
    const r = await runBuiltinCheck(
      "reuse-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.exported_symbols).toBe(0);
  });

  it("always passes (informational)", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      "export function util() { return 42; }",
    );

    const r = await runBuiltinCheck(
      "reuse-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.exported_symbols).toBe(1);
  });

  it("counts exported symbols", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      "export function foo() { return 1; }\nexport const bar = 2;\nexport class Baz {}",
    );

    const r = await runBuiltinCheck(
      "reuse-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.details.exported_symbols).toBe(3);
  });

  it("reports orphan symbols when no trace satisfies edges exist", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      "export function orphanFn() { return 1; }",
    );

    const r = await runBuiltinCheck(
      "reuse-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.details.orphans).toBe(1);
    expect(r.details.satisfies_edges).toBe(0);
  });

  it("counts contract registry entries", async () => {
    await fsPromises.mkdir(path.join(tmpDir, "src"));
    await fsPromises.writeFile(
      path.join(tmpDir, "src/a.ts"),
      "export function f() { return 1; }",
    );
    await fsPromises.mkdir(path.join(tmpDir, ".spec-graph/contracts"), {
      recursive: true,
    });
    await writeYaml(
      path.join(tmpDir, ".spec-graph/contracts/contract_test.yaml"),
      {
        contract_id: "contract/test",
        producer: "be",
        current_version: "1.0.0",
        versions: [],
        consumers: [],
      },
    );

    const r = await runBuiltinCheck(
      "reuse-scan",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.details.contracts).toBe(1);
  });
});

describe("acceptance-layer-audit", () => {
  function ctxWithLayers(layers: any): BuiltinCheckContext {
    const graph = makeCtx().graph;
    (graph as any).acceptance_layers = layers;
    return makeCtx({ graph });
  }

  it("passes when all required layers have checks", async () => {
    const r = await runBuiltinCheck(
      "acceptance-layer-audit",
      ctxWithLayers({
        unit: { required: true, checks: ["lint", "unit-test"] },
        integration: { required: true, checks: ["contract-drift-scan"] },
        system: { required: false, checks: [] },
        deployment: { required: false, checks: [] },
      }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.layers.find((l: any) => l.layer === "unit")?.status).toBe(
      "ok",
    );
  });

  it("warns when a required layer has no checks", async () => {
    const r = await runBuiltinCheck(
      "acceptance-layer-audit",
      ctxWithLayers({
        unit: { required: true, checks: ["lint"] },
        integration: { required: true, checks: [] }, // required but empty
        system: { required: false, checks: [] },
        deployment: { required: false, checks: [] },
      }),
    );
    expect(r.passed).toBe(true); // always passes — informational
    expect(r.details.warnings.length).toBeGreaterThan(0);
    expect(
      r.details.warnings.some((w: string) => w.includes("integration")),
    ).toBe(true);
  });

  it("reports undeclared layers as undeclared status", async () => {
    const r = await runBuiltinCheck(
      "acceptance-layer-audit",
      ctxWithLayers({
        unit: { required: true, checks: ["lint"] },
        integration: { required: false, checks: [] },
        system: { required: false, checks: [] },
        deployment: { required: false, checks: [] },
      }),
    );
    // All 4 expected layers should be reported
    expect(r.details.layers.length).toBe(4);
  });

  it("always passes (informational only)", async () => {
    const r = await runBuiltinCheck(
      "acceptance-layer-audit",
      ctxWithLayers({}),
    );
    expect(r.passed).toBe(true);
  });
});

describe("shared-contract-audit", () => {
  function ctxWithTracks(tracks: any[]): BuiltinCheckContext {
    const graph = makeCtx().graph;
    (graph as any).tracks = tracks;
    return makeCtx({ graph });
  }

  it("passes vacuously when no tracks exist", async () => {
    const r = await runBuiltinCheck("shared-contract-audit", ctxWithTracks([]));
    expect(r.passed).toBe(true);
    expect(r.details.opportunity_count).toBe(0);
  });

  it("does not flag contracts produced by some track", async () => {
    const r = await runBuiltinCheck(
      "shared-contract-audit",
      ctxWithTracks([
        { id: "be", produces: ["contract/api"], consumes: [] },
        { id: "fe", produces: [], consumes: ["contract/api"] },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.opportunity_count).toBe(0);
  });

  it("does not flag contracts consumed by only one track", async () => {
    const r = await runBuiltinCheck(
      "shared-contract-audit",
      ctxWithTracks([
        { id: "a", produces: [], consumes: ["contract/shared"] },
        { id: "b", produces: [], consumes: [] },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.opportunity_count).toBe(0);
  });

  it("flags contracts consumed by ≥2 tracks but produced by none", async () => {
    const r = await runBuiltinCheck(
      "shared-contract-audit",
      ctxWithTracks([
        { id: "fe", produces: [], consumes: ["contract/shared"] },
        { id: "mobile", produces: [], consumes: ["contract/shared"] },
      ]),
    );
    expect(r.passed).toBe(true); // always passes — informational
    expect(r.details.opportunity_count).toBe(1);
    expect(
      r.details.suggestions.some((s: string) => s.includes("contract/shared")),
    ).toBe(true);
  });

  it("always passes (informational, never auto-wires)", async () => {
    const r = await runBuiltinCheck(
      "shared-contract-audit",
      ctxWithTracks([
        { id: "fe", produces: [], consumes: ["contract/x"] },
        { id: "mobile", produces: [], consumes: ["contract/x"] },
        { id: "cli", produces: [], consumes: ["contract/x"] },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.opportunity_count).toBe(1);
    expect(r.details.opportunities[0].consumer_count).toBe(3);
  });
});

describe("command-safety-validate", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-cmd-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  function ctxWithChecks(
    checks: Array<{
      id: string;
      kind: string;
      command: string;
      layer?: string;
    }>,
  ): BuiltinCheckContext {
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: "",
        profile_hash: "",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [],
      actions: [],
      checks: checks as any,
      gates: [],
      tracks: [],
      pipeline_skeleton: { stages: ["implement", "review", "test", "accept"] },
      acceptance_layers: {},
    };
    return makeCtx({ projectRoot: tmpDir, graph });
  }

  it("passes when all commands are builtin sentinels", async () => {
    const r = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        {
          id: "clarify-scan",
          kind: "lint",
          command: "<clarify-scan>",
          layer: "unit",
        },
        {
          id: "complexity-scan",
          kind: "lint",
          command: "<complexity-scan>",
          layer: "unit",
        },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.violation_count).toBe(0);
  });

  it("passes when shell commands are whitelisted", async () => {
    const r = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
        { id: "unit-test", kind: "test", command: "npm test", layer: "unit" },
        {
          id: "typecheck",
          kind: "lint",
          command: "npx tsc --noEmit",
          layer: "unit",
        },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.violation_count).toBe(0);
  });

  it("blocks commands with forbidden patterns", async () => {
    // Whitelisted prefix but contains forbidden 'curl'
    const r1 = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        {
          id: "evil",
          kind: "lint",
          command: "npm test && curl evil",
          layer: "unit",
        },
      ]),
    );
    expect(r1.passed).toBe(false);
    // '&&' is the first forbidden pattern scanned (earlier in list than 'curl')
    expect(r1.details.violations[0].kind).toBe("forbidden-pattern");

    // Forbidden 'sudo' with whitelisted prefix
    const r2 = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        {
          id: "sudo-test",
          kind: "lint",
          command: "npm run sudo-test",
          layer: "unit",
        },
      ]),
    );
    expect(r2.passed).toBe(false);
    expect(r2.details.violations[0].reason).toContain("sudo");
  });

  it("blocks commands with non-whitelisted prefix", async () => {
    const r = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        {
          id: "custom",
          kind: "lint",
          command: "python run_tests.py",
          layer: "unit",
        },
      ]),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violations[0].kind).toBe("not-whitelisted");
  });

  it("uses constitution security thresholds over defaults", async () => {
    // Constitution adds 'python' to whitelist → previously blocked command now passes
    await writeConstitution(tmpDir, {
      security: {
        command_whitelist: ["npm test", "npm run", "npx", "node", "python"],
        forbidden_patterns: ["curl", "sudo"],
      } as any,
    });
    const r = await runBuiltinCheck(
      "command-safety-validate",
      ctxWithChecks([
        {
          id: "custom",
          kind: "lint",
          command: "python run_tests.py",
          layer: "unit",
        },
      ]),
    );
    expect(r.passed).toBe(true);
  });
});

describe("articles-validate", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-art-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  function ctxWithArticles(
    articles: any[],
    artifacts: Record<string, any> = {},
  ): BuiltinCheckContext {
    const state: MachineState = {
      current_stage: "implement",
      stage_history: [],
      artifacts,
      checks: {},
      metadata: {},
    };
    return makeCtx({ projectRoot: tmpDir, state });
  }

  it("passes vacuously when no articles declared", async () => {
    // No constitution at all → no articles → vacuous pass
    const r = await runBuiltinCheck("articles-validate", ctxWithArticles([]));
    expect(r.passed).toBe(true);
    expect(r.details.articles_checked).toBe(0);
  });

  it("passes vacuously when constitution has no articles section", async () => {
    await writeConstitution(tmpDir); // default constitution has no articles
    const r = await runBuiltinCheck("articles-validate", ctxWithArticles([]));
    expect(r.passed).toBe(true);
  });

  it("required_section passes when section exists in completed artifact", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-has-ac",
            description: "Story must have AC",
            rule: {
              type: "required_section",
              artifact_kind: "plan/story",
              section: "Acceptance Criteria",
            },
          },
        ],
      } as any,
    });
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "story.md"),
      "# Story\n\n## Acceptance Criteria\n- [ ] AC-001",
    );

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-has-ac" }], {
        "plan/story": { id: "plan/story", status: "completed" },
      }),
    );
    expect(r.passed).toBe(true);
  });

  it("required_section fails when section missing in completed artifact", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-has-ac",
            description: "Story must have AC",
            rule: {
              type: "required_section",
              artifact_kind: "plan/story",
              section: "Acceptance Criteria",
            },
          },
        ],
      } as any,
    });
    const dir = path.join(tmpDir, ".spec-graph/artifacts/plan");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "story.md"),
      "# Story\n\nNo AC here.",
    );

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-has-ac" }], {
        "plan/story": { id: "plan/story", status: "completed" },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violations[0].article_id).toBe("story-has-ac");
    expect(r.details.violations[0].detail).toContain("Acceptance Criteria");
  });

  it("skips pending artifacts (only validates completed)", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-has-ac",
            description: "Story must have AC",
            rule: {
              type: "required_section",
              artifact_kind: "plan/story",
              section: "Acceptance Criteria",
            },
          },
        ],
      } as any,
    });
    // No artifact file written, and artifact is pending → skip
    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-has-ac" }], {
        "plan/story": { id: "plan/story", status: "pending" },
      }),
    );
    expect(r.passed).toBe(true);
  });

  it("min_length fails when file is too short", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "prd-substantive",
            description: "PRD must be substantive",
            rule: {
              type: "min_length",
              artifact_kind: "requirement/prd",
              min_chars: 100,
            },
          },
        ],
      } as any,
    });
    const dir = path.join(tmpDir, ".spec-graph/artifacts/requirement");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, "prd.md"), "# PRD\nToo short.");

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "prd-substantive" }], {
        "requirement/prd": { id: "requirement/prd", status: "completed" },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violations[0].detail).toContain("chars");
  });

  it("min_length passes when file meets minimum", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "prd-substantive",
            description: "PRD must be substantive",
            rule: {
              type: "min_length",
              artifact_kind: "requirement/prd",
              min_chars: 10,
            },
          },
        ],
      } as any,
    });
    const dir = path.join(tmpDir, ".spec-graph/artifacts/requirement");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "prd.md"),
      "# PRD\nThis is long enough content for the test.",
    );

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "prd-substantive" }], {
        "requirement/prd": { id: "requirement/prd", status: "completed" },
      }),
    );
    expect(r.passed).toBe(true);
  });

  it("co_completed fails when from is done but to is not", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-implies-test",
            description: "Stories require test reports",
            rule: {
              type: "co_completed",
              from_kind: "plan/story",
              to_kind: "verification/test-report",
            },
          },
        ],
      } as any,
    });

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-implies-test" }], {
        "plan/story": { id: "plan/story", status: "completed" },
        "verification/test-report": {
          id: "verification/test-report",
          status: "pending",
        },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violations[0].detail).toContain("plan/story");
    expect(r.details.violations[0].detail).toContain(
      "verification/test-report",
    );
  });

  it("co_completed passes when both from and to are completed", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-implies-test",
            description: "Stories require test reports",
            rule: {
              type: "co_completed",
              from_kind: "plan/story",
              to_kind: "verification/test-report",
            },
          },
        ],
      } as any,
    });

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-implies-test" }], {
        "plan/story": { id: "plan/story", status: "completed" },
        "verification/test-report": {
          id: "verification/test-report",
          status: "completed",
        },
      }),
    );
    expect(r.passed).toBe(true);
  });

  it("co_completed passes when from is not completed (skip)", async () => {
    await writeConstitution(tmpDir, {
      quality: {
        thresholds: {},
        required_linters: ["lint"],
        require_review_approvers: 1,
        articles: [
          {
            id: "story-implies-test",
            description: "Stories require test reports",
            rule: {
              type: "co_completed",
              from_kind: "plan/story",
              to_kind: "verification/test-report",
            },
          },
        ],
      } as any,
    });

    const r = await runBuiltinCheck(
      "articles-validate",
      ctxWithArticles([{ id: "story-implies-test" }], {
        "plan/story": { id: "plan/story", status: "pending" },
        "verification/test-report": {
          id: "verification/test-report",
          status: "pending",
        },
      }),
    );
    expect(r.passed).toBe(true);
  });
});

describe("bounded-context-audit", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-bca-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  function ctxWithTracks(tracks: any[]): BuiltinCheckContext {
    const graph = makeCtx().graph;
    (graph as any).tracks = tracks;
    return makeCtx({ projectRoot: tmpDir, graph });
  }

  it("passes vacuously with fewer than 2 tracks", async () => {
    const r = await runBuiltinCheck(
      "bounded-context-audit",
      ctxWithTracks([{ id: "be", scope: "backend" }]),
    );
    expect(r.passed).toBe(true);
  });

  it("passes when no cross-boundary imports exist", async () => {
    const beDir = path.join(tmpDir, "src/backend");
    const feDir = path.join(tmpDir, "src/frontend");
    await fsPromises.mkdir(beDir, { recursive: true });
    await fsPromises.mkdir(feDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(beDir, "service.ts"),
      "import { x } from './utils';",
    );
    await fsPromises.writeFile(
      path.join(feDir, "app.ts"),
      "import { y } from './components';",
    );

    const r = await runBuiltinCheck(
      "bounded-context-audit",
      ctxWithTracks([
        { id: "be", scope: "backend", produces: [], consumes: [] },
        { id: "fe", scope: "frontend", produces: [], consumes: [] },
      ]),
    );
    expect(r.passed).toBe(true);
    expect(r.details.violation_count).toBe(0);
  });

  it("detects cross-boundary imports", async () => {
    const beDir = path.join(tmpDir, "src/backend");
    const feDir = path.join(tmpDir, "src/frontend");
    await fsPromises.mkdir(beDir, { recursive: true });
    await fsPromises.mkdir(feDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(beDir, "service.ts"),
      "import { Button } from '../frontend/components';",
    );

    const r = await runBuiltinCheck(
      "bounded-context-audit",
      ctxWithTracks([
        { id: "be", scope: "backend", produces: [], consumes: [] },
        { id: "fe", scope: "frontend", produces: [], consumes: [] },
      ]),
    );
    expect(r.passed).toBe(false);
    expect(r.details.violation_count).toBe(1);
    expect(r.details.violations[0].from_scope).toBe("backend");
    expect(r.details.violations[0].to_scope).toBe("frontend");
  });
});

describe("aggregate-invariant-check", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-agg-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips when artifact is not completed", async () => {
    const r = await runBuiltinCheck(
      "aggregate-invariant-check",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
  });

  it("passes when all aggregates have invariants", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/design");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "aggregates.md"),
      [
        "## 聚合: Order",
        "",
        "### 不变量",
        "1. INV-001: 订单金额必须大于0",
        "",
        "## 聚合: Customer",
        "",
        "### Invariant",
        "1. INV-001: 客户邮箱不能为空",
      ].join("\n"),
    );

    const state: MachineState = {
      current_stage: "design",
      stage_history: [],
      artifacts: {
        "design/aggregates": { id: "design/aggregates", status: "completed" },
      },
      checks: {},
      metadata: {},
    };
    const r = await runBuiltinCheck(
      "aggregate-invariant-check",
      makeCtx({ projectRoot: tmpDir, state }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.aggregates_found).toBe(2);
  });

  it("fails when an aggregate has no invariants", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/design");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "aggregates.md"),
      [
        "## 聚合: Order",
        "",
        "聚合根: OrderAggregate",
        "",
        "## 聚合: Customer",
        "",
        "### 不变量",
        "1. INV-001: 客户邮箱不能为空",
      ].join("\n"),
    );

    const state: MachineState = {
      current_stage: "design",
      stage_history: [],
      artifacts: {
        "design/aggregates": { id: "design/aggregates", status: "completed" },
      },
      checks: {},
      metadata: {},
    };
    const r = await runBuiltinCheck(
      "aggregate-invariant-check",
      makeCtx({ projectRoot: tmpDir, state }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.aggregates_without_invariants).toBe(1);
  });
});

describe("context-map-consistency", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-cmc-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips when artifact is not completed", async () => {
    const r = await runBuiltinCheck(
      "context-map-consistency",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
  });

  it("always passes (informational)", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/design");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "context-map.md"),
      [
        "# Context Map",
        "| 上游 | 下游 | 关系类型 | 契约 |",
        "|------|------|---------|------|",
        "| be | fe | ACL | contract/openapi |",
      ].join("\n"),
    );

    const state: MachineState = {
      current_stage: "design",
      stage_history: [],
      artifacts: {
        "design/context-map": { id: "design/context-map", status: "completed" },
      },
      checks: {},
      metadata: {},
    };
    const r = await runBuiltinCheck(
      "context-map-consistency",
      makeCtx({ projectRoot: tmpDir, state }),
    );
    expect(r.passed).toBe(true);
  });
});

describe("domain-event-coverage", () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "sg-dec-"));
  });
  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips when artifact is not completed", async () => {
    const r = await runBuiltinCheck(
      "domain-event-coverage",
      makeCtx({ projectRoot: tmpDir }),
    );
    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
  });

  it("passes when all declared events have implementations", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/design");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "domain-events.md"),
      [
        "# Domain Events",
        "| Event | Context |",
        "|-------|---------|",
        "| OrderCreatedEvent | order |",
      ].join("\n"),
    );

    const srcDir = path.join(tmpDir, "src");
    await fsPromises.mkdir(srcDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(srcDir, "events.ts"),
      "export class OrderCreatedEvent {}",
    );

    const state: MachineState = {
      current_stage: "design",
      stage_history: [],
      artifacts: {
        "design/domain-events": {
          id: "design/domain-events",
          status: "completed",
        },
      },
      checks: {},
      metadata: {},
    };
    const r = await runBuiltinCheck(
      "domain-event-coverage",
      makeCtx({ projectRoot: tmpDir, state }),
    );
    expect(r.passed).toBe(true);
  });

  it("fails when declared event has no implementation", async () => {
    const dir = path.join(tmpDir, ".spec-graph/artifacts/design");
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "domain-events.md"),
      [
        "# Domain Events",
        "| Event | Context |",
        "|-------|---------|",
        "| OrderShippedEvent | order |",
      ].join("\n"),
    );

    const srcDir = path.join(tmpDir, "src");
    await fsPromises.mkdir(srcDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(srcDir, "events.ts"),
      "// no events here",
    );

    const state: MachineState = {
      current_stage: "design",
      stage_history: [],
      artifacts: {
        "design/domain-events": {
          id: "design/domain-events",
          status: "completed",
        },
      },
      checks: {},
      metadata: {},
    };
    const r = await runBuiltinCheck(
      "domain-event-coverage",
      makeCtx({ projectRoot: tmpDir, state }),
    );
    expect(r.passed).toBe(false);
    expect(r.details.unimplemented).toContain("OrderShippedEvent");
  });
});
