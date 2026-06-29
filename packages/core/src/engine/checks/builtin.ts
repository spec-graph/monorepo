/**
 * Built-in Check Implementations
 *
 * Replaces <placeholder> commands in graph.yaml with real,
 * deterministic checks operating on project files and spec-graph state.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";
import { tryReadYaml } from "../../utils/yaml";
import { loadConstitution } from "../../commands/constitution";
import { validateScopeLock } from "../isolation/scope-lock";
import { buildTraceIndex } from "../trace/index";

// -- Interface --

export interface BuiltinCheckContext {
  projectRoot: string;
  graph: Graph;
  state: MachineState;
}

export interface BuiltinCheckResult {
  passed: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  details?: Record<string, any>;
}

export type BuiltinCheckFn = (
  ctx: BuiltinCheckContext,
) => Promise<BuiltinCheckResult>;

// -- Registry --

export const builtinChecks: Record<string, BuiltinCheckFn> = {
  "clarify-scan": runClarifyScan,
  "story-slicing-check": runStorySlicing,
  "ac-test-binding-check": runAcTestBinding,
  "architecture-review": runArchitectureReview,
  "data-model-validate": runDataModelValidate,
  "schema-drift-scan": runSchemaDrift,
  "complexity-scan": runComplexityScan,
  "constitution-validate": runConstitutionValidate,
  "contract-drift-scan": runContractDriftScan,
  "scope-lock-validate": runScopeLockValidate,
  "clone-detection": runCloneDetection,
  "reuse-scan": runReuseScan,
  "acceptance-layer-audit": runAcceptanceLayerAudit,
  "shared-contract-audit": runSharedContractAudit,
  "command-safety-validate": runCommandSafetyValidate,
  "articles-validate": runArticlesValidate,
  "bounded-context-audit": runBoundedContextAudit,
  "aggregate-invariant-check": runAggregateInvariantCheck,
  "context-map-consistency": runContextMapConsistency,
  "domain-event-coverage": runDomainEventCoverage,
};

export function isBuiltinCheck(command: string): boolean {
  const name = extractBuiltinName(command);
  return name !== null && name in builtinChecks;
}

export function extractBuiltinName(command: string): string | null {
  const match = command.trim().match(/^<([^>]+)>$/);
  return match ? match[1] : null;
}

export async function runBuiltinCheck(
  name: string,
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const fn = builtinChecks[name];
  if (!fn) {
    return {
      passed: false,
      exit_code: 127,
      stdout: "",
      stderr: `Unknown builtin: ${name}`,
    };
  }
  return fn(ctx);
}

// -- Helpers --

async function walkDir(
  dir: string,
  cb: (fp: string) => Promise<void>,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      await walkDir(fp, cb);
    } else if (e.isFile()) {
      await cb(fp);
    }
  }
}

async function readUtf(fp: string): Promise<string> {
  return fs.readFile(fp, "utf-8");
}
function rel(root: string, fp: string): string {
  return path.relative(root, fp);
}

// -- clarify-scan --

const PATTERNS = [
  { re: /\bTODO\b/gi, w: 3, cat: "placeholder" },
  { re: /\bTBD\b/gi, w: 3, cat: "placeholder" },
  { re: /\bFIXME\b/gi, w: 3, cat: "placeholder" },
  { re: /\bXXX\b/g, w: 2, cat: "placeholder" },
  { re: /\bPLACEHOLDER\b/gi, w: 3, cat: "placeholder" },
  { re: /\{\{[^}]+\}\}/g, w: 2, cat: "placeholder" },
  {
    re: /\b(soon|later|maybe|someday|eventually|approximately)\b/gi,
    w: 1,
    cat: "vague",
  },
  {
    re: /\b(user-friendly|intuitive|seamless|robust|fast|good|nice)\b/gi,
    w: 1,
    cat: "non-measurable",
  },
];

const PLACEHOLDER_CATS = new Set(["placeholder"]);

async function runClarifyScan(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const roots = [
    path.join(ctx.projectRoot, ".spec-graph/artifacts"),
    path.join(ctx.projectRoot, "_wdf_output"),
  ];
  const files: string[] = [];
  for (const r of roots) {
    await walkDir(r, async (fp) => {
      if (fp.endsWith(".md")) files.push(fp);
    });
  }

  const issues: Array<{
    file: string;
    line: number;
    cat: string;
    text: string;
  }> = [];
  let totalAmbiguity = 0,
    placeholders = 0,
    nonMeasurable = 0;

  for (const fp of files) {
    const content = await readUtf(fp);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const { re, w, cat } of PATTERNS) {
        const r = new RegExp(re.source, re.flags);
        let m: RegExpExecArray | null;
        while ((m = r.exec(lines[i])) !== null) {
          issues.push({
            file: rel(ctx.projectRoot, fp),
            line: i + 1,
            cat,
            text: m[0],
          });
          totalAmbiguity += w;
          if (PLACEHOLDER_CATS.has(cat)) placeholders++;
          if (cat === "non-measurable") nonMeasurable++;
        }
      }
    }
  }

  const th = (ctx.graph.checks.find((c) => c.id === "clarify-scan") as any)
    ?.threshold;
  const constitution = await loadConstitution(ctx.projectRoot);
  const constT = constitution?.quality.thresholds;
  const maxA = constT?.ambiguity_score ?? th?.ambiguity ?? 0;
  const maxP = constT?.placeholder_count ?? th?.placeholder ?? 0;
  const maxNM = constT?.non_measurable_count ?? th?.non_measurable ?? 0;
  const passed =
    totalAmbiguity <= maxA && placeholders <= maxP && nonMeasurable <= maxNM;

  const out = [
    `clarify-scan: scanned ${files.length} file(s)`,
    `  ambiguity: ${totalAmbiguity.toFixed(1)} (max ${maxA})`,
    `  placeholders: ${placeholders} (max ${maxP})`,
    `  non-measurable: ${nonMeasurable} (max ${maxNM})`,
  ];
  if (!passed && issues.length > 0) {
    out.push("Issues:");
    for (const iss of issues.slice(0, 20))
      out.push(`  ${iss.file}:${iss.line} [${iss.cat}] "${iss.text}"`);
    if (issues.length > 20) out.push(`  ... +${issues.length - 20} more`);
  }

  return {
    passed,
    exit_code: passed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      files_scanned: files.length,
      total_issues: issues.length,
      ambiguity_score: totalAmbiguity,
      placeholder_count: placeholders,
      non_measurable_count: nonMeasurable,
    },
  };
}

// -- story-slicing-check --

const SEVEN_FIELDS = [
  { name: "actor", re: /(?:作为|as an?)\s+\*?\*?[^*\n]+/i },
  { name: "want", re: /(?:想要|want to|i want to)\s+.+/i },
  { name: "benefit", re: /(?:以便于|so that|in order to)\s+.+/i },
  { name: "given", re: /(?:前置条件|GIVEN|precondition)/i },
  { name: "when", re: /(?:用户动作|WHEN|user action)/i },
  { name: "then", re: /(?:预期结果|THEN|expected result)/i },
  {
    name: "acceptance_criteria",
    re: /(?:验收标准|Acceptance Criteria|AC-\d)/i,
  },
];

async function runStorySlicing(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const storyFiles: string[] = [];
  for (const root of [
    path.join(ctx.projectRoot, ".spec-graph/artifacts/plan"),
    path.join(ctx.projectRoot, "_wdf_output/stories"),
  ]) {
    try {
      const entries = await fs.readdir(root);
      storyFiles.push(
        ...entries
          .filter((e) => e.endsWith(".md"))
          .map((e) => path.join(root, e)),
      );
    } catch {}
  }

  if (storyFiles.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout: "story-slicing: no story files, passing vacuously",
      stderr: "",
      details: { stories_checked: 0 },
    };
  }

  const th = (ctx.graph.checks.find((c) => c.id === "story-slicing") as any)
    ?.threshold;
  const minFields = th?.contract_fields_present ?? 7;
  const results: Array<{ file: string; found: number; missing: string[] }> = [];
  let allPassed = true;

  for (const fp of storyFiles) {
    const content = await readUtf(fp);
    const found: string[] = [],
      missing: string[] = [];
    for (const f of SEVEN_FIELDS) {
      if (f.re.test(content)) found.push(f.name);
      else missing.push(f.name);
    }
    results.push({
      file: rel(ctx.projectRoot, fp),
      found: found.length,
      missing,
    });
    if (found.length < minFields) allPassed = false;
  }

  const out = [
    `story-slicing: checked ${storyFiles.length} file(s), min: ${minFields}/7`,
  ];
  for (const r of results) {
    out.push(`  ${r.found >= minFields ? "✓" : "✗"} ${r.file}: ${r.found}/7`);
    if (r.missing.length > 0) out.push(`    missing: ${r.missing.join(", ")}`);
  }

  return {
    passed: allPassed,
    exit_code: allPassed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { stories_checked: storyFiles.length, results },
  };
}

// -- ac-test-binding-check --

async function runAcTestBinding(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const storyFiles: string[] = [];
  for (const root of [
    path.join(ctx.projectRoot, ".spec-graph/artifacts/plan"),
    path.join(ctx.projectRoot, "_wdf_output/stories"),
  ]) {
    try {
      const entries = await fs.readdir(root);
      storyFiles.push(
        ...entries
          .filter((e) => e.endsWith(".md"))
          .map((e) => path.join(root, e)),
      );
    } catch {}
  }
  if (storyFiles.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout: "ac-test-binding: no story files, passing vacuously",
      stderr: "",
      details: { stories_checked: 0 },
    };
  }

  let allPassed = true;
  const results: Array<{ file: string; ac: number; bound: number }> = [];
  for (const fp of storyFiles) {
    const content = await readUtf(fp);
    const acItems = (content.match(/-\s*\[[ xX]?\]\s*AC-\d+/g) || []).length;
    const bindings = (content.match(/AC-\d+\s*\|\s*\S+\s*\|\s*\S+/g) || [])
      .length;
    const hasSection = /测试绑定|Test-Binding|Test Binding/i.test(content);
    if (acItems > 0 && bindings < acItems && !hasSection) allPassed = false;
    results.push({
      file: rel(ctx.projectRoot, fp),
      ac: acItems,
      bound: bindings,
    });
  }

  const out = [`ac-test-binding: checked ${storyFiles.length} file(s)`];
  for (const r of results) {
    if (r.ac === 0) out.push(`  ~ ${r.file}: no ACs`);
    else
      out.push(
        `  ${r.bound >= r.ac ? "✓" : "✗"} ${r.file}: ${r.bound}/${r.ac} bound`,
      );
  }
  return {
    passed: allPassed,
    exit_code: allPassed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { stories_checked: storyFiles.length, results },
  };
}

// -- architecture-review --

async function runArchitectureReview(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const archFiles: string[] = [];
  for (const root of [
    path.join(ctx.projectRoot, ".spec-graph/artifacts/design"),
    path.join(ctx.projectRoot, "_wdf_output/architecture"),
    path.join(ctx.projectRoot, "docs"),
  ]) {
    await walkDir(root, async (fp) => {
      const n = path.basename(fp).toLowerCase();
      if ((n.includes("c4") || n.includes("arch")) && fp.endsWith(".md"))
        archFiles.push(fp);
    });
  }

  if (archFiles.length === 0) {
    const a = ctx.state.artifacts["design/c4"];
    if (a?.status === "completed")
      return {
        passed: true,
        exit_code: 0,
        stdout: "architecture-review: design/c4 completed (no file)",
        stderr: "",
        details: { files_found: 0 },
      };
    return {
      passed: false,
      exit_code: 1,
      stdout: "architecture-review: no architecture files found",
      stderr: "",
      details: { files_found: 0 },
    };
  }

  const required = [
    { name: "context", re: /(?:context|系统上下文|system context)/i },
    { name: "container", re: /(?:container|容器)/i },
  ];
  let allPassed = true;
  const results: Array<{ file: string; found: string[]; missing: string[] }> =
    [];
  for (const fp of archFiles) {
    const content = await readUtf(fp);
    const found: string[] = [],
      missing: string[] = [];
    for (const s of required) {
      if (s.re.test(content)) found.push(s.name);
      else missing.push(s.name);
    }
    if (missing.length > 0) allPassed = false;
    results.push({ file: rel(ctx.projectRoot, fp), found, missing });
  }

  const out = [`architecture-review: checked ${archFiles.length} file(s)`];
  for (const r of results) {
    out.push(
      `  ${r.missing.length === 0 ? "✓" : "✗"} ${r.file}: [${r.found.join(", ")}]`,
    );
    if (r.missing.length > 0) out.push(`    MISSING: ${r.missing.join(", ")}`);
  }
  return {
    passed: allPassed,
    exit_code: allPassed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { files_checked: archFiles.length, results },
  };
}

// -- data-model-validate --

async function runDataModelValidate(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const files: string[] = [];
  for (const root of [
    path.join(ctx.projectRoot, ".spec-graph/artifacts"),
    path.join(ctx.projectRoot, "_wdf_output"),
  ]) {
    await walkDir(root, async (fp) => {
      const n = path.basename(fp).toLowerCase();
      if (
        n.includes("schema") ||
        n.includes("data-model") ||
        n.includes("db-schema")
      )
        files.push(fp);
    });
  }
  if (files.length === 0) return dataModelEmptyResult(ctx);

  const issues: string[] = [];
  for (const fp of files) {
    const content = await readUtf(fp);
    const ext = path.extname(fp).toLowerCase();
    const issue = validateSchemaFile(content, ext);
    if (issue) issues.push(`${rel(ctx.projectRoot, fp)}: ${issue}`);
  }

  const passed = issues.length === 0;
  const out = [`data-model-validate: checked ${files.length} file(s)`];
  if (passed) out.push("  ✓ all valid");
  else for (const i of issues) out.push(`  ✗ ${i}`);
  return {
    passed,
    exit_code: passed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { files_checked: files.length, issues },
  };
}

function dataModelEmptyResult(ctx: BuiltinCheckContext): BuiltinCheckResult {
  const a = ctx.state.artifacts["contract/db-schema"];
  if (a?.status === "completed") {
    return {
      passed: true,
      exit_code: 0,
      stdout: "data-model-validate: contract/db-schema completed (no file)",
      stderr: "",
      details: { files_found: 0 },
    };
  }
  return {
    passed: true,
    exit_code: 0,
    stdout: "data-model-validate: no schema files, passing",
    stderr: "",
    details: { files_found: 0 },
  };
}

function validateSchemaFile(content: string, ext: string): string | null {
  if (ext === ".yaml" || ext === ".yml") {
    if (!/^(entities|tables|models|schema)/m.test(content))
      return "missing entities/tables key";
  } else if (ext === ".md") {
    if (
      !/(?:entity|table|model|collection)\s*[:|]/i.test(content) &&
      !/(?:实体|表|模型)/.test(content)
    )
      return "no entity definitions";
  } else if (ext === ".prisma") {
    if (!/model\s+\w+/.test(content)) return "no Prisma models";
  }
  return null;
}

// -- schema-drift-scan --

async function runSchemaDrift(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const driftPath = path.join(ctx.projectRoot, ".spec-graph/schema-drift.json");
  const files: string[] = [];
  await walkDir(ctx.projectRoot, async (fp) => {
    const n = path.basename(fp).toLowerCase();
    const ext = path.extname(fp).toLowerCase();
    if (
      n.includes("schema") &&
      [".yaml", ".yml", ".json", ".prisma", ".md"].includes(ext) &&
      !fp.includes("node_modules") &&
      !fp.includes("schema-drift")
    )
      files.push(fp);
  });
  if (files.length === 0)
    return {
      passed: true,
      exit_code: 0,
      stdout: "schema-drift-scan: no schema files",
      stderr: "",
      details: { files_scanned: 0 },
    };

  const hashes = await computeFileHashes(ctx.projectRoot, files);
  const prev = await loadPrevHashes(driftPath);
  if (prev === null) {
    await saveHashes(driftPath, hashes);
    return {
      passed: true,
      exit_code: 0,
      stdout: `schema-drift-scan: first run, recorded ${files.length} hash(es)`,
      stderr: "",
      details: { files_scanned: files.length, first_run: true },
    };
  }

  const diff = computeDrift(prev, hashes);
  await saveHashes(driftPath, hashes);

  const passed = diff.drifted.length === 0;
  const out = renderDriftResult(files.length, diff, prev, hashes);
  return {
    passed,
    exit_code: passed ? 0 : 1,
    stdout: out,
    stderr: "",
    details: { files_scanned: files.length, ...diff },
  };
}

async function computeFileHashes(
  projectRoot: string,
  files: string[],
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const fp of files) {
    const content = await readUtf(fp);
    hashes[rel(projectRoot, fp)] = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 16);
  }
  return hashes;
}

async function loadPrevHashes(
  driftPath: string,
): Promise<Record<string, string> | null> {
  try {
    return JSON.parse(await readUtf(driftPath)).hashes || {};
  } catch {
    return null;
  }
}

async function saveHashes(
  driftPath: string,
  hashes: Record<string, string>,
): Promise<void> {
  await fs.mkdir(path.dirname(driftPath), { recursive: true });
  await fs.writeFile(
    driftPath,
    JSON.stringify({ hashes, scanned_at: new Date().toISOString() }, null, 2),
  );
}

function computeDrift(
  prev: Record<string, string>,
  curr: Record<string, string>,
): { drifted: string[]; added: string[]; removed: string[] } {
  const drifted: string[] = [],
    added: string[] = [],
    removed: string[] = [];
  for (const [f, h] of Object.entries(curr)) {
    if (!(f in prev)) added.push(f);
    else if (prev[f] !== h) drifted.push(f);
  }
  for (const f of Object.keys(prev)) {
    if (!(f in curr)) removed.push(f);
  }
  return { drifted, added, removed };
}

function renderDriftResult(
  count: number,
  diff: { drifted: string[]; added: string[]; removed: string[] },
  prev: Record<string, string>,
  curr: Record<string, string>,
): string {
  const out = [`schema-drift-scan: scanned ${count} file(s)`];
  if (
    diff.drifted.length === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0
  ) {
    out.push("  ✓ no drift");
    return out.join("\n");
  }
  if (diff.drifted.length > 0) {
    out.push(`  ✗ DRIFT: ${diff.drifted.length} file(s)`);
    for (const f of diff.drifted) out.push(`    ${f}: ${prev[f]} → ${curr[f]}`);
  }
  if (diff.added.length > 0) out.push(`  + new: ${diff.added.join(", ")}`);
  if (diff.removed.length > 0)
    out.push(`  - removed: ${diff.removed.join(", ")}`);
  return out.join("\n");
}

// -- complexity-scan --

async function runComplexityScan(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const maxCC = await getComplexityThreshold(ctx);
  const files = await collectSourceFiles(ctx.projectRoot);
  if (files.length === 0)
    return {
      passed: true,
      exit_code: 0,
      stdout: "complexity-scan: no source files",
      stderr: "",
      details: { files_scanned: 0 },
    };

  const violations: Array<{
    file: string;
    line: number;
    fn: string;
    cc: number;
  }> = [];
  for (const fp of files) {
    const fileViolations = await scanFileComplexity(ctx.projectRoot, fp, maxCC);
    violations.push(...fileViolations);
  }

  const passed = violations.length === 0;
  const out = renderComplexityResult(files.length, violations, maxCC);
  return {
    passed,
    exit_code: passed ? 0 : 1,
    stdout: out,
    stderr: "",
    details: { files_scanned: files.length, violations, threshold: maxCC },
  };
}

async function getComplexityThreshold(
  ctx: BuiltinCheckContext,
): Promise<number> {
  const th = (ctx.graph.checks.find((c) => c.id === "complexity-budget") as any)
    ?.threshold;
  const constitution = await loadConstitution(ctx.projectRoot);
  const constT = constitution?.quality.thresholds.cyclomatic_complexity;
  return constT ?? th?.cyclomatic ?? 15;
}

async function collectSourceFiles(projectRoot: string): Promise<string[]> {
  const srcDir = path.join(projectRoot, "src");
  const files: string[] = [];
  await walkDir(srcDir, async (fp) => {
    if (
      fp.endsWith(".ts") &&
      !fp.endsWith(".test.ts") &&
      !fp.includes(".test.")
    )
      files.push(fp);
  });
  return files;
}

async function scanFileComplexity(
  projectRoot: string,
  fp: string,
  maxCC: number,
): Promise<Array<{ file: string; line: number; fn: string; cc: number }>> {
  const lines = (await readUtf(fp)).split("\n");
  const violations: Array<{
    file: string;
    line: number;
    fn: string;
    cc: number;
  }> = [];
  let inFn = false,
    fnName = "",
    fnLine = 0,
    cc = 1,
    depth = 0,
    fnDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(
      /(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/,
    );
    if (m && !inFn) {
      inFn = true;
      fnName = m[1] || m[2] || "anon";
      fnLine = i + 1;
      cc = 1;
      fnDepth = depth;
    }

    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }

    if (inFn) {
      if (/\b(if|else\s+if|catch|case)\b/.test(line)) cc++;
      if (/\b(for|while|do)\b\s*[\({]/.test(line)) cc++;
      const ops = line.match(/&&|\|\|/g);
      if (ops) cc += ops.length;
    }

    if (inFn && depth <= fnDepth && line.includes("}")) {
      if (cc > maxCC)
        violations.push({
          file: rel(projectRoot, fp),
          line: fnLine,
          fn: fnName,
          cc,
        });
      inFn = false;
    }
  }
  return violations;
}

function renderComplexityResult(
  fileCount: number,
  violations: any[],
  maxCC: number,
): string {
  const out = [`complexity-scan: scanned ${fileCount} file(s), max: ${maxCC}`];
  if (violations.length === 0) {
    out.push("  ✓ all within budget");
    return out.join("\n");
  }
  out.push(`  ✗ ${violations.length} function(s) exceed:`);
  for (const v of violations.slice(0, 20)) {
    out.push(`    ${v.file}:${v.line} ${v.fn}() — ${v.cc}`);
  }
  return out.join("\n");
}

// -- constitution-validate --

async function runConstitutionValidate(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const constitution = await loadConstitution(ctx.projectRoot);
  if (!constitution) {
    return {
      passed: false,
      exit_code: 1,
      stdout:
        "constitution-validate: no constitution found. Run `spec-graph constitution init`.",
      stderr: "",
      details: { present: false },
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  validateConstitutionSchema(constitution, errors, warnings);

  const graphDrifts = await detectConstitutionPackDrift(ctx);

  const out = [
    `constitution-validate: ${constitution.project_name} v${constitution.version}`,
  ];
  if (
    errors.length === 0 &&
    warnings.length === 0 &&
    graphDrifts.length === 0
  ) {
    out.push("  ✓ constitution valid and consistent with packs");
    return {
      passed: true,
      exit_code: 0,
      stdout: out.join("\n"),
      stderr: "",
      details: { present: true, errors, warnings, drifts: graphDrifts },
    };
  }
  if (errors.length > 0) {
    out.push(`  ✗ ${errors.length} error(s):`);
    for (const e of errors) out.push(`    • ${e}`);
  }
  if (warnings.length > 0) {
    out.push(`  ⚠ ${warnings.length} warning(s):`);
    for (const w of warnings) out.push(`    • ${w}`);
  }
  if (graphDrifts.length > 0) {
    out.push(
      `  ⚠ ${graphDrifts.length} pack drift(s) (constitution wins at runtime):`,
    );
    for (const d of graphDrifts) out.push(`    • ${d}`);
  }
  return {
    passed: errors.length === 0,
    exit_code: errors.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { present: true, errors, warnings, drifts: graphDrifts },
  };
}

function validateConstitutionSchema(
  c: any,
  errors: string[],
  warnings: string[],
): void {
  if (!c.version) errors.push("missing top-level: version");
  if (!c.project_name) errors.push("missing top-level: project_name");
  if (!c.effective_date) errors.push("missing top-level: effective_date");

  const t = c.quality?.thresholds;
  if (t) {
    if (
      t.test_coverage !== undefined &&
      (t.test_coverage < 0 || t.test_coverage > 1)
    ) {
      errors.push(
        `quality.thresholds.test_coverage must be 0..1, got ${t.test_coverage}`,
      );
    }
    if (t.cyclomatic_complexity !== undefined && t.cyclomatic_complexity < 1) {
      errors.push(
        `quality.thresholds.cyclomatic_complexity must be ≥1, got ${t.cyclomatic_complexity}`,
      );
    }
  } else {
    errors.push("missing section: quality.thresholds");
  }

  if (
    c.quality?.require_review_approvers === undefined ||
    c.quality.require_review_approvers < 0
  ) {
    errors.push("quality.require_review_approvers must be ≥0");
  }

  if (c.traceability?.required_traces) {
    for (const r of c.traceability.required_traces) {
      if (!["exists", "every", "single"].includes(r.cardinality)) {
        errors.push(
          `traceability.required_traces[${r.name}].cardinality invalid: ${r.cardinality}`,
        );
      }
    }
  }
}

async function detectConstitutionPackDrift(
  ctx: BuiltinCheckContext,
): Promise<string[]> {
  const constitution = await loadConstitution(ctx.projectRoot);
  if (!constitution) return [];

  const checks = ctx.graph.checks || [];
  const constT = constitution.quality.thresholds;
  const drifts: string[] = [];

  const complexityCheck = checks.find(
    (c) => c.id === "complexity-budget",
  ) as any;
  const packCC = complexityCheck?.threshold?.cyclomatic;
  if (
    constT.cyclomatic_complexity !== undefined &&
    packCC !== undefined &&
    constT.cyclomatic_complexity !== packCC
  ) {
    drifts.push(
      `complexity-budget: pack=${packCC}, constitution=${constT.cyclomatic_complexity}`,
    );
  }

  const clarifyCheck = checks.find((c) => c.id === "clarify-scan") as any;
  const packAmb = clarifyCheck?.threshold?.ambiguity;
  if (
    constT.ambiguity_score !== undefined &&
    packAmb !== undefined &&
    constT.ambiguity_score !== packAmb
  ) {
    drifts.push(
      `clarify-scan: pack ambiguity=${packAmb}, constitution=${constT.ambiguity_score}`,
    );
  }

  return drifts;
}

// -- contract-drift-scan --
// Surfaces the contract registry's drift status as a check. Fails when any
// consumer is on a stale or broken version. Mirrors the gate-level
// require_contracts_current evaluation so the same rule can be enforced
// either as a gate predicate or as a check that gates can require.

async function runContractDriftScan(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const dir = path.join(ctx.projectRoot, ".spec-graph", "contracts");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "contract-drift-scan: no contract registry yet (nothing to drift)",
      stderr: "",
      details: { entries: 0, drifted: [] },
    };
  }

  const drifted: Array<{
    contract: string;
    consumer: string;
    status: string;
    bound: string;
    current: string;
  }> = [];
  let entryCount = 0;

  for (const f of entries) {
    if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
    const entry = await tryReadYaml<any>(path.join(dir, f));
    if (!entry || !entry.consumers) continue;
    entryCount++;
    for (const c of entry.consumers) {
      if (c.status === "broken") {
        drifted.push({
          contract: entry.contract_id,
          consumer: c.consumer,
          status: "broken",
          bound: c.bound_version,
          current: entry.current_version,
        });
      } else if (c.bound_version !== entry.current_version) {
        drifted.push({
          contract: entry.contract_id,
          consumer: c.consumer,
          status: "stale",
          bound: c.bound_version,
          current: entry.current_version,
        });
      }
    }
  }

  const out = [
    `contract-drift-scan: ${entryCount} contract(s), ${drifted.length} drifted consumer(s)`,
  ];
  for (const d of drifted) {
    out.push(
      `  • ${d.contract} / ${d.consumer}: ${d.status} (bound ${d.bound} ≠ current ${d.current})`,
    );
  }

  return {
    passed: drifted.length === 0,
    exit_code: drifted.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { entries: entryCount, drifted },
  };
}

// -- scope-lock-validate --
// Loads all scope locks, gets changed files per isolation unit via git diff
// against the unit's base commit, and validates each against its lock.
// Passes vacuously if no scope locks exist.

async function runScopeLockValidate(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const scopeDir = path.join(ctx.projectRoot, ".spec-graph", "isolation");
  let files: string[] = [];
  try {
    const all = await fs.readdir(scopeDir);
    files = all.filter((f) => f.startsWith("scope-") && f.endsWith(".yaml"));
  } catch {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "scope-lock-validate: no scope locks registered (passing vacuously)",
      stderr: "",
      details: { locks_checked: 0 },
    };
  }

  if (files.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "scope-lock-validate: no scope locks registered (passing vacuously)",
      stderr: "",
      details: { locks_checked: 0 },
    };
  }

  // Load worktree registry to get base commits per unit
  const wtRegPath = path.join(scopeDir, "worktrees.yaml");
  const wtReg = await tryReadYaml<any>(wtRegPath);
  const units: Record<string, { base_commit?: string; path?: string }> = {};
  if (wtReg?.units) {
    for (const [id, u] of Object.entries(wtReg.units) as [string, any][]) {
      units[id] = { base_commit: u.base_commit, path: u.path };
    }
  }

  const results: Array<{
    unit: string;
    passed: boolean;
    violations: number;
    mode: string;
  }> = [];
  let allPassed = true;

  for (const f of files) {
    const lock = await tryReadYaml<any>(path.join(scopeDir, f));
    if (!lock) continue;

    const unitId = lock.unit_id;
    const unit = units[unitId];

    // Get changed files via git diff
    let changedFiles: string[] = [];
    if (unit?.base_commit && unit?.path) {
      changedFiles = await gitDiffFiles(unit.path, unit.base_commit);
    } else {
      // Fallback: diff against HEAD~1 in the main project
      changedFiles = await gitDiffFiles(ctx.projectRoot, "HEAD~1");
    }

    if (changedFiles.length === 0) {
      results.push({
        unit: unitId,
        passed: true,
        violations: 0,
        mode: lock.enforcement_mode,
      });
      continue;
    }

    const result = validateScopeLock(changedFiles, lock);
    results.push({
      unit: unitId,
      passed: result.passed,
      violations: result.violations.length,
      mode: lock.enforcement_mode,
    });
    if (!result.passed && lock.enforcement_mode === "strict") {
      allPassed = false;
    }
  }

  const out = [`scope-lock-validate: ${files.length} lock(s) checked`];
  for (const r of results) {
    if (r.passed) {
      out.push(`  ✓ ${r.unit}: clean (${r.mode})`);
    } else {
      out.push(`  ✗ ${r.unit}: ${r.violations} violation(s) [${r.mode}]`);
    }
  }

  return {
    passed: allPassed,
    exit_code: allPassed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: { locks_checked: files.length, results },
  };
}

async function gitDiffFiles(cwd: string, since: string): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["diff", "--name-only", since, "HEAD"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", () => {
      resolve(
        stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      );
    });
    proc.on("error", () => resolve([]));
  });
}

// -- clone-detection --
// Token-hash duplicate function finder. Walks src/, parses function bodies,
// hashes each by its token sequence, and groups by hash. Functions in the
// same hash group are clones. Blocks when clone ratio (clones / total) exceeds
// threshold.dup_ratio_max (default 0.10).
//
// Tokenization is intentionally simple: strip whitespace, comments, and
// identifiers — keep only structural punctuation and keywords. Two functions
// with the same shape but different variable names hash to the same bucket.

interface FunctionBlock {
  name: string;
  file: string;
  line: number;
  body: string;
  hash: string;
}

async function runCloneDetection(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const srcDir = path.join(ctx.projectRoot, "src");
  const files = await collectSourceFiles(ctx.projectRoot);
  if (files.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout: "clone-detection: no source files",
      stderr: "",
      details: { files_scanned: 0, functions: 0, clones: 0, ratio: 0 },
    };
  }

  const blocks: FunctionBlock[] = [];
  for (const fp of files) {
    const content = await readUtf(fp);
    const fns = extractFunctions(content);
    for (const fn of fns) {
      blocks.push({
        name: fn.name,
        file: rel(ctx.projectRoot, fp),
        line: fn.line,
        body: fn.body,
        hash: hashTokens(fn.body),
      });
    }
  }

  // Group by hash
  const groups: Map<string, FunctionBlock[]> = new Map();
  for (const b of blocks) {
    if (!groups.has(b.hash)) groups.set(b.hash, []);
    groups.get(b.hash)!.push(b);
  }

  const cloneGroups: Array<{
    hash: string;
    count: number;
    functions: Array<{ name: string; file: string; line: number }>;
  }> = [];
  let clonedFunctions = 0;
  for (const [hash, group] of groups.entries()) {
    if (group.length > 1) {
      clonedFunctions += group.length;
      cloneGroups.push({
        hash: hash.substring(0, 8),
        count: group.length,
        functions: group.map((b) => ({
          name: b.name,
          file: b.file,
          line: b.line,
        })),
      });
    }
  }

  const totalFunctions = blocks.length;
  const ratio = totalFunctions > 0 ? clonedFunctions / totalFunctions : 0;
  const threshold = getCloneThreshold(ctx);
  const passed = ratio <= threshold;

  const out = [
    `clone-detection: scanned ${files.length} file(s), ${totalFunctions} function(s)`,
    `  clone groups: ${cloneGroups.length}`,
    `  cloned functions: ${clonedFunctions} / ${totalFunctions} = ${(ratio * 100).toFixed(1)}% (max ${(threshold * 100).toFixed(0)}%)`,
  ];
  if (!passed) {
    out.push("  ✗ threshold exceeded");
    for (const g of cloneGroups.slice(0, 10)) {
      out.push(`    [${g.hash}] ${g.count} copies:`);
      for (const f of g.functions.slice(0, 5)) {
        out.push(`      • ${f.file}:${f.line} ${f.name}()`);
      }
    }
  } else if (cloneGroups.length > 0) {
    out.push("  (clones within threshold)");
  }

  return {
    passed,
    exit_code: passed ? 0 : 1,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      files_scanned: files.length,
      functions: totalFunctions,
      clone_groups: cloneGroups.length,
      cloned_functions: clonedFunctions,
      ratio,
      threshold,
    },
  };
}

function getCloneThreshold(ctx: BuiltinCheckContext): number {
  const check = ctx.graph.checks.find((c) => c.id === "clone-detection") as any;
  return check?.threshold?.dup_ratio_max ?? 0.1;
}

interface ExtractedFn {
  name: string;
  line: number;
  body: string;
}

/**
 * Very small function extractor for TS/JS-like syntax. Finds `function name(...) { ... }`
 * and `const name = (...) => { ... }` and `(async )? function name(...) { ... }`.
 * Returns the function body (including signature) for hashing.
 *
 * This is intentionally a regex-based approximation — a real parser would be
 * more accurate but adds a heavy dependency. For clone detection, the rough
 * cut is good enough to find obvious duplicates.
 */
function extractFunctions(content: string): ExtractedFn[] {
  const lines = content.split("\n");
  const fns: ExtractedFn[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(
      /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/,
    );
    if (!m) {
      i++;
      continue;
    }
    const name = m[1] || m[2] || "anon";
    const startLine = i + 1;
    // Find the opening brace
    let j = i;
    while (j < lines.length && !lines[j].includes("{")) j++;
    if (j >= lines.length) {
      i++;
      continue;
    }
    // Match braces
    let depth = 0;
    let bodyStart = j;
    let bodyEnd = -1;
    for (let k = j; k < lines.length; k++) {
      for (const ch of lines[k]) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            bodyEnd = k;
            break;
          }
        }
      }
      if (bodyEnd >= 0) break;
    }
    if (bodyEnd < 0) {
      i++;
      continue;
    }
    const body = lines.slice(bodyStart, bodyEnd + 1).join("\n");
    fns.push({ name, line: startLine, body });
    i = bodyEnd + 1;
  }
  return fns;
}

/**
 * Token hash for clone detection. Strips comments, strings, identifiers, and
 * numbers — keeps only structural keywords and punctuation. Two functions
 * with the same control flow but different variable names hash to the same value.
 */
function hashTokens(source: string): string {
  // Strip block comments
  let s = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip line comments
  s = s.replace(/\/\/.*$/gm, "");
  // Strip strings
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, "``");
  // Strip numbers
  s = s.replace(/\b\d+(\.\d+)?\b/g, "N");
  // Strip identifiers — keep keywords
  const keywords = new Set([
    "function",
    "const",
    "let",
    "var",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "try",
    "catch",
    "finally",
    "throw",
    "new",
    "class",
    "extends",
    "super",
    "this",
    "await",
    "async",
    "yield",
    "import",
    "export",
    "from",
    "as",
    "typeof",
    "instanceof",
    "in",
    "of",
    "delete",
    "void",
    "null",
    "undefined",
    "true",
    "false",
  ]);
  s = s.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (m) =>
    keywords.has(m) ? m : "id",
  );
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

// -- reuse-scan --
// Scans for "orphan" symbols: exported functions/classes not linked to any
// requirement via a `satisfies` edge in the trace graph. Also reports existing
// `satisfies` edges as reuse opportunities. Always passes (informational only).
//
// The check is heuristic — it cannot tell whether a symbol is genuinely
// reusable. It surfaces candidates for the user to review.

async function runReuseScan(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const files = await collectSourceFiles(ctx.projectRoot);
  if (files.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout: "reuse-scan: no source files (informational)",
      stderr: "",
      details: {
        files_scanned: 0,
        exported_symbols: 0,
        orphans: 0,
        satisfies_edges: 0,
      },
    };
  }

  // Collect exported symbols
  const exportedSymbols: Array<{ name: string; file: string; line: number }> =
    [];
  for (const fp of files) {
    const content = await readUtf(fp);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(
        /^\s*export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/,
      );
      if (m) {
        exportedSymbols.push({
          name: m[1],
          file: rel(ctx.projectRoot, fp),
          line: i + 1,
        });
      }
    }
  }

  // Build trace index
  let satisfiesEdges = 0;
  let traceIndex: Awaited<ReturnType<typeof buildTraceIndex>> | null = null;
  try {
    traceIndex = await buildTraceIndex(ctx.projectRoot, ctx.graph);
    satisfiesEdges = traceIndex.edges.filter(
      (e) => e.relation === "satisfies",
    ).length;
  } catch {
    // No trace files — that's fine
  }

  // Find which symbols are already linked via `satisfies` edges
  const linkedTargets = new Set<string>();
  if (traceIndex) {
    for (const edge of traceIndex.edges) {
      if (edge.relation === "satisfies" || edge.relation === "implemented_by") {
        linkedTargets.add(edge.to);
        linkedTargets.add(edge.from);
      }
    }
  }

  // Orphans = exported symbols whose name doesn't appear in any linked target
  const orphans = exportedSymbols.filter((s) => !linkedTargets.has(s.name));

  // Load contracts registry to count what's already covered
  const contractsDir = path.join(ctx.projectRoot, ".spec-graph", "contracts");
  let contractCount = 0;
  try {
    const entries = await fs.readdir(contractsDir);
    contractCount = entries.filter((f) => f.endsWith(".yaml")).length;
  } catch {
    // No contracts directory — fine
  }

  const out = [
    `reuse-scan: ${files.length} source file(s), ${exportedSymbols.length} exported symbol(s) (informational)`,
    `  satisfies edges in trace graph: ${satisfiesEdges}`,
    `  contracts registered: ${contractCount}`,
    `  orphan symbols (no satisfies link): ${orphans.length}`,
  ];
  if (orphans.length > 0) {
    out.push("  candidates for review:");
    for (const o of orphans.slice(0, 15)) {
      out.push(`    • ${o.file}:${o.line} ${o.name}`);
    }
    if (orphans.length > 15) out.push(`    ... +${orphans.length - 15} more`);
    out.push("  (link via trace satisfies edges to silence)");
  } else if (exportedSymbols.length > 0) {
    out.push("  ✓ all exported symbols linked to requirements");
  }

  return {
    passed: true, // Always passes — informational
    exit_code: 0,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      files_scanned: files.length,
      exported_symbols: exportedSymbols.length,
      orphans: orphans.length,
      satisfies_edges: satisfiesEdges,
      contracts: contractCount,
    },
  };
}

// -- acceptance-layer-audit --
// Audits the 4-layer acceptance model (unit/integration/system/deployment).
// For each layer declared in graph.acceptance_layers, checks whether required
// layers actually have checks wired up. Warns on empty required layers —
// the user declared the layer required but provided no way to verify it.
//
// Always passes (informational). The hard enforcement comes from the
// exit-merged gate's require_checks, which is auto-injected at Compose time
// to include all required layer checks.

async function runAcceptanceLayerAudit(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const layers = ctx.graph.acceptance_layers || {};
  const expected = ["unit", "integration", "system", "deployment"];

  const results: Array<{
    layer: string;
    required: boolean;
    check_count: number;
    status: "ok" | "empty-required" | "empty-optional" | "undeclared";
  }> = [];

  const warnings: string[] = [];

  for (const layer of expected) {
    const def = layers[layer];
    if (!def) {
      results.push({
        layer,
        required: false,
        check_count: 0,
        status: "undeclared",
      });
      continue;
    }
    const checks = def.checks || [];
    if (def.required && checks.length === 0) {
      results.push({
        layer,
        required: true,
        check_count: 0,
        status: "empty-required",
      });
      warnings.push(
        `layer '${layer}' is required but has no checks — cannot verify acceptance`,
      );
    } else if (checks.length === 0) {
      results.push({
        layer,
        required: false,
        check_count: 0,
        status: "empty-optional",
      });
    } else {
      results.push({
        layer,
        required: def.required,
        check_count: checks.length,
        status: "ok",
      });
    }
  }

  // Also flag any layers declared in the graph but not in the expected 4
  for (const layerName of Object.keys(layers)) {
    if (!expected.includes(layerName)) {
      warnings.push(
        `layer '${layerName}' is not a standard acceptance layer (expected: ${expected.join(", ")})`,
      );
    }
  }

  const out = [`acceptance-layer-audit: ${results.length} layer(s) checked`];
  for (const r of results) {
    const icon =
      r.status === "ok"
        ? "✓"
        : r.status === "empty-required"
          ? "✗"
          : r.status === "empty-optional"
            ? "~"
            : "○";
    const reqLabel = r.required ? "required" : "optional";
    out.push(
      `  ${icon} ${r.layer} [${reqLabel}]: ${r.check_count} check(s) — ${r.status}`,
    );
  }
  if (warnings.length > 0) {
    out.push("  warnings:");
    for (const w of warnings) out.push(`    • ${w}`);
  }

  return {
    passed: true, // Always passes — informational
    exit_code: 0,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      layers: results,
      warnings,
    },
  };
}

// -- shared-contract-audit --
// Scans graph.tracks for contracts consumed by ≥2 tracks but produced by none.
// Surfaces the same cross-track duplicate signal that Compose emits as a
// warning, but at check time so it can be referenced from gates.
//
// Per §6.3 layer 3: this is a *suggestion* for human review, never an
// auto-wire. Premature abstraction (forcing 3 similar lines into a contract)
// is worse than the duplication it tries to fix. Always passes — informational.

async function runSharedContractAudit(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const tracks = ctx.graph.tracks || [];

  // Collect produced and consumed contract IDs
  const produced = new Set<string>();
  for (const track of tracks) {
    for (const p of track.produces || []) {
      if (p.startsWith("contract/")) produced.add(p);
    }
  }

  // Find orphan-consumed contracts (consumed by ≥2 tracks, produced by none)
  const consumers = new Map<string, string[]>();
  for (const track of tracks) {
    for (const c of track.consumes || []) {
      if (!c.startsWith("contract/")) continue;
      if (produced.has(c)) continue;
      if (!consumers.has(c)) consumers.set(c, []);
      consumers.get(c)!.push(track.id);
    }
  }

  const opportunities: Array<{
    contract: string;
    consumer_count: number;
    consumers: string[];
  }> = [];
  for (const [contractId, consumerList] of consumers.entries()) {
    if (consumerList.length >= 2) {
      opportunities.push({
        contract: contractId,
        consumer_count: consumerList.length,
        consumers: consumerList,
      });
    }
  }

  const out = [
    `shared-contract-audit: ${tracks.length} track(s), ${opportunities.length} shared-contract opportunity(ies)`,
  ];
  const suggestions: string[] = [];
  if (opportunities.length === 0) {
    out.push(
      "  ✓ no orphan-consumed contracts (all consumed contracts have producers)",
    );
  } else {
    out.push(
      "  suggestions for human review (do NOT auto-wire — premature abstraction is worse):",
    );
    for (const opp of opportunities) {
      const line = `consider introducing contract/shared-lib for '${opp.contract}' (consumed by ${opp.consumers.join(", ")}; ${opp.consumer_count} consumers, 0 producers)`;
      out.push(
        `    • ${opp.contract} ← ${opp.consumers.join(", ")} (${opp.consumer_count} consumers, 0 producers)`,
      );
      suggestions.push(line);
    }
  }

  return {
    passed: true, // Always passes — informational
    exit_code: 0,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      tracks: tracks.length,
      opportunities,
      opportunity_count: opportunities.length,
      suggestions,
    },
  };
}

// -- command-safety-validate --
// Inherit wdf-method SPEC §5: pack-declared check.command values execute as
// shell — without a whitelist, any third-party pack could ship `rm -rf /` or
// `curl evil | sh` as a check command and the engine would run it.
//
// Rules (loaded from constitution.security; falls back to wdf defaults):
//   1. Builtin sentinels `<name>` are always safe (dispatched to TS, not shell)
//   2. Shell commands must start with a whitelisted prefix
//   3. Shell commands must not contain any forbidden pattern
// Blocks when any check.command violates either rule.

const FALLBACK_COMMAND_WHITELIST = [
  "npm test",
  "npm run",
  "npx",
  "node",
  "jest",
  "vitest",
  "tsc",
  "eslint",
];

const FALLBACK_FORBIDDEN_PATTERNS = [
  "&&",
  "||",
  ";",
  "|",
  "$(",
  "`",
  ">",
  "<",
  "curl",
  "wget",
  "sudo",
  "su ",
  "eval",
  "rm -rf",
];

async function runCommandSafetyValidate(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const constitution = await loadConstitution(ctx.projectRoot);
  const whitelist =
    constitution?.security?.command_whitelist || FALLBACK_COMMAND_WHITELIST;
  const forbidden =
    constitution?.security?.forbidden_patterns || FALLBACK_FORBIDDEN_PATTERNS;

  const checks = ctx.graph.checks || [];
  const violations: Array<{
    check_id: string;
    command: string;
    reason: string;
    kind: string;
  }> = [];

  for (const check of checks) {
    const command = (check.command || "").trim();
    if (!command) continue;

    // Builtin sentinels: <name> — always safe (dispatched to TS, not shell)
    if (extractBuiltinName(command)) continue;

    // Whitelist prefix match
    const matchesWhitelist = whitelist.some((prefix) =>
      command.startsWith(prefix),
    );
    if (!matchesWhitelist) {
      violations.push({
        check_id: check.id,
        command,
        kind: "not-whitelisted",
        reason: `command does not start with any whitelisted prefix: ${whitelist.join(", ")}`,
      });
      continue; // skip forbidden-pattern scan — already blocked
    }

    // Forbidden pattern scan (only on whitelisted commands)
    for (const pattern of forbidden) {
      if (command.includes(pattern)) {
        violations.push({
          check_id: check.id,
          command,
          kind: "forbidden-pattern",
          reason: `command contains forbidden pattern '${pattern}'`,
        });
        break; // one violation per check is enough
      }
    }
  }

  const out = [
    `command-safety-validate: ${checks.length} check(s), ${violations.length} violation(s)`,
  ];
  if (violations.length === 0) {
    out.push("  ✓ all check commands pass whitelist + forbidden-pattern rules");
  } else {
    out.push("  ✗ blocking violations:");
    for (const v of violations) {
      out.push(`    • ${v.check_id} [${v.kind}]: ${v.command}`);
      out.push(`        ${v.reason}`);
    }
  }

  return {
    passed: violations.length === 0,
    exit_code: violations.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr:
      violations.length === 0
        ? ""
        : `${violations.length} command-safety violation(s)`,
    details: {
      checks_scanned: checks.length,
      whitelist,
      forbidden_patterns: forbidden,
      violations,
      violation_count: violations.length,
    },
  };
}

// -- articles-validate --
// Inherit spec-kit "9 Articles" concept: named qualitative invariants declared
// in the constitution. Unlike numeric thresholds, articles are boolean rules
// about artifact content quality. Each article declares a rule that completed
// artifacts must satisfy.
//
// Rule types:
//   - required_section: artifact file must contain a markdown section header
//   - min_length: artifact file must have at least N characters
//   - co_completed: if any from_kind artifact is completed, at least one
//     to_kind artifact must also be completed

async function runArticlesValidate(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const constitution = await loadConstitution(ctx.projectRoot);
  const articles = constitution?.quality?.articles || [];

  if (articles.length === 0) {
    return {
      passed: true,
      exit_code: 0,
      stdout: "articles-validate: no articles declared (passing vacuously)",
      stderr: "",
      details: { articles_checked: 0, violations: [], violation_count: 0 },
    };
  }

  const artifactsDir = path.join(ctx.projectRoot, ".spec-graph", "artifacts");
  const violations: Array<{
    article_id: string;
    rule_type: string;
    detail: string;
  }> = [];

  for (const article of articles) {
    const rule = article.rule;

    if (rule.type === "required_section" || rule.type === "min_length") {
      // File-based rules: check artifact content
      const artifactFile = path.join(artifactsDir, `${rule.artifact_kind}.md`);
      const stateEntry = ctx.state.artifacts?.[rule.artifact_kind];

      // Only validate if artifact is completed (skip pending/in_progress)
      if (!stateEntry || stateEntry.status !== "completed") continue;

      let content: string;
      try {
        content = await readUtf(artifactFile);
      } catch {
        violations.push({
          article_id: article.id,
          rule_type: rule.type,
          detail: `artifact file not found: ${rule.artifact_kind}.md`,
        });
        continue;
      }

      if (rule.type === "required_section") {
        // Match markdown heading containing the section name (substring match, case-insensitive).
        // e.g., section "Context" matches "## 1. System Context (Level 1)"
        const sectionRe = new RegExp(
          `^#{1,6}.*${escapeRegExp(rule.section)}.*$`,
          "im",
        );
        if (!sectionRe.test(content)) {
          violations.push({
            article_id: article.id,
            rule_type: "required_section",
            detail: `${rule.artifact_kind}.md missing section "${rule.section}"`,
          });
        }
      } else if (rule.type === "min_length") {
        if (content.length < rule.min_chars) {
          violations.push({
            article_id: article.id,
            rule_type: "min_length",
            detail: `${rule.artifact_kind}.md has ${content.length} chars, minimum is ${rule.min_chars}`,
          });
        }
      }
    } else if (rule.type === "co_completed") {
      // Co-completion rule: if any from_kind artifact is completed, to_kind must also be
      const fromEntries = Object.values(ctx.state.artifacts || {}).filter(
        (a) => a.id.startsWith(rule.from_kind) || a.id === rule.from_kind,
      );
      const hasCompletedFrom = fromEntries.some(
        (a) => a.status === "completed",
      );

      if (hasCompletedFrom) {
        const toEntries = Object.values(ctx.state.artifacts || {}).filter(
          (a) => a.id.startsWith(rule.to_kind) || a.id === rule.to_kind,
        );
        const hasCompletedTo = toEntries.some((a) => a.status === "completed");

        if (!hasCompletedTo) {
          violations.push({
            article_id: article.id,
            rule_type: "co_completed",
            detail: `${rule.from_kind} is completed but ${rule.to_kind} is not`,
          });
        }
      }
    }
  }

  const out = [
    `articles-validate: ${articles.length} article(s), ${violations.length} violation(s)`,
  ];
  if (violations.length === 0) {
    out.push("  ✓ all articles satisfied");
  } else {
    out.push("  ✗ violations:");
    for (const v of violations) {
      out.push(`    • [${v.article_id}] ${v.rule_type}: ${v.detail}`);
    }
  }

  return {
    passed: violations.length === 0,
    exit_code: violations.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr:
      violations.length === 0
        ? ""
        : `${violations.length} article violation(s)`,
    details: {
      articles_checked: articles.length,
      violations,
      violation_count: violations.length,
    },
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// -- bounded-context-audit --
// DDD: scan source files for cross-bounded-context imports.
// Each track in graph.tracks defines a bounded context with a scope.
// If a file in one track's scope directory imports from another track's scope,
// that's a boundary violation — cross-context communication must go through contracts.

async function runBoundedContextAudit(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const tracks = ctx.graph.tracks || [];
  if (tracks.length < 2) {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "bounded-context-audit: fewer than 2 tracks (passing vacuously — no cross-boundary possible)",
      stderr: "",
      details: {
        tracks_scanned: tracks.length,
        violations: [],
        violation_count: 0,
      },
    };
  }

  const srcDir = path.join(ctx.projectRoot, "src");
  const violations: Array<{
    file: string;
    line: number;
    from_scope: string;
    to_scope: string;
    import_path: string;
  }> = [];

  // Map scope → directory pattern
  const scopeDirs: Array<{ scope: string; dir: string; trackId: string }> = [];
  for (const track of tracks) {
    if (track.scope) {
      scopeDirs.push({
        scope: track.scope,
        dir: path.join(srcDir, track.scope),
        trackId: track.id,
      });
    }
  }

  if (scopeDirs.length < 2) {
    return {
      passed: true,
      exit_code: 0,
      stdout: `bounded-context-audit: ${tracks.length} track(s), but fewer than 2 have scope directories (passing)`,
      stderr: "",
      details: {
        tracks_scanned: tracks.length,
        scope_dirs: scopeDirs.length,
        violations: [],
        violation_count: 0,
      },
    };
  }

  // Scan each scope directory for imports from other scopes
  for (const scopeEntry of scopeDirs) {
    const files: string[] = [];
    await walkDir(scopeEntry.dir, async (fp) => {
      if (fp.endsWith(".ts") || fp.endsWith(".tsx") || fp.endsWith(".js"))
        files.push(fp);
    });

    for (const fp of files) {
      const content = await readUtf(fp);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match import ... from '...' or require('...')
        const importMatch = line.match(
          /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/,
        );
        if (!importMatch) continue;

        const importPath = importMatch[1] || importMatch[2];
        // Only check relative imports that cross scope boundaries
        if (!importPath.startsWith(".")) continue;

        // Resolve the import path relative to the file
        const resolvedDir = path.dirname(fp);
        const resolvedImport = path.resolve(resolvedDir, importPath);

        // Check if the resolved import is in a different scope
        for (const otherScope of scopeDirs) {
          if (otherScope.scope === scopeEntry.scope) continue;
          if (resolvedImport.startsWith(otherScope.dir)) {
            violations.push({
              file: rel(ctx.projectRoot, fp),
              line: i + 1,
              from_scope: scopeEntry.scope,
              to_scope: otherScope.scope,
              import_path: importPath,
            });
          }
        }
      }
    }
  }

  const out = [
    `bounded-context-audit: ${scopeDirs.length} scope(s) scanned, ${violations.length} violation(s)`,
  ];
  if (violations.length === 0) {
    out.push("  ✓ no cross-boundary imports detected");
  } else {
    out.push("  ✗ cross-boundary imports (must use contracts):");
    for (const v of violations.slice(0, 20)) {
      out.push(
        `    • ${v.file}:${v.line}: ${v.from_scope} → ${v.to_scope} (${v.import_path})`,
      );
    }
    if (violations.length > 20)
      out.push(`    ... +${violations.length - 20} more`);
  }

  return {
    passed: violations.length === 0,
    exit_code: violations.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr:
      violations.length === 0
        ? ""
        : `${violations.length} boundary violation(s)`,
    details: {
      tracks_scanned: tracks.length,
      scope_dirs: scopeDirs.length,
      violations,
      violation_count: violations.length,
    },
  };
}

// -- aggregate-invariant-check --
// DDD: verify that each aggregate in design/aggregates.md has documented invariants.
// Parse the artifact for aggregate definitions and invariant markers.

async function runAggregateInvariantCheck(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const artifactPath = path.join(
    ctx.projectRoot,
    ".spec-graph/artifacts/design/aggregates.md",
  );
  const stateEntry = ctx.state.artifacts?.["design/aggregates"];

  // Only validate if artifact is completed
  if (!stateEntry || stateEntry.status !== "completed") {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "aggregate-invariant-check: design/aggregates not completed (skipping)",
      stderr: "",
      details: {
        aggregates_found: 0,
        aggregates_without_invariants: 0,
        skipped: true,
      },
    };
  }

  let content: string;
  try {
    content = await readUtf(artifactPath);
  } catch {
    return {
      passed: false,
      exit_code: 1,
      stdout:
        "aggregate-invariant-check: artifact file not found: design/aggregates.md",
      stderr: "artifact file missing",
      details: { aggregates_found: 0, error: "file_not_found" },
    };
  }

  // Parse aggregate definitions (markdown headings with "聚合" or "Aggregate")
  const aggregateHeaders =
    content.match(/^#{2,4}\s+.*?(聚合|Aggregate)[:\s].*$/gim) || [];
  const aggregates = aggregateHeaders.map((h) =>
    h.replace(/^#{2,4}\s+/, "").trim(),
  );

  // Check each aggregate section for invariants
  const violations: Array<{ aggregate: string; reason: string }> = [];
  // Split content into level-2 sections (## headings only, not ### etc.)
  const sections = content.split(/(?=^##\s)/m);
  for (const agg of aggregates) {
    // Find the section that contains this aggregate name in its heading
    const section = sections.find((s) => {
      const firstLine = s.split("\n")[0];
      return firstLine.startsWith("##") && firstLine.includes(agg);
    });
    const sectionContent = section || "";

    // Check for invariant markers: "不变量", "Invariant", "INV-"
    const hasInvariant = /不变量|Invariant|INV-/i.test(sectionContent);
    if (!hasInvariant) {
      violations.push({ aggregate: agg, reason: "no invariants documented" });
    }
  }

  const out = [
    `aggregate-invariant-check: ${aggregates.length} aggregate(s), ${violations.length} without invariants`,
  ];
  if (violations.length === 0 && aggregates.length > 0) {
    out.push("  ✓ all aggregates have documented invariants");
  } else if (aggregates.length === 0) {
    out.push("  ⚠ no aggregates found in design/aggregates.md");
  } else {
    out.push("  ✗ aggregates missing invariants:");
    for (const v of violations) {
      out.push(`    • ${v.aggregate}: ${v.reason}`);
    }
  }

  return {
    passed: violations.length === 0,
    exit_code: violations.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr:
      violations.length === 0
        ? ""
        : `${violations.length} aggregate(s) without invariants`,
    details: {
      aggregates_found: aggregates.length,
      aggregates_without_invariants: violations.length,
      violations,
    },
  };
}

// -- context-map-consistency --
// DDD: cross-reference design/context-map.md with contract registry.
// Verify that declared context relationships have corresponding contract bindings.

async function runContextMapConsistency(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const artifactPath = path.join(
    ctx.projectRoot,
    ".spec-graph/artifacts/design/context-map.md",
  );
  const stateEntry = ctx.state.artifacts?.["design/context-map"];

  if (!stateEntry || stateEntry.status !== "completed") {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "context-map-consistency: design/context-map not completed (skipping)",
      stderr: "",
      details: { relationships_found: 0, skipped: true },
    };
  }

  let content: string;
  try {
    content = await readUtf(artifactPath);
  } catch {
    return {
      passed: true,
      exit_code: 0,
      stdout: "context-map-consistency: artifact file not found (skipping)",
      stderr: "",
      details: { relationships_found: 0, skipped: true },
    };
  }

  // Parse context relationships from markdown table rows
  // Looking for: | upstream | downstream | ACL/OHS/PL/CS/CF/PT | contract | ...
  const relationTypes = [
    "ACL",
    "OHS",
    "PL",
    "CS",
    "CF",
    "PT",
    "acl",
    "ohs",
    "pl",
    "customer-supplier",
    "conformist",
    "partnership",
  ];
  const relationPattern = new RegExp(
    `\\|\\s*([^|]+)\\s*\\|\\s*([^|]+)\\s*\\|\\s*(${relationTypes.join("|")})`,
    "gi",
  );

  const declaredRelations: Array<{
    upstream: string;
    downstream: string;
    type: string;
  }> = [];
  let match: RegExpExecArray | null;
  while ((match = relationPattern.exec(content)) !== null) {
    const upstream = match[1].trim();
    const downstream = match[2].trim();
    const type = match[3].trim();
    // Skip header rows
    if (upstream.includes("---") || downstream.includes("---")) continue;
    if (
      upstream.toLowerCase().includes("upstream") ||
      upstream.toLowerCase().includes("上游")
    )
      continue;
    declaredRelations.push({ upstream, downstream, type });
  }

  // Load contract registry
  const contractsDir = path.join(ctx.projectRoot, ".spec-graph", "contracts");
  const contracts: Array<{
    contract_id: string;
    producer: string;
    consumers: Array<{ consumer: string; relation_type?: string }>;
  }> = [];
  try {
    const files = await fs.readdir(contractsDir);
    for (const f of files.filter(
      (f: string) => f.endsWith(".yaml") || f.endsWith(".yml"),
    )) {
      const entry = await tryReadYaml<any>(path.join(contractsDir, f));
      if (entry) {
        contracts.push({
          contract_id: entry.contract_id || f,
          producer: entry.producer || "unknown",
          consumers: (entry.consumers || []).map((c: any) => ({
            consumer: c.consumer || "",
            relation_type: c.relation_type,
          })),
        });
      }
    }
  } catch {
    // No contracts dir — vacuous pass
  }

  // Cross-reference: declared relations should have matching contracts
  const warnings: string[] = [];
  for (const rel of declaredRelations) {
    const hasContract = contracts.some(
      (c) =>
        (c.producer === rel.upstream || c.producer.includes(rel.upstream)) &&
        c.consumers.some(
          (consumer) =>
            consumer.consumer === rel.downstream ||
            consumer.consumer.includes(rel.downstream),
        ),
    );
    if (!hasContract) {
      warnings.push(
        `declared ${rel.upstream} → ${rel.downstream} (${rel.type}) but no matching contract binding found`,
      );
    }
  }

  const out = [
    `context-map-consistency: ${declaredRelations.length} relation(s), ${contracts.length} contract(s), ${warnings.length} warning(s)`,
  ];
  if (warnings.length === 0) {
    out.push("  ✓ all declared context relationships have matching contracts");
  } else {
    out.push("  ⚠ mismatches:");
    for (const w of warnings) {
      out.push(`    • ${w}`);
    }
  }

  return {
    passed: true, // always passes — informational
    exit_code: 0,
    stdout: out.join("\n"),
    stderr: "",
    details: {
      relationships_found: declaredRelations.length,
      contracts_found: contracts.length,
      warnings,
      warning_count: warnings.length,
    },
  };
}

// -- domain-event-coverage --
// DDD: verify that events declared in design/domain-events.md have implementations.
// Parse artifact for event declarations, then scan source for event class/interface defs.

async function runDomainEventCoverage(
  ctx: BuiltinCheckContext,
): Promise<BuiltinCheckResult> {
  const artifactPath = path.join(
    ctx.projectRoot,
    ".spec-graph/artifacts/design/domain-events.md",
  );
  const stateEntry = ctx.state.artifacts?.["design/domain-events"];

  if (!stateEntry || stateEntry.status !== "completed") {
    return {
      passed: true,
      exit_code: 0,
      stdout:
        "domain-event-coverage: design/domain-events not completed (skipping)",
      stderr: "",
      details: { events_declared: 0, skipped: true },
    };
  }

  let content: string;
  try {
    content = await readUtf(artifactPath);
  } catch {
    return {
      passed: true,
      exit_code: 0,
      stdout: "domain-event-coverage: artifact file not found (skipping)",
      stderr: "",
      details: { events_declared: 0, skipped: true },
    };
  }

  // Parse event names from tables: | EventName | context | aggregate | description |
  // Or from headings: ### EventName
  const eventNames: string[] = [];

  // From table rows: first column of data rows (skip headers)
  const tableRows =
    content.match(
      /^\|\s+([A-Z][A-Za-z]+(?:Event|Occurred|Created|Updated|Deleted|Completed)?)\s+\|/gm,
    ) || [];
  for (const row of tableRows) {
    const name = row
      .replace(/^\|\s+/, "")
      .replace(/\s+\|$/, "")
      .trim();
    if (
      (name &&
        !name.includes("---") &&
        !name.toLowerCase().includes("event")) ||
      name.match(/^[A-Z]/)
    ) {
      eventNames.push(name);
    }
  }

  // From headings
  const headingEvents =
    content.match(/^#{2,4}\s+([A-Z][A-Za-z]+Event)/gm) || [];
  for (const h of headingEvents) {
    const name = h.replace(/^#{2,4}\s+/, "").trim();
    if (!eventNames.includes(name)) eventNames.push(name);
  }

  const uniqueEvents = [...new Set(eventNames)];

  // Scan source code for event implementations
  const srcDir = path.join(ctx.projectRoot, "src");
  const srcFiles: string[] = [];
  await walkDir(srcDir, async (fp) => {
    if (fp.endsWith(".ts") || fp.endsWith(".tsx")) srcFiles.push(fp);
  });

  const unimplemented: string[] = [];
  for (const event of uniqueEvents) {
    const found = srcFiles.some(async (fp) => {
      const c = await readUtf(fp);
      return c.includes(event) || c.includes(`${event}Event`);
    });
    // Note: the some() with async won't work correctly; use a sync approach
    let exists = false;
    for (const fp of srcFiles) {
      const c = await readUtf(fp);
      if (c.includes(event)) {
        exists = true;
        break;
      }
    }
    if (!exists) unimplemented.push(event);
  }

  const out = [
    `domain-event-coverage: ${uniqueEvents.length} event(s) declared, ${unimplemented.length} unimplemented`,
  ];
  if (unimplemented.length === 0 && uniqueEvents.length > 0) {
    out.push("  ✓ all declared events have implementations");
  } else if (uniqueEvents.length === 0) {
    out.push("  ⚠ no events declared in design/domain-events.md");
  } else {
    out.push("  ✗ events without implementation:");
    for (const e of unimplemented) {
      out.push(`    • ${e}`);
    }
  }

  return {
    passed: unimplemented.length === 0,
    exit_code: unimplemented.length === 0 ? 0 : 1,
    stdout: out.join("\n"),
    stderr:
      unimplemented.length === 0
        ? ""
        : `${unimplemented.length} event(s) not implemented`,
    details: {
      events_declared: uniqueEvents.length,
      events_implemented: uniqueEvents.length - unimplemented.length,
      unimplemented,
    },
  };
}
