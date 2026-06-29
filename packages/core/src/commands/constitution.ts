import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  Constitution,
  ConstitutionThresholds,
  ConstitutionArticle,
  Profile,
  Graph,
  CheckDecl,
} from "../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../utils/yaml";

export interface ConstitutionOptions {
  subcommand?: string;
  force?: boolean;
  json?: boolean;
  type?: string;
}

const CONSTITUTION_PATH = ".spec-graph/constitution.yaml";

const DEFAULT_THRESHOLDS: ConstitutionThresholds = {
  test_coverage: 0.8,
  cyclomatic_complexity: 15,
  ambiguity_score: 0,
  placeholder_count: 0,
  non_measurable_count: 5,
  lint_warnings: 0,
};

// Default command safety rules — inherit wdf-method SPEC §5.
// Whitelist: allowed command prefixes. Builtin sentinels `<...>` are always
// safe (dispatched to TS functions, not shell) and exempt from this list.
// Forbidden patterns: banned substrings — checked against the whole command
// string after the whitelist match. Covers shell metacharacters, network
// fetches, privilege escalation, and destructive globs.
const DEFAULT_COMMAND_WHITELIST = [
  "npm test",
  "npm run",
  "npx",
  "node",
  "jest",
  "vitest",
  "tsc",
  "eslint",
];

const DEFAULT_FORBIDDEN_PATTERNS = [
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

// Default constitutional articles — qualitative invariants (inherit spec-kit 9 Articles).
// These are sensible defaults; projects should customize to their needs.
const DEFAULT_ARTICLES: ConstitutionArticle[] = [
  {
    id: "story-has-ac",
    description: "Every story must have acceptance criteria",
    rule: {
      type: "required_section",
      artifact_kind: "plan/story",
      section: "Acceptance Criteria",
    },
  },
  {
    id: "c4-has-context",
    description: "C4 diagram must include a Context section",
    rule: {
      type: "required_section",
      artifact_kind: "design/c4",
      section: "Context",
    },
  },
];

export async function constitutionCommand(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const subcommand = options.subcommand || "show";
  try {
    switch (subcommand) {
      case "init":
        await initConstitution(projectRoot, options);
        break;
      case "show":
        await showConstitution(projectRoot, options);
        break;
      case "validate":
        await validateConstitution(projectRoot, options);
        break;
      case "diff-packs":
        await diffAgainstPacks(projectRoot, options);
        break;
      case "bump":
        await bumpConstitution(projectRoot, options);
        break;
      case "diff":
        await diffConstitution(projectRoot, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
        console.log("Available: init, show, validate, diff-packs, bump, diff");
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

// ============ init ============

async function initConstitution(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const constPath = path.join(projectRoot, CONSTITUTION_PATH);

  if (!options.force) {
    const existing = await tryReadYaml<Constitution>(constPath);
    if (existing) {
      console.log(
        chalk.yellow(`\n⚠ Constitution already exists at ${CONSTITUTION_PATH}`),
      );
      console.log(
        chalk.gray("  Use --force to overwrite, or edit the file directly.\n"),
      );
      return;
    }
  }

  const profile = await tryReadYaml<Profile>(
    path.join(projectRoot, ".spec-graph", "profile.yaml"),
  );
  const pkg = await tryReadPackageJson(projectRoot);

  const projectName =
    pkg?.name || profile?.meta?.source?.prompt || path.basename(projectRoot);
  const projectDescription = pkg?.description || "No description set";

  const now = new Date().toISOString();
  const constitution: Constitution = {
    version: "0.1.0",
    project_name: projectName,
    project_description: projectDescription,
    effective_date: now.split("T")[0],
    last_revised: now,
    quality: {
      thresholds: { ...DEFAULT_THRESHOLDS },
      required_linters: ["lint", "typecheck"],
      require_review_approvers: 1,
      articles: [...DEFAULT_ARTICLES],
    },
    traceability: {
      required_traces: defaultTraceRules(),
      require_ac_test_binding: true,
      require_commit_story_ref: true,
    },
    semver: {
      major_bump_on: [
        "contract-removed",
        "contract-breaking-change",
        "public-api-removed",
      ],
      minor_bump_on: ["contract-added", "feature-added"],
      patch_bump_on: ["bugfix", "internal-refactor"],
      deprecation_grace_releases: 2,
    },
    security: {
      command_whitelist: [...DEFAULT_COMMAND_WHITELIST],
      forbidden_patterns: [...DEFAULT_FORBIDDEN_PATTERNS],
    },
  };

  await writeYaml(constPath, constitution);

  console.log(
    chalk.green(`\n✓ Constitution initialized at ${CONSTITUTION_PATH}`),
  );
  console.log(`  Project: ${projectName}`);
  console.log(`  Version: ${constitution.version}`);
  console.log(`  Effective: ${constitution.effective_date}`);
  console.log(
    chalk.gray(
      `\n  Edit ${CONSTITUTION_PATH} to customize thresholds, traces, and semver policy.`,
    ),
  );
  console.log(
    chalk.gray(
      "  Run `spec-graph constitution validate` to check internal consistency.",
    ),
  );
  console.log(
    chalk.gray(
      "  Run `spec-graph constitution diff-packs` to find pack thresholds that diverge.\n",
    ),
  );
}

function defaultTraceRules() {
  return [
    {
      name: "story_to_prd",
      from_kind: "plan/story",
      to_kind: "requirement/prd",
      via: ["derives"],
      cardinality: "every" as const,
    },
    {
      name: "ac_to_test",
      from_kind: "plan/story",
      to_kind: "verification/test-report",
      via: ["verifies"],
      cardinality: "every" as const,
    },
    {
      name: "design_to_req",
      from_kind: "design/c4",
      to_kind: "requirement/prd",
      via: ["derives"],
      cardinality: "every" as const,
    },
  ];
}

async function tryReadPackageJson(projectRoot: string): Promise<any | null> {
  try {
    const content = await fs.readFile(
      path.join(projectRoot, "package.json"),
      "utf-8",
    );
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============ show ============

async function showConstitution(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const constitution = await loadConstitutionOrExit(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(constitution, null, 2));
    return;
  }

  console.log(chalk.bold(`\n📜 Constitution: ${constitution.project_name}\n`));
  console.log(`  Version:        ${constitution.version}`);
  console.log(`  Effective:      ${constitution.effective_date}`);
  console.log(`  Last revised:   ${constitution.last_revised}`);
  if (constitution.project_description) {
    console.log(`  Description:    ${constitution.project_description}`);
  }
  console.log("");

  console.log(chalk.bold("  📐 Quality Thresholds:"));
  const t = constitution.quality.thresholds;
  const thresholdRows: Array<[string, string]> = [
    [
      "test_coverage",
      t.test_coverage !== undefined
        ? `${(t.test_coverage * 100).toFixed(0)}%`
        : "-",
    ],
    ["cyclomatic_complexity", t.cyclomatic_complexity?.toString() || "-"],
    ["ambiguity_score", t.ambiguity_score?.toString() || "-"],
    ["placeholder_count", t.placeholder_count?.toString() || "-"],
    ["non_measurable_count", t.non_measurable_count?.toString() || "-"],
    ["lint_warnings", t.lint_warnings?.toString() || "-"],
  ];
  const tt = new Table({
    head: ["Threshold", "Value"],
    style: { head: ["cyan"] },
  });
  for (const r of thresholdRows) tt.push(r);
  console.log(tt.toString());

  console.log(
    `  Required linters:        ${constitution.quality.required_linters.join(", ")}`,
  );
  console.log(
    `  Required review approvers: ${constitution.quality.require_review_approvers}`,
  );
  console.log("");

  console.log(chalk.bold("  🔗 Traceability:"));
  console.log(
    `    AC↔Test binding required: ${constitution.traceability.require_ac_test_binding}`,
  );
  console.log(
    `    Commit→Story ref required: ${constitution.traceability.require_commit_story_ref}`,
  );
  console.log(`    Required traces:`);
  for (const r of constitution.traceability.required_traces) {
    console.log(
      `      • ${r.name}: ${r.from_kind} → ${r.to_kind} via ${r.via.join(",")} [${r.cardinality}]`,
    );
  }
  console.log("");

  console.log(chalk.bold("  📦 Semver Policy:"));
  console.log(`    MAJOR on: ${constitution.semver.major_bump_on.join(", ")}`);
  console.log(`    MINOR on: ${constitution.semver.minor_bump_on.join(", ")}`);
  console.log(`    PATCH on: ${constitution.semver.patch_bump_on.join(", ")}`);
  console.log(
    `    Deprecation grace: ${constitution.semver.deprecation_grace_releases} releases`,
  );
  console.log("");

  if (
    constitution.quality.articles &&
    constitution.quality.articles.length > 0
  ) {
    console.log(chalk.bold("  📜 Constitutional Articles:"));
    for (const a of constitution.quality.articles) {
      const rule = a.rule;
      let ruleDesc = "";
      if (rule.type === "required_section")
        ruleDesc = `${rule.artifact_kind} must have section "${rule.section}"`;
      else if (rule.type === "min_length")
        ruleDesc = `${rule.artifact_kind} must have ≥${rule.min_chars} chars`;
      else if (rule.type === "co_completed")
        ruleDesc = `if ${rule.from_kind} done → ${rule.to_kind} must be done`;
      console.log(`    • ${a.id}: ${a.description} [${ruleDesc}]`);
    }
    console.log("");
  }

  if (constitution.waivers && constitution.waivers.length > 0) {
    console.log(chalk.bold(chalk.yellow("  ⚠ Active Waivers:")));
    for (const w of constitution.waivers) {
      console.log(
        `    • ${w.rule_id}: ${w.reason} (expires ${w.expires_at}, approved by ${w.approved_by.join(", ")})`,
      );
    }
    console.log("");
  }
}

// ============ validate ============

async function validateConstitution(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const constitution = await loadConstitutionOrExit(projectRoot);
  const errors: string[] = [];
  const warnings: string[] = [];

  validateSchema(constitution, errors, warnings);
  const packDrift = await detectPackThresholdDrift(projectRoot, constitution);
  warnings.push(...packDrift);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          valid: errors.length === 0,
          errors,
          warnings,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(chalk.bold("\n🔍 Constitution Validation\n"));

  if (errors.length === 0 && warnings.length === 0) {
    console.log(
      chalk.green("  ✓ Constitution is valid and consistent with packs.\n"),
    );
    return;
  }

  if (errors.length > 0) {
    console.log(chalk.red("  ❌ Errors:"));
    for (const e of errors) console.log(chalk.red(`    • ${e}`));
  }
  if (warnings.length > 0) {
    console.log(chalk.yellow("  ⚠ Warnings:"));
    for (const w of warnings) console.log(chalk.yellow(`    • ${w}`));
  }
  console.log("");
  if (errors.length > 0) process.exit(1);
}

function validateSchema(
  c: Constitution,
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
    if (t.placeholder_count !== undefined && t.placeholder_count < 0) {
      warnings.push(
        `quality.thresholds.placeholder_count is negative — set to 0 to disable`,
      );
    }
  } else {
    errors.push("missing section: quality.thresholds");
  }

  if (!c.quality?.required_linters || c.quality.required_linters.length === 0) {
    warnings.push(
      "quality.required_linters is empty — at least one linter should be enforced",
    );
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

  if (
    c.semver?.deprecation_grace_releases !== undefined &&
    c.semver.deprecation_grace_releases < 0
  ) {
    errors.push("semver.deprecation_grace_releases must be ≥0");
  }

  if (c.quality?.articles) {
    const validRuleTypes = ["required_section", "min_length", "co_completed"];
    for (const a of c.quality.articles) {
      if (!a.id) errors.push("quality.articles: missing id");
      if (!a.description)
        warnings.push(`quality.articles[${a.id}]: missing description`);
      if (!a.rule || !validRuleTypes.includes(a.rule.type)) {
        errors.push(
          `quality.articles[${a.id}]: invalid rule type (must be one of: ${validRuleTypes.join(", ")})`,
        );
      } else {
        if (
          (a.rule.type === "required_section" ||
            a.rule.type === "min_length") &&
          !a.rule.artifact_kind
        ) {
          errors.push(`quality.articles[${a.id}]: missing artifact_kind`);
        }
        if (a.rule.type === "required_section" && !a.rule.section) {
          errors.push(`quality.articles[${a.id}]: missing section`);
        }
        if (
          a.rule.type === "min_length" &&
          (a.rule.min_chars === undefined || a.rule.min_chars < 1)
        ) {
          errors.push(`quality.articles[${a.id}]: min_chars must be ≥1`);
        }
        if (
          a.rule.type === "co_completed" &&
          (!a.rule.from_kind || !a.rule.to_kind)
        ) {
          errors.push(
            `quality.articles[${a.id}]: co_completed requires from_kind and to_kind`,
          );
        }
      }
    }
  }

  if (c.waivers) {
    for (const w of c.waivers) {
      if (!w.expires_at) errors.push(`waiver ${w.rule_id}: missing expires_at`);
      if (!w.approved_by || w.approved_by.length === 0) {
        errors.push(`waiver ${w.rule_id}: must have at least one approver`);
      }
    }
  }
}

async function detectPackThresholdDrift(
  projectRoot: string,
  constitution: Constitution,
): Promise<string[]> {
  const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
  const graph = await tryReadYaml<Graph>(graphPath);
  if (!graph) return [];

  const warnings: string[] = [];
  const checks: CheckDecl[] = graph.checks || [];
  const constT = constitution.quality.thresholds;

  const candidates: Array<{
    id: string;
    packValue: number | undefined;
    constValue: number | undefined;
    label: string;
  }> = [
    {
      id: "complexity-budget",
      packValue: (findCheck(checks, "complexity-budget")?.threshold as any)
        ?.cyclomatic,
      constValue: constT.cyclomatic_complexity,
      label: "threshold.cyclomatic",
    },
    {
      id: "clarify-scan",
      packValue: (findCheck(checks, "clarify-scan")?.threshold as any)
        ?.ambiguity,
      constValue: constT.ambiguity_score,
      label: "threshold.ambiguity",
    },
  ];

  for (const c of candidates) {
    if (
      c.constValue !== undefined &&
      c.packValue !== undefined &&
      c.constValue !== c.packValue
    ) {
      warnings.push(
        `${c.id}: pack declares ${c.label}=${c.packValue}, constitution says ${c.constValue} — constitution wins`,
      );
    }
  }

  return warnings;
}

// ============ diff-packs ============

async function diffAgainstPacks(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const constitution = await loadConstitutionOrExit(projectRoot);
  const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
  const graph = await tryReadYaml<Graph>(graphPath);
  if (!graph) {
    console.log(
      chalk.red("✗ graph.yaml not found. Run `spec-graph compose` first."),
    );
    process.exit(1);
    return;
  }

  const drifts = collectPackDrift(graph, constitution);

  if (options.json) {
    console.log(JSON.stringify({ drifts }, null, 2));
    return;
  }

  console.log(chalk.bold("\n📊 Constitution vs Pack Thresholds\n"));

  if (drifts.length === 0) {
    console.log(
      chalk.green("  ✓ All pack-declared thresholds match the constitution.\n"),
    );
    return;
  }

  const table = new Table({
    head: ["Check ID", "Pack Value", "Constitution Value", "Action"],
    style: { head: ["cyan"] },
  });

  for (const d of drifts) {
    table.push([
      d.check_id,
      d.pack_value?.toString() || "-",
      d.constitution_value?.toString() || "-",
      chalk.yellow("constitution wins"),
    ]);
  }
  console.log(table.toString());
  console.log(
    chalk.gray("\n  Constitution is the source of truth at runtime."),
  );
  console.log(
    chalk.gray(
      "  To silence this warning, align pack thresholds with the constitution (or vice versa).\n",
    ),
  );
}

function collectPackDrift(
  graph: Graph,
  constitution: Constitution,
): Array<{
  check_id: string;
  pack_value: number | undefined;
  constitution_value: number | undefined;
}> {
  const drifts: Array<{
    check_id: string;
    pack_value: number | undefined;
    constitution_value: number | undefined;
  }> = [];
  const checks: CheckDecl[] = graph.checks || [];
  const constT = constitution.quality.thresholds;

  const candidates: Array<{
    id: string;
    packValue: number | undefined;
    constValue: number | undefined;
  }> = [
    {
      id: "complexity-budget",
      packValue: findCheck(checks, "complexity-budget")?.threshold
        ?.cyclomatic as number | undefined,
      constValue: constT.cyclomatic_complexity,
    },
    {
      id: "clarify-scan",
      packValue: findCheck(checks, "clarify-scan")?.threshold?.ambiguity as
        | number
        | undefined,
      constValue: constT.ambiguity_score,
    },
    {
      id: "clarify-scan",
      packValue: findCheck(checks, "clarify-scan")?.threshold?.placeholder as
        | number
        | undefined,
      constValue: constT.placeholder_count,
    },
    {
      id: "clarify-scan",
      packValue: findCheck(checks, "clarify-scan")?.threshold
        ?.non_measurable as number | undefined,
      constValue: constT.non_measurable_count,
    },
  ];

  for (const c of candidates) {
    if (
      c.constValue !== undefined &&
      c.packValue !== undefined &&
      c.constValue !== c.packValue
    ) {
      drifts.push({
        check_id: c.id,
        pack_value: c.packValue,
        constitution_value: c.constValue,
      });
    }
  }
  return drifts;
}

function findCheck(checks: CheckDecl[], id: string): CheckDecl | undefined {
  return checks.find((c) => c.id === id);
}

// ============ bump ============

interface ConstitutionSnapshot {
  version: string;
  snapshot_at: string;
  constitution: Constitution;
}

const SNAPSHOT_PATH = ".spec-graph/.constitution-snapshot.json";

async function bumpConstitution(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const constitution = await loadConstitutionOrExit(projectRoot);
  const constPath = path.join(projectRoot, CONSTITUTION_PATH);
  const snapshotPath = path.join(projectRoot, SNAPSHOT_PATH);

  // Parse bump type from options (default: patch)
  const bumpType = (options as any).type || "patch";
  if (!["major", "minor", "patch"].includes(bumpType)) {
    console.log(
      chalk.red(
        `✗ Invalid bump type: ${bumpType}. Must be major, minor, or patch.`,
      ),
    );
    process.exit(1);
    return;
  }

  // Save current state as snapshot before bumping
  const snapshot: ConstitutionSnapshot = {
    version: constitution.version,
    snapshot_at: new Date().toISOString(),
    constitution: { ...constitution },
  };
  await writeYaml(snapshotPath, snapshot);

  // Bump version
  const newVersion = bumpSemver(constitution.version, bumpType);
  constitution.version = newVersion;
  constitution.last_revised = new Date().toISOString();

  await writeYaml(constPath, constitution);

  console.log(
    chalk.green(`\n✓ Constitution bumped: ${snapshot.version} → ${newVersion}`),
  );
  console.log(`  Snapshot saved: ${SNAPSHOT_PATH}`);
  console.log(
    chalk.gray(
      `\n  Run \`spec-graph constitution diff\` to see what changed since the snapshot.`,
    ),
  );
}

function bumpSemver(
  version: string,
  type: "major" | "minor" | "patch",
): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver: ${version}`);
  }

  const [major, minor, patch] = parts;
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

// ============ diff ============

async function diffConstitution(
  projectRoot: string,
  options: ConstitutionOptions,
): Promise<void> {
  const snapshotPath = path.join(projectRoot, SNAPSHOT_PATH);
  const snapshot = await tryReadYaml<ConstitutionSnapshot>(snapshotPath);

  if (!snapshot) {
    console.log(chalk.yellow("\n⚠ No constitution snapshot found."));
    console.log(
      chalk.gray(
        "  Run `spec-graph constitution bump` to create a snapshot.\n",
      ),
    );
    return;
  }

  const constitution = await loadConstitutionOrExit(projectRoot);
  const diff = computeConstitutionDiff(snapshot.constitution, constitution);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          from_version: snapshot.version,
          to_version: constitution.version,
          snapshot_at: snapshot.snapshot_at,
          diff,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    chalk.bold(
      `\n📊 Constitution Diff: ${snapshot.version} → ${constitution.version}\n`,
    ),
  );
  console.log(chalk.gray(`  Snapshot taken: ${snapshot.snapshot_at}\n`));

  if (
    diff.thresholds.added.length > 0 ||
    diff.thresholds.removed.length > 0 ||
    diff.thresholds.changed.length > 0
  ) {
    console.log(chalk.bold("  📐 Quality Thresholds:"));
    for (const t of diff.thresholds.added)
      console.log(chalk.green(`    + ${t.key}: ${t.value}`));
    for (const t of diff.thresholds.removed)
      console.log(chalk.red(`    - ${t.key}: ${t.value}`));
    for (const t of diff.thresholds.changed)
      console.log(chalk.yellow(`    ~ ${t.key}: ${t.old} → ${t.new}`));
    console.log("");
  }

  if (
    diff.articles.added.length > 0 ||
    diff.articles.removed.length > 0 ||
    diff.articles.changed.length > 0
  ) {
    console.log(chalk.bold("  📜 Constitutional Articles:"));
    for (const a of diff.articles.added)
      console.log(chalk.green(`    + ${a.id}: ${a.description}`));
    for (const a of diff.articles.removed)
      console.log(chalk.red(`    - ${a.id}: ${a.description}`));
    for (const a of diff.articles.changed)
      console.log(chalk.yellow(`    ~ ${a.id}: ${a.description}`));
    console.log("");
  }

  if (
    diff.traces.added.length > 0 ||
    diff.traces.removed.length > 0 ||
    diff.traces.changed.length > 0
  ) {
    console.log(chalk.bold("  🔗 Traceability Rules:"));
    for (const t of diff.traces.added)
      console.log(
        chalk.green(`    + ${t.name}: ${t.from_kind} → ${t.to_kind}`),
      );
    for (const t of diff.traces.removed)
      console.log(chalk.red(`    - ${t.name}: ${t.from_kind} → ${t.to_kind}`));
    for (const t of diff.traces.changed)
      console.log(
        chalk.yellow(`    ~ ${t.name}: ${t.from_kind} → ${t.to_kind}`),
      );
    console.log("");
  }

  if (diff.waivers.added.length > 0 || diff.waivers.removed.length > 0) {
    console.log(chalk.bold("  ⚠ Waivers:"));
    for (const w of diff.waivers.added)
      console.log(chalk.green(`    + ${w.rule_id}: ${w.reason}`));
    for (const w of diff.waivers.removed)
      console.log(chalk.red(`    - ${w.rule_id}: ${w.reason}`));
    console.log("");
  }

  const totalChanges =
    diff.thresholds.added.length +
    diff.thresholds.removed.length +
    diff.thresholds.changed.length +
    diff.articles.added.length +
    diff.articles.removed.length +
    diff.articles.changed.length +
    diff.traces.added.length +
    diff.traces.removed.length +
    diff.traces.changed.length +
    diff.waivers.added.length +
    diff.waivers.removed.length;

  if (totalChanges === 0) {
    console.log(chalk.green("  ✓ No changes detected since snapshot.\n"));
  } else {
    console.log(chalk.yellow(`  ⚠ ${totalChanges} change(s) detected.`));
    console.log(
      chalk.gray(
        `  Run \`spec-graph change sync <change-id>\` to see which artifacts need re-validation.\n`,
      ),
    );
  }
}

function computeConstitutionDiff(
  oldC: Constitution,
  newC: Constitution,
): {
  thresholds: {
    added: Array<{ key: string; value: any }>;
    removed: Array<{ key: string; value: any }>;
    changed: Array<{ key: string; old: any; new: any }>;
  };
  articles: {
    added: ConstitutionArticle[];
    removed: ConstitutionArticle[];
    changed: ConstitutionArticle[];
  };
  traces: { added: any[]; removed: any[]; changed: any[] };
  waivers: { added: any[]; removed: any[] };
} {
  const diff = {
    thresholds: {
      added: [] as any[],
      removed: [] as any[],
      changed: [] as any[],
    },
    articles: {
      added: [] as ConstitutionArticle[],
      removed: [] as ConstitutionArticle[],
      changed: [] as ConstitutionArticle[],
    },
    traces: { added: [] as any[], removed: [] as any[], changed: [] as any[] },
    waivers: { added: [] as any[], removed: [] as any[] },
  };

  // Thresholds
  const oldT = oldC.quality?.thresholds || {};
  const newT = newC.quality?.thresholds || {};
  const allKeys = new Set([...Object.keys(oldT), ...Object.keys(newT)]);
  for (const key of allKeys) {
    const oldVal = (oldT as any)[key];
    const newVal = (newT as any)[key];
    if (oldVal === undefined && newVal !== undefined) {
      diff.thresholds.added.push({ key, value: newVal });
    } else if (oldVal !== undefined && newVal === undefined) {
      diff.thresholds.removed.push({ key, value: oldVal });
    } else if (oldVal !== newVal) {
      diff.thresholds.changed.push({ key, old: oldVal, new: newVal });
    }
  }

  // Articles
  const oldArticles = new Map(
    (oldC.quality?.articles || []).map((a) => [a.id, a]),
  );
  const newArticles = new Map(
    (newC.quality?.articles || []).map((a) => [a.id, a]),
  );
  for (const [id, article] of newArticles) {
    if (!oldArticles.has(id)) {
      diff.articles.added.push(article);
    } else if (
      JSON.stringify(oldArticles.get(id)) !== JSON.stringify(article)
    ) {
      diff.articles.changed.push(article);
    }
  }
  for (const [id, article] of oldArticles) {
    if (!newArticles.has(id)) {
      diff.articles.removed.push(article);
    }
  }

  // Traces
  const oldTraces = new Map(
    (oldC.traceability?.required_traces || []).map((t) => [t.name, t]),
  );
  const newTraces = new Map(
    (newC.traceability?.required_traces || []).map((t) => [t.name, t]),
  );
  for (const [name, trace] of newTraces) {
    if (!oldTraces.has(name)) {
      diff.traces.added.push(trace);
    } else if (JSON.stringify(oldTraces.get(name)) !== JSON.stringify(trace)) {
      diff.traces.changed.push(trace);
    }
  }
  for (const [name, trace] of oldTraces) {
    if (!newTraces.has(name)) {
      diff.traces.removed.push(trace);
    }
  }

  // Waivers
  const oldWaivers = new Set((oldC.waivers || []).map((w) => w.rule_id));
  const newWaivers = new Set((newC.waivers || []).map((w) => w.rule_id));
  for (const w of newC.waivers || []) {
    if (!oldWaivers.has(w.rule_id)) diff.waivers.added.push(w);
  }
  for (const w of oldC.waivers || []) {
    if (!newWaivers.has(w.rule_id)) diff.waivers.removed.push(w);
  }

  return diff;
}

// ============ helpers ============

export async function loadConstitution(
  projectRoot: string,
): Promise<Constitution | null> {
  return tryReadYaml<Constitution>(path.join(projectRoot, CONSTITUTION_PATH));
}

async function loadConstitutionOrExit(
  projectRoot: string,
): Promise<Constitution> {
  const c = await loadConstitution(projectRoot);
  if (!c) {
    console.log(
      chalk.red(
        "✗ Constitution not found. Run `spec-graph constitution init` first.",
      ),
    );
    process.exit(1);
    throw new Error("unreachable");
  }
  return c;
}
