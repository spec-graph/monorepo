import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Graph } from "../types/index";
import { readYaml, writeYaml } from "../utils/yaml";
import {
  getPreset,
  savePermissions,
  PermissionLevel,
} from "../engine/permissions/index";

export interface DoctorOptions {
  json?: boolean;
  fix?: boolean;
}

export type CheckSeverity = "ok" | "warn" | "error";

export interface DoctorCheck {
  id: string;
  category: string;
  severity: CheckSeverity;
  message: string;
  detail?: string;
}

export interface DoctorReport {
  ok: boolean;
  errors: number;
  warnings: number;
  checks: DoctorCheck[];
}

export async function doctorCommand(
  projectRoot: string,
  options: DoctorOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const checks: DoctorCheck[] = [];

  // ── Category: init ──
  await checkInit(projectRoot, specGraphDir, checks);
  // ── Category: compose ──
  let graph: Graph | null = await checkCompose(specGraphDir, checks);
  // ── Category: state ──
  await checkState(specGraphDir, graph, checks);
  // ── Category: permissions ──
  await checkPermissions(specGraphDir, checks);
  // ── Category: traces ──
  await checkTraces(specGraphDir, graph, checks);
  // ── Category: consistency ──
  if (graph) {
    await checkConsistency(specGraphDir, graph, checks);
  }
  // ── Category: env ──
  checkEnv(checks);
  // ── Category: features ──
  await checkFeatures(projectRoot, specGraphDir, graph, checks);

  // Auto-fix
  if (options.fix) {
    const fixed = await autoFix(projectRoot, specGraphDir, checks);
    if (fixed > 0) {
      checks.push({
        id: "fix-summary",
        category: "fix",
        severity: "ok",
        message: `${fixed} issue(s) auto-fixed`,
      });
    }
  }

  // Sort by severity: error > warn > ok
  checks.sort((a, b) => {
    const order: Record<CheckSeverity, number> = { error: 0, warn: 1, ok: 2 };
    return order[a.severity] - order[b.severity];
  });

  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warn").length;
  const ok = errors === 0;

  if (options.json) {
    console.log(JSON.stringify({ ok, errors, warnings, checks }, null, 2));
    return;
  }

  // ── Header ──
  console.log(chalk.bold("\n🏥 spec-graph Doctor\n"));
  const statusIcon = ok ? chalk.green("✓") : chalk.red("✗");
  console.log(
    `  Status: ${statusIcon} ${errors} error(s), ${warnings} warning(s)\n`,
  );

  // ── Category groups ──
  const categories = [
    "init",
    "compose",
    "state",
    "permissions",
    "traces",
    "consistency",
    "features",
    "env",
    "fix",
  ];
  for (const cat of categories) {
    const catChecks = checks.filter((c) => c.category === cat);
    if (catChecks.length === 0) continue;
    console.log(chalk.bold(`  ${catLabel(cat)}`));
    for (const c of catChecks) {
      const icon =
        c.severity === "ok"
          ? chalk.green("  ✓")
          : c.severity === "warn"
            ? chalk.yellow("  ⚠")
            : chalk.red("  ✗");
      console.log(`${icon} ${c.message}`);
      if (c.detail) {
        console.log(chalk.gray(`    ${c.detail}`));
      }
    }
    console.log("");
  }

  if (!ok) {
    console.log(
      chalk.yellow(
        "  Run `spec-graph doctor --fix` to auto-fix recoverable issues.\n",
      ),
    );
    process.exitCode = 1;
  } else {
    console.log(chalk.green("  All checks passed.\n"));
  }
}

// ── Individual check functions ──

async function checkInit(
  projectRoot: string,
  specGraphDir: string,
  checks: DoctorCheck[],
): Promise<void> {
  // Directory exists
  try {
    await fs.access(specGraphDir);
    checks.push({
      id: "init-dir",
      category: "init",
      severity: "ok",
      message: ".spec-graph/ directory exists",
    });
  } catch {
    checks.push({
      id: "init-dir",
      category: "init",
      severity: "error",
      message: ".spec-graph/ directory is missing",
      detail: "Run `spec-graph init` first",
    });
    return; // Cannot check further
  }

  // profile.yaml
  const profilePath = path.join(specGraphDir, "profile.yaml");
  try {
    await fs.access(profilePath);
    const profile = await readYaml<any>(profilePath);
    if (profile && profile.facts) {
      checks.push({
        id: "init-profile",
        category: "init",
        severity: "ok",
        message: "profile.yaml is valid",
      });
    } else {
      checks.push({
        id: "init-profile",
        category: "init",
        severity: "warn",
        message: "profile.yaml exists but may be incomplete",
      });
    }
  } catch {
    checks.push({
      id: "init-profile",
      category: "init",
      severity: "warn",
      message: "profile.yaml is missing",
      detail: "Run `spec-graph sense` to regenerate",
    });
  }

  // permissions.yaml
  const permPath = path.join(specGraphDir, "permissions.yaml");
  try {
    await fs.access(permPath);
    checks.push({
      id: "init-permissions",
      category: "init",
      severity: "ok",
      message: "permissions.yaml exists",
    });
  } catch {
    checks.push({
      id: "init-permissions",
      category: "init",
      severity: "warn",
      message: "permissions.yaml is missing",
      detail: "Run `spec-graph permissions set --level=semi-auto` to create",
    });
  }
}

async function checkCompose(
  specGraphDir: string,
  checks: DoctorCheck[],
): Promise<Graph | null> {
  const graphPath = path.join(specGraphDir, "graph.yaml");
  try {
    await fs.access(graphPath);
  } catch {
    checks.push({
      id: "compose-graph",
      category: "compose",
      severity: "error",
      message: "graph.yaml is missing",
      detail: "Run `spec-graph compose` first",
    });
    return null;
  }

  let graph: Graph;
  try {
    graph = await readYaml<Graph>(graphPath);
  } catch (e: any) {
    checks.push({
      id: "compose-parse",
      category: "compose",
      severity: "error",
      message: `graph.yaml is invalid YAML: ${e.message}`,
    });
    return null;
  }

  // Validate structure
  const issues: string[] = [];
  if (!graph.version) issues.push("missing version");
  if (!graph.meta) issues.push("missing meta");
  if (!graph.pipeline_skeleton) issues.push("missing pipeline_skeleton");
  if (!graph.pipeline_skeleton?.stages?.length)
    issues.push("no pipeline stages defined");

  if (issues.length > 0) {
    checks.push({
      id: "compose-structure",
      category: "compose",
      severity: "error",
      message: "graph.yaml has structural issues",
      detail: issues.join("; "),
    });
    return graph;
  }

  checks.push({
    id: "compose-graph",
    category: "compose",
    severity: "ok",
    message: `graph.yaml is valid (${graph.artifacts?.length || 0} artifacts, ${graph.checks?.length || 0} checks, ${graph.gates?.length || 0} gates, ${graph.pipeline_skeleton.stages.length} stages)`,
  });

  // Check for empty graph (no artifacts/checks/gates at all)
  if (
    !graph.artifacts?.length &&
    !graph.checks?.length &&
    !graph.gates?.length
  ) {
    checks.push({
      id: "compose-empty",
      category: "compose",
      severity: "warn",
      message: "graph has no artifacts, checks, or gates",
      detail:
        "The compose step may not have matched any packs. Check your profile.",
    });
  }

  return graph;
}

async function checkState(
  specGraphDir: string,
  graph: Graph | null,
  checks: DoctorCheck[],
): Promise<void> {
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    await fs.access(statePath);
  } catch {
    checks.push({
      id: "state-file",
      category: "state",
      severity: "error",
      message: "machine-state.yaml is missing",
      detail: "Run `spec-graph prime` to seed state",
    });
    return;
  }

  let state: any;
  try {
    state = await readYaml<any>(statePath);
  } catch (e: any) {
    checks.push({
      id: "state-parse",
      category: "state",
      severity: "error",
      message: `machine-state.yaml is invalid YAML: ${e.message}`,
    });
    return;
  }

  if (!state.current_stage) {
    checks.push({
      id: "state-structure",
      category: "state",
      severity: "error",
      message: "machine state missing current_stage",
      detail: "State file may be corrupted. Run `spec-graph prime` to re-seed.",
    });
    return;
  }

  const artifacts = Object.keys(state.artifacts || {}).length;
  const checksCount = Object.keys(state.checks || {}).length;
  checks.push({
    id: "state-structure",
    category: "state",
    severity: "ok",
    message: `machine state valid (stage: ${state.current_stage}, ${artifacts} artifacts, ${checksCount} checks)`,
  });
}

async function checkPermissions(
  specGraphDir: string,
  checks: DoctorCheck[],
): Promise<void> {
  const permPath = path.join(specGraphDir, "permissions.yaml");

  try {
    await fs.access(permPath);
  } catch {
    return; // Already reported in init check
  }

  let perms: any;
  try {
    perms = await readYaml<any>(permPath);
  } catch (e: any) {
    checks.push({
      id: "perms-parse",
      category: "permissions",
      severity: "error",
      message: `permissions.yaml is invalid YAML: ${e.message}`,
    });
    return;
  }

  if (!perms.level) {
    checks.push({
      id: "perms-level",
      category: "permissions",
      severity: "warn",
      message: "permissions.yaml has no level set",
      detail: "Run `spec-graph permissions set --level=semi-auto`",
    });
    return;
  }

  const validLevels: PermissionLevel[] = [
    "full-auto",
    "semi-auto",
    "manual",
    "custom",
  ];
  if (!validLevels.includes(perms.level)) {
    checks.push({
      id: "perms-level",
      category: "permissions",
      severity: "error",
      message: `Invalid permission level: ${perms.level}`,
      detail: `Must be one of: ${validLevels.join(", ")}`,
    });
    return;
  }

  checks.push({
    id: "perms-level",
    category: "permissions",
    severity: "ok",
    message: `permissions valid (level: ${perms.level})`,
  });
}

async function checkTraces(
  specGraphDir: string,
  graph: Graph | null,
  checks: DoctorCheck[],
): Promise<void> {
  const tracesDir = path.join(specGraphDir, "traces");

  let entries: string[];
  try {
    entries = (await fs.readdir(tracesDir)).filter((e) => e.endsWith(".yaml"));
  } catch {
    // No traces directory — not an error if no traces are required
    if (
      graph &&
      (graph.gates || []).some((g) => (g.require_traces || []).length > 0)
    ) {
      checks.push({
        id: "traces-dir",
        category: "traces",
        severity: "warn",
        message: "traces/ directory missing but gates require traces",
        detail: "Run `spec-graph prime` to create trace skeletons",
      });
    } else {
      checks.push({
        id: "traces-dir",
        category: "traces",
        severity: "ok",
        message: "no traces needed",
      });
    }
    return;
  }

  if (entries.length === 0) {
    if (
      graph &&
      (graph.gates || []).some((g) => (g.require_traces || []).length > 0)
    ) {
      checks.push({
        id: "traces-empty",
        category: "traces",
        severity: "warn",
        message: "no trace files found but gates require traces",
        detail: "Run `spec-graph prime` to create trace skeletons",
      });
    } else {
      checks.push({
        id: "traces-empty",
        category: "traces",
        severity: "ok",
        message: "no traces needed",
      });
    }
    return;
  }

  let validCount = 0;
  let invalidCount = 0;
  let placeholderCount = 0;

  for (const entry of entries) {
    try {
      const trace = await readYaml<any>(path.join(tracesDir, entry));
      if (!trace.traces || !Array.isArray(trace.traces)) {
        invalidCount++;
        checks.push({
          id: `trace-${entry}`,
          category: "traces",
          severity: "warn",
          message: `${entry}: invalid structure (missing traces array)`,
        });
        continue;
      }
      validCount++;

      // Count placeholders
      for (const t of trace.traces) {
        if (isPlaceholder(t.from) || isPlaceholder(t.to)) {
          placeholderCount++;
        }
      }
    } catch (e: any) {
      invalidCount++;
      checks.push({
        id: `trace-${entry}`,
        category: "traces",
        severity: "error",
        message: `${entry}: invalid YAML — ${e.message}`,
      });
    }
  }

  const parts: string[] = [`${validCount} valid`];
  if (invalidCount > 0) parts.push(`${invalidCount} invalid`);
  if (placeholderCount > 0) parts.push(`${placeholderCount} placeholder(s)`);

  checks.push({
    id: "traces-summary",
    category: "traces",
    severity: invalidCount > 0 ? "warn" : placeholderCount > 0 ? "warn" : "ok",
    message: `trace files: ${parts.join(", ")}`,
    detail:
      placeholderCount > 0
        ? "Run `spec-graph artifact complete <id>` to auto-wire placeholders"
        : undefined,
  });
}

async function checkConsistency(
  specGraphDir: string,
  graph: Graph,
  checks: DoctorCheck[],
): Promise<void> {
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  let state: any;
  try {
    state = await readYaml<any>(statePath);
  } catch {
    return; // Already reported
  }

  // Orphaned state entries (in state but not in graph)
  const graphArtifactIds = new Set((graph.artifacts || []).map((a) => a.id));
  const stateArtifactIds = Object.keys(state.artifacts || {});
  const orphanArtifacts = stateArtifactIds.filter(
    (id) => !graphArtifactIds.has(id),
  );

  if (orphanArtifacts.length > 0) {
    checks.push({
      id: "consistency-orphan-artifacts",
      category: "consistency",
      severity: "warn",
      message: `${orphanArtifacts.length} orphaned artifact(s) in state (not in graph)`,
      detail: orphanArtifacts.join(", "),
    });
  }

  const graphCheckIds = new Set((graph.checks || []).map((c) => c.id));
  const stateCheckIds = Object.keys(state.checks || {});
  const orphanChecks = stateCheckIds.filter((id) => !graphCheckIds.has(id));

  if (orphanChecks.length > 0) {
    checks.push({
      id: "consistency-orphan-checks",
      category: "consistency",
      severity: "warn",
      message: `${orphanChecks.length} orphaned check(s) in state (not in graph)`,
      detail: orphanChecks.join(", "),
    });
  }

  // Missing state entries (in graph but not in state)
  const missingArtifacts = (graph.artifacts || []).filter(
    (a) => !stateArtifactIds.includes(a.id),
  );
  if (missingArtifacts.length > 0) {
    checks.push({
      id: "consistency-missing-artifacts",
      category: "consistency",
      severity: "warn",
      message: `${missingArtifacts.length} artifact(s) in graph but not seeded in state`,
      detail: `${missingArtifacts.map((a) => a.id).join(", ")}. Run \`spec-graph prime\` to seed.`,
    });
  }

  const missingChecks = (graph.checks || []).filter(
    (c) => !stateCheckIds.includes(c.id),
  );
  if (missingChecks.length > 0) {
    checks.push({
      id: "consistency-missing-checks",
      category: "consistency",
      severity: "warn",
      message: `${missingChecks.length} check(s) in graph but not seeded in state`,
      detail: `${missingChecks.map((c) => c.id).join(", ")}. Run \`spec-graph prime\` to seed.`,
    });
  }

  // Stage consistency
  if (state.current_stage && graph.pipeline_skeleton?.stages) {
    if (!graph.pipeline_skeleton.stages.includes(state.current_stage)) {
      checks.push({
        id: "consistency-stage",
        category: "consistency",
        severity: "error",
        message: `current stage "${state.current_stage}" is not in graph pipeline stages`,
        detail: `Pipeline stages: ${graph.pipeline_skeleton.stages.join(", ")}`,
      });
    }
  }

  if (
    orphanArtifacts.length === 0 &&
    orphanChecks.length === 0 &&
    missingArtifacts.length === 0 &&
    missingChecks.length === 0
  ) {
    checks.push({
      id: "consistency-ok",
      category: "consistency",
      severity: "ok",
      message: "graph and state are consistent",
    });
  }
}

async function checkFeatures(
  projectRoot: string,
  specGraphDir: string,
  graph: Graph | null,
  checks: DoctorCheck[],
): Promise<void> {
  // Hooks
  const hooksPath = path.join(specGraphDir, "hooks.yaml");
  try {
    await fs.access(hooksPath);
    checks.push({
      id: "feat-hooks",
      category: "features",
      severity: "ok",
      message: "Hooks system configured (.spec-graph/hooks.yaml)",
    });
  } catch {
    checks.push({
      id: "feat-hooks",
      category: "features",
      severity: "warn",
      message: "Hooks system available but not configured",
      detail: "Create .spec-graph/hooks.yaml to add pre/post command hooks",
    });
  }

  // Diff-select (touchfiles on checks)
  if (graph) {
    const checksWithTouchfiles = (graph.checks || []).filter(
      (c: any) => c.touchfiles && c.touchfiles.length > 0,
    );
    const periodicChecks = (graph.checks || []).filter(
      (c: any) => c.tier === "periodic",
    );
    if (checksWithTouchfiles.length > 0) {
      checks.push({
        id: "feat-diff-select",
        category: "features",
        severity: "ok",
        message: `Diff-select active (${checksWithTouchfiles.length} checks with touchfiles, ${periodicChecks.length} periodic)`,
      });
    } else {
      checks.push({
        id: "feat-diff-select",
        category: "features",
        severity: "warn",
        message: "Diff-select available but no checks declare touchfiles",
        detail: "Add touchfiles field to checks in pack.yaml for selective execution",
      });
    }
  }

  // Safety-net snapshot
  const snapshotPath = path.join(specGraphDir, "safety-net-snapshot.yaml");
  try {
    await fs.access(snapshotPath);
    checks.push({
      id: "feat-safety-net",
      category: "features",
      severity: "ok",
      message: "Safety-net baseline snapshot exists",
    });
  } catch {
    checks.push({
      id: "feat-safety-net",
      category: "features",
      severity: "warn",
      message: "Safety-net available but no baseline captured",
      detail: "Run `spec-graph safety-net` before refactoring to capture baseline",
    });
  }

  // Constitution
  const constPath = path.join(specGraphDir, "constitution.yaml");
  try {
    await fs.access(constPath);
    checks.push({
      id: "feat-constitution",
      category: "features",
      severity: "ok",
      message: "Quality constitution configured",
    });
  } catch {
    checks.push({
      id: "feat-constitution",
      category: "features",
      severity: "warn",
      message: "No quality constitution",
      detail: "Run `spec-graph constitution init` to set quality thresholds",
    });
  }

  // Project config
  const configPath = path.join(specGraphDir, "config.yaml");
  try {
    await fs.access(configPath);
    checks.push({
      id: "feat-config",
      category: "features",
      severity: "ok",
      message: "Project-level config.yaml configured",
    });
  } catch {
    checks.push({
      id: "feat-config",
      category: "features",
      severity: "warn",
      message: "Project config available but not configured",
      detail: "Run `spec-graph config init` to inject project context",
    });
  }

  // Scope locks
  const isolationDir = path.join(specGraphDir, "isolation");
  try {
    const lockFiles = await fs.readdir(isolationDir);
    if (lockFiles.length > 0) {
      checks.push({
        id: "feat-scope",
        category: "features",
        severity: "ok",
        message: `${lockFiles.length} active scope lock(s)`,
      });
    }
  } catch {
    // No isolation directory - that's fine
  }
}

function checkEnv(checks: DoctorCheck[]): void {
  // Check git
  if (process.env.SPEC_GRAPH_ROOT) {
    checks.push({
      id: "env-root",
      category: "env",
      severity: "ok",
      message: `SPEC_GRAPH_ROOT is set (${process.env.SPEC_GRAPH_ROOT})`,
    });
  }
}

async function autoFix(
  projectRoot: string,
  specGraphDir: string,
  checks: DoctorCheck[],
): Promise<number> {
  let fixed = 0;

  // Fix: missing state file — run prime (simplified: just create empty valid state)
  if (checks.some((c) => c.id === "state-file" && c.severity === "error")) {
    try {
      const graph = await readYaml<any>(
        path.join(specGraphDir, "graph.yaml"),
      ).catch(() => null);
      if (graph) {
        const initialStage = graph.pipeline_skeleton?.stages?.[0] || "start";
        const state = {
          current_stage: initialStage,
          stage_history: [],
          artifacts: {},
          checks: {},
          metadata: {
            created_at: new Date().toISOString(),
            change_type: graph.meta?.change_type,
          },
        };
        await writeYaml(path.join(specGraphDir, "machine-state.yaml"), state);
        fixed++;

        // Update the check
        const idx = checks.findIndex((c) => c.id === "state-file");
        if (idx >= 0) {
          checks[idx] = {
            id: "state-file",
            category: "state",
            severity: "ok",
            message: "machine-state.yaml created (auto-fixed)",
          };
        }
      }
    } catch {
      /* fix failed */
    }
  }

  // Fix: missing permissions.yaml — create with semi-auto
  if (
    checks.some((c) => c.id === "init-permissions" && c.severity === "warn")
  ) {
    try {
      const config = getPreset("semi-auto");
      await savePermissions(projectRoot, config);
      fixed++;

      const idx = checks.findIndex((c) => c.id === "init-permissions");
      if (idx >= 0) {
        checks[idx] = {
          id: "init-permissions",
          category: "init",
          severity: "ok",
          message: "permissions.yaml created (auto-fixed)",
        };
      }
    } catch {
      /* fix failed */
    }
  }

  return fixed;
}

// ── Helpers ──

function catLabel(cat: string): string {
  const labels: Record<string, string> = {
    init: "📁 Project Initialization",
    compose: "📐 Graph Composition",
    state: "⚙️  Machine State",
    permissions: "🔐 Permissions",
    traces: "🔗 Trace Files",
    consistency: "🔍 Graph/State Consistency",
    features: "🚀 Enhanced Features",
    env: "🌍 Environment",
    fix: "🔧 Auto-Fix",
  };
  return labels[cat] || cat;
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith("<") && value.endsWith(">");
}
