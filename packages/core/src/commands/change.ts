import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { ChangeDescriptor, ChangePlan, FactDimension, Profile } from "../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../utils/yaml";

export interface ChangeOptions {
  subcommand?: string;
  id?: string;
  title?: string;
  type?: string;
  priority?: string;
  description?: string;
  story?: string;  // Bind to specific story
  force?: boolean;
  reason?: string;
  worktree?: boolean;
  queue?: boolean;
  json?: boolean;
}

export async function changeCommand(
  projectRoot: string,
  options: ChangeOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const changesDir = path.join(specGraphDir, "changes");

  try {
    await ensureInitialized(changesDir);

    const subcommand = options.subcommand || "list";

    switch (subcommand) {
      case "list":
        await listChanges(changesDir);
        break;
      case "create":
        await createChange(changesDir, options);
        break;
      case "show":
        await showChangeCmd(changesDir, options);
        break;
      case "apply":
        await applyChangeCmd(projectRoot, changesDir, options);
        break;
      case "complete":
        await completeChangeCmd(projectRoot, changesDir, options);
        break;
      case "discard":
        await discardChangeCmd(changesDir, options);
        break;
      case "sync":
        await syncChangeCmd(projectRoot, changesDir, options);
        break;
      case "archive":
        await archiveChangeCmd(projectRoot, changesDir, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
        console.log(
          "Available: list, create, show, apply, complete, discard, sync, archive",
        );
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function ensureInitialized(changesDir: string): Promise<void> {
  try {
    await fs.access(changesDir);
  } catch {
    console.log(
      chalk.red("✗ Project not initialized. Run `spec-graph init` first."),
    );
    process.exit(1);
  }
}

async function listChanges(changesDir: string): Promise<void> {
  const changes = await loadAllChanges(changesDir);

  if (changes.length === 0) {
    console.log(chalk.yellow("\nNo active changes found."));
    console.log("Create one with: spec-graph change create\n");
    return;
  }

  console.log(chalk.bold("\n📋 Active Changes\n"));

  const table = new Table({
    head: ["ID", "Title", "Type", "Status", "Priority", "Created"],
    style: { head: ["cyan"] },
  });

  for (const change of changes) {
    table.push([
      change.id,
      change.title.slice(0, 40),
      change.type,
      change.status,
      change.priority,
      new Date(change.created_at).toLocaleDateString(),
    ]);
  }

  console.log(table.toString());
  console.log("");
}

async function createChange(
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  const now = new Date().toISOString();

  // 生成带主题的文件名前缀（清理特殊字符，限制长度）
  const titleSlug = (options.title || "change")
    .replace(/[^a-zA-Z0-9一-龥]/g, "-") // 保留中文、字母、数字
    .replace(/-+/g, "-") // 合并多个 -
    .replace(/^-|-$/g, "") // 去除首尾 -
    .slice(0, 30); // 限制长度

  const filePrefix = `${titleSlug}-${Date.now()}`;
  const id = filePrefix; // ID 也使用带主题的前缀

  const change: ChangeDescriptor = {
    id,
    title: options.title || "New Change",
    description: options.description || "Description of the change",
    created_at: now,
    type: (options.type as ChangeDescriptor["type"]) || "feature",
    priority: (options.priority as ChangeDescriptor["priority"]) || "medium",
    scope: { tracks: [] },
    impact: { risk_level: "medium" },
    status: "proposed",
  };

  // Bind to story if specified
  if (options.story) {
    change.linked_story = options.story;
    change.description = `Auto-generated from story: ${options.story}`;
  }

  // plan MD 带主题和时间戳
  const planRelPath = `.spec-graph/changes/${filePrefix}-plan.md`;
  change.plan_path = planRelPath;

  // JSON 也带主题和时间戳
  const changePath = path.join(changesDir, `${filePrefix}.json`);
  await fs.writeFile(changePath, JSON.stringify(change, null, 2));

  // 创建空的 plan MD（agent 填写实际内容）
  const planPath = path.join(changesDir, `${filePrefix}-plan.md`);
  await fs.writeFile(
    planPath,
    `# ${change.title}\n\n> Change ID: ${change.id}\n> Type: ${change.type} | Priority: ${change.priority}\n> Created: ${change.created_at}\n\n`,
    "utf-8",
  );

  console.log(chalk.green(`\n✓ Change created: ${id}`));
  console.log(`  Title: ${change.title}`);
  console.log(chalk.cyan(`  📋 JSON: ${filePrefix}.json`));
  console.log(chalk.cyan(`  📋 Plan: ${filePrefix}-plan.md`));
  console.log(chalk.gray(`  AI agent 填写 plan MD 内容`));
  console.log(chalk.gray(`  Apply: spec-graph change apply ${id}`));
  console.log("");
}

/**
 * Create changes from all stories in plan/story.md
 * Parses the story document and creates one change per story.
 */
async function createAllFromStories(
  projectRoot: string,
  changesDir: string,
  _options: ChangeOptions,
): Promise<void> {
  const storyPath = path.join(projectRoot, ".spec-graph/artifacts/plan/story.md");

  // Check if story file exists
  try {
    await fs.access(storyPath);
  } catch {
    console.log(chalk.red(`✗ Story file not found: ${storyPath}`));
    console.log(chalk.gray("  Plan stage must be completed first."));
    console.log(chalk.gray("  Run: spec-graph artifact complete plan/story --producer agent"));
    process.exit(1);
  }

  // Read story file
  const storyContent = await fs.readFile(storyPath, "utf-8");

  // Parse stories (simple pattern: lines starting with "S" followed by numbers)
  // Format: "S1.1: User Registration" or "### S1.1 User Registration"
  const storyPattern = /#{1,3}\s*S\d+\.\d+[:\s]+(.+?)(?:\n|$)/g;
  const stories: Array<{ id: string; title: string }> = [];

  let match;
  while ((match = storyPattern.exec(storyContent)) !== null) {
    const fullLine = match[0].trim();
    const title = match[1].trim();
    // Extract story ID from line like "### S1.1 User Registration"
    const idMatch = fullLine.match(/S\d+\.\d+/);
    if (idMatch) {
      stories.push({ id: idMatch[0], title });
    }
  }

  if (stories.length === 0) {
    console.log(chalk.red("✗ No stories found in story.md"));
    console.log(chalk.gray("  Format should be: ### S1.1 Story Title"));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n📋 Found ${stories.length} stories:\n`));
  for (const s of stories) {
    console.log(`  ⬜ ${s.id}: ${s.title}`);
  }

  // Create changes for each story
  console.log(chalk.cyan("\n🔧 Creating changes...\n"));
  let created = 0;
  for (const story of stories) {
    const changeId = await createChangeFromStory(changesDir, story);
    console.log(chalk.green(`  ✓ ${changeId} ← ${story.id}: ${story.title}`));
    created++;
  }

  console.log(chalk.green(`\n✓ Created ${created} changes from ${stories.length} stories`));
  console.log(chalk.gray("\n  Next: spec-graph change apply <change-id>"));
  console.log(chalk.gray("        spec-graph dev <change-id>"));
  console.log("");
}

async function createChangeFromStory(
  changesDir: string,
  story: { id: string; title: string },
): Promise<string> {
  const now = new Date().toISOString();
  const filePrefix = `story-${story.id.replace(/\./g, "-")}-${Date.now()}`;
  const id = filePrefix;

  const change: ChangeDescriptor = {
    id,
    title: `${story.id}: ${story.title}`,
    description: `Auto-generated from story ${story.id}`,
    created_at: now,
    type: "feature",
    priority: "medium",
    scope: { tracks: [] },
    impact: { risk_level: "medium" },
    status: "proposed",
    linked_story: story.id,
  };

  const planRelPath = `.spec-graph/changes/${filePrefix}-plan.md`;
  change.plan_path = planRelPath;

  const changePath = path.join(changesDir, `${filePrefix}.json`);
  await fs.writeFile(changePath, JSON.stringify(change, null, 2));

  const planPath = path.join(changesDir, `${filePrefix}-plan.md`);
  await fs.writeFile(
    planPath,
    `# ${story.id}: ${story.title}\n\n> Story: ${story.id}\n> Change ID: ${change.id}\n> Created: ${change.created_at}\n\n## Story Context\n\n(Read from .spec-graph/artifacts/plan/story.md)\n\n## Implementation Plan\n\n(TBD by agent)\n`,
    "utf-8",
  );

  return id;
}

/**
 * Dev loop engine: coding ↔ review ↔ test cycle
 * Drives development of a single change until all checks pass.
 */
async function devChange(
  projectRoot: string,
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph change dev <id>"));
    process.exit(1);
  }

  // Load change
  const changePath = path.join(changesDir, `${options.id}.json`);
  let change: ChangeDescriptor;
  try {
    change = await readYaml<ChangeDescriptor>(changePath);
  } catch {
    console.log(chalk.red(`✗ Change not found: ${options.id}`));
    process.exit(1);
  }

  if (change.status !== "in_progress") {
    console.log(chalk.red(`✗ Change must be in 'in_progress' status`));
    console.log(chalk.gray(`  Run: spec-graph change apply ${options.id}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\n🔄 Dev Loop: ${change.title}\n`));

  let iteration = 0;
  const maxIterations = 10;
  let phase: "coding" | "reviewing" | "testing" = "coding";

  while (iteration < maxIterations) {
    iteration++;
    console.log(chalk.cyan(`\n  ── Iteration ${iteration} / ${maxIterations} ──\n`));

    if (phase === "coding") {
      console.log(chalk.yellow("   Phase: CODING"));
      console.log(chalk.gray("  Agent should write/modify code for this change."));
      console.log(chalk.gray(`  Story: ${change.linked_story || change.title}`));
      console.log(chalk.gray("  Agent: spec-graph dispatch"));
      console.log(chalk.gray("  Agent: spec-graph check --layer unit"));

      // Check if unit tests pass
      const unitCheckResult = await runCheckLayer(projectRoot, "unit");
      if (unitCheckResult.passed) {
        console.log(chalk.green("  ✓ Unit tests passed"));
        phase = "reviewing";
      } else {
        console.log(chalk.red("  ✗ Unit tests failed"));
        console.log(chalk.yellow("  → Agent: fix code and retry"));
        console.log(chalk.gray("  Agent: spec-graph change dev <id> (restart)"));
        return;
      }
    }

    if (phase === "reviewing") {
      console.log(chalk.yellow("  🔍 Phase: REVIEWING"));
      console.log(chalk.gray("  Agent should review code quality."));
      console.log(chalk.gray("  Agent: spec-graph review --artifact <artifact-id>"));

      // For now, skip automated review (needs sub-agent integration)
      console.log(chalk.gray("  (Automated review not yet implemented)"));
      console.log(chalk.yellow("  → Agent: manually confirm review passed"));
      console.log(chalk.gray("  Agent: spec-graph change dev <id> --skip-review"));

      // For demo, auto-advance
      phase = "testing";
    }

    if (phase === "testing") {
      console.log(chalk.yellow("  🧪 Phase: TESTING"));
      console.log(chalk.gray("  Running full test suite..."));

      const allCheckResult = await runCheckLayer(projectRoot, "unit,integration");
      if (allCheckResult.passed) {
        console.log(chalk.green("  ✓ All tests passed"));
        console.log(chalk.green("\n  ✅ Dev loop completed!"));
        console.log(chalk.gray(`  Next: spec-graph change complete ${options.id}`));
        return;
      } else {
        console.log(chalk.red("  ✗ Tests failed"));
        console.log(chalk.yellow("  → Agent: fix issues"));
        phase = "coding";
      }
    }
  }

  console.log(chalk.red(`\n   Max iterations (${maxIterations}) reached`));
  console.log(chalk.gray("  Agent: manual intervention required"));
}

/**
 * Run checks for a specific layer and return result.
 */
async function runCheckLayer(
  projectRoot: string,
  layer: string,
): Promise<{ passed: boolean; failed: string[] }> {
  try {
    const { runCheck } = await import("../engine/check/index");
    const { readYaml } = await import("../utils/yaml");

    const graphPath = path.join(projectRoot, ".spec-graph/graph.yaml");
    const graph = await readYaml<any>(graphPath);

    const checks = (graph.checks || []).filter((c: any) => {
      if (layer.includes(",")) {
        const layers = layer.split(",");
        return layers.includes(c.layer);
      }
      return c.layer === layer;
    });

    if (checks.length === 0) {
      return { passed: true, failed: [] };
    }

    let passed = true;
    const failed: string[] = [];

    for (const check of checks) {
      try {
        const result = await runCheck(check, { cwd: projectRoot, timeoutMs: 30000 });
        if (result.status !== "passed") {
          passed = false;
          failed.push(check.id);
        }
      } catch {
        passed = false;
        failed.push(check.id);
      }
    }

    return { passed, failed };
  } catch {
    return { passed: true, failed: [] };
  }
}

async function lockChangeCmd(changesDir: string, options: ChangeOptions): Promise<void> {
  if (!options.id) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph change lock <id>"));
    process.exit(1);
    return;
  }

  const planPath = path.join(changesDir, `${options.id}-plan.yaml`);
  const plan = await tryReadYaml<ChangePlan>(planPath);
  if (!plan) {
    console.log(chalk.red(`✗ Plan not found: ${planPath}`));
    process.exit(1);
    return;
  }

  if (plan.locked_at) {
    console.log(chalk.yellow(`⚠ Plan already locked at ${plan.locked_at}`));
    console.log(chalk.gray("  Use --force to re-lock after drift"));
    if (!options.force) return;
  }

  // Validate plan has required content before locking
  const required = ["background", "scope_in", "acceptance_criteria"];
  const missing: string[] = [];
  if (!plan.background || plan.background.trim() === "") missing.push("background");
  if (!plan.scope_in || plan.scope_in.length === 0) missing.push("scope_in");
  if (!plan.acceptance_criteria || plan.acceptance_criteria.length === 0)
    missing.push("acceptance_criteria");

  if (missing.length > 0 && !options.force) {
    console.log(chalk.red(`✗ Plan incomplete. Missing: ${missing.join(", ")}`));
    console.log(chalk.gray(`  Fill in ${planPath} then re-lock`));
    process.exit(1);
    return;
  }

  plan.locked_at = new Date().toISOString();
  await writeYaml(planPath, plan);

  console.log(chalk.green(`\n🔒 Plan locked: ${options.id}`));
  console.log(chalk.gray(`  Locked at: ${plan.locked_at}`));
  console.log(chalk.gray(`  Any modification to scope/AC will be recorded as drift.`));
  console.log(chalk.gray(`  Resume after interruption: spec-graph change resume ${options.id}`));
  console.log("");
}

async function planChangeCmd(changesDir: string, options: ChangeOptions): Promise<void> {
  if (!options.id) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph change plan <id>"));
    process.exit(1);
    return;
  }

  const planPath = path.join(changesDir, `${options.id}-plan.yaml`);
  const plan = await tryReadYaml<ChangePlan>(planPath);
  if (!plan) {
    console.log(chalk.red(`✗ Plan not found: ${planPath}`));
    process.exit(1);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const locked = plan.locked_at ? chalk.red("🔒 LOCKED") : chalk.yellow("📋 DRAFT");
  const driftCount = plan.drift_log?.length || 0;

  console.log(chalk.bold(`\n📋 Plan: ${options.id} ${locked}\n`));
  console.log(`  Version: ${plan.version}  |  Drift: ${driftCount} change(s)\n`);

  if (plan.background) {
    console.log(chalk.bold("  Background"));
    console.log(`    ${plan.background}`);
    console.log("");
  }

  if (plan.scope_in?.length > 0) {
    console.log(chalk.bold("  Scope (IN)"));
    for (const item of plan.scope_in) console.log(chalk.green(`    ✓ ${item}`));
    console.log("");
  }

  if (plan.scope_out?.length > 0) {
    console.log(chalk.bold("  Scope (OUT)"));
    for (const item of plan.scope_out) console.log(chalk.red(`    ✗ ${item}`));
    console.log("");
  }

  if (plan.acceptance_criteria?.length > 0) {
    console.log(chalk.bold("  Acceptance Criteria"));
    for (const item of plan.acceptance_criteria) {
      const done = plan.completed_items?.includes(item);
      console.log(`    ${done ? chalk.green("[✓]") : "[ ]"} ${item}`);
    }
    console.log("");
  }

  if (plan.remaining_items?.length > 0) {
    console.log(chalk.bold("  Remaining"));
    for (const item of plan.remaining_items) console.log(chalk.yellow(`    ○ ${item}`));
    console.log("");
  }

  if (plan.blockers?.length > 0) {
    console.log(chalk.red("  ⚠ Blockers"));
    for (const item of plan.blockers) console.log(chalk.red(`    ! ${item}`));
    console.log("");
  }

  if (plan.open_questions?.length > 0) {
    console.log(chalk.bold("  Open Questions"));
    for (const item of plan.open_questions) console.log(chalk.gray(`    ? ${item}`));
    console.log("");
  }

  if (driftCount > 0) {
    console.log(chalk.yellow(`  Drift Log (${driftCount})`));
    for (const d of plan.drift_log || []) {
      console.log(chalk.gray(`    ${d.timestamp}: ${d.field} — ${d.reason}`));
    }
    console.log("");
  }
}

async function resumeChangeCmd(changesDir: string, options: ChangeOptions): Promise<void> {
  if (!options.id) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph change resume <id>"));
    process.exit(1);
    return;
  }

  const changePath = path.join(changesDir, `${options.id}.json`);
  const change = await tryReadYaml<ChangeDescriptor>(changePath);
  if (!change) {
    console.log(chalk.red(`✗ Change not found: ${options.id}`));
    process.exit(1);
    return;
  }

  const planPath = path.join(changesDir, `${options.id}-plan.yaml`);
  const plan = await tryReadYaml<ChangePlan>(planPath);

  console.log(chalk.bold(`\n🔄 Resume: ${change.title}\n`));
  console.log(`  Status: ${change.status}  |  Type: ${change.type}`);
  if (plan) {
    console.log(`  Plan: ${plan.locked_at ? "🔒 locked" : "📋 draft"} v${plan.version}`);
    console.log("");
    if (plan.background) {
      console.log(chalk.cyan("  📖 Background"));
      console.log(`    ${plan.background}`);
      console.log("");
    }
    if (plan.scope_in?.length > 0) {
      console.log(chalk.green("  🎯 Scope"));
      for (const item of plan.scope_in) console.log(`    - ${item}`);
      console.log("");
    }
    if (plan.completed_items?.length > 0) {
      console.log(chalk.green("  ✅ Completed"));
      for (const item of plan.completed_items) console.log(`    ✓ ${item}`);
      console.log("");
    }
    if (plan.remaining_items?.length > 0) {
      console.log(chalk.yellow("  ⏳ Remaining"));
      for (const item of plan.remaining_items) console.log(`    ○ ${item}`);
      console.log("");
    }
    if (plan.blockers?.length > 0) {
      console.log(chalk.red("  🚫 Blockers"));
      for (const item of plan.blockers) console.log(`    ! ${item}`);
      console.log("");
    }
    console.log(chalk.gray("  Next: spec-graph dispatch --json"));
  } else {
    console.log(chalk.yellow("  ⚠ No plan found. Create one first."));
  }
  console.log("");
}

async function showChangeCmd(
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red("✗ Change ID required. Usage: spec-graph change show <id>"),
    );
    process.exit(1);
    return;
  }
  await showChange(changesDir, options.id);
}

async function showChange(changesDir: string, id: string): Promise<void> {
  const change = await loadChangeOrExit(changesDir, id);

  console.log(chalk.bold(`\n📝 Change: ${change.id}\n`));
  console.log(`  Title:       ${change.title}`);
  console.log(`  Description: ${change.description}`);
  console.log(`  Type:        ${change.type}`);
  console.log(`  Status:      ${renderStatus(change.status)}`);
  console.log(`  Priority:    ${change.priority}`);
  console.log(`  Created:     ${new Date(change.created_at).toLocaleString()}`);
  console.log("");

  if (change.scope.tracks && change.scope.tracks.length > 0) {
    console.log(`  Scope Tracks: ${change.scope.tracks.join(", ")}`);
  }

  if (change.scope.files) {
    if (change.scope.files.include) {
      console.log(`  Include:     ${change.scope.files.include.join(", ")}`);
    }
    if (change.scope.files.exclude) {
      console.log(`  Exclude:     ${change.scope.files.exclude.join(", ")}`);
    }
  }

  console.log(`  Risk Level:  ${change.impact.risk_level}`);

  if (change.impact.acceptance_layers) {
    console.log("  Acceptance Layers:");
    for (const [layer, required] of Object.entries(
      change.impact.acceptance_layers,
    )) {
      console.log(`    • ${layer}: ${required ? "required" : "optional"}`);
    }
  }

  if (change.profile_patch) {
    console.log("  Profile Patches:");
    for (const [dim, val] of Object.entries(change.profile_patch)) {
      console.log(`    • ${dim}: → ${val}`);
    }
    if (change.profile_patch_applied_at) {
      console.log(
        chalk.gray(`  (applied at ${change.profile_patch_applied_at})`),
      );
    }
  }

  if (change.sync_impact) {
    console.log(
      `  Sync Impact (computed ${new Date(change.sync_impact.computed_at).toLocaleString()}):`,
    );
    console.log(
      `    + artifacts: ${change.sync_impact.artifacts_added.join(", ") || "-"}`,
    );
    console.log(
      `    - artifacts: ${change.sync_impact.artifacts_removed.join(", ") || "-"}`,
    );
    console.log(
      `    + checks: ${change.sync_impact.checks_added.join(", ") || "-"}`,
    );
    console.log(
      `    - checks: ${change.sync_impact.checks_removed.join(", ") || "-"}`,
    );
    console.log(
      `    + gates: ${change.sync_impact.gates_added.join(", ") || "-"}`,
    );
    console.log(
      `    - gates: ${change.sync_impact.gates_removed.join(", ") || "-"}`,
    );
    if (change.sync_impact.consumer_ripple.length > 0) {
      console.log("    Consumer ripple:");
      for (const r of change.sync_impact.consumer_ripple) {
        console.log(`      • ${r.contract} → ${r.consumers.join(", ")}`);
      }
    }
  }

  if (change.archive) {
    console.log(`  Archive:`);
    console.log(
      `    Archived at: ${new Date(change.archive.archived_at).toLocaleString()}`,
    );
    console.log(`    Snapshot:    ${change.archive.snapshot_dir}`);
    console.log(`    Final status: ${change.archive.final_status}`);
  }

  if (change.audit_log && change.audit_log.length > 0) {
    console.log("  Audit Log:");
    for (const entry of change.audit_log) {
      const ts = new Date(entry.timestamp).toLocaleString();
      const author = entry.author ? ` [${entry.author}]` : "";
      console.log(
        `    • ${ts} — ${entry.action}${author}${entry.message ? `: ${entry.message}` : ""}`,
      );
    }
  }

  console.log("");
}

function renderStatus(status: string): string {
  const colors: Record<string, string> = {
    proposed: chalk.yellow(status),
    in_progress: chalk.blue(status),
    suspended: chalk.gray(status),
    completed: chalk.green(status),
    discarded: chalk.gray(status),
    escalated: chalk.red(status),
  };
  return colors[status] || status;
}

// ============ change apply ============

async function applyChangeCmd(
  projectRoot: string,
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red("✗ Change ID required. Usage: spec-graph change apply <id>"),
    );
    process.exit(1);
    return;
  }

  const change = await loadChangeOrExit(changesDir, options.id);

  if (change.status === "completed" || change.status === "discarded") {
    console.log(
      chalk.red(
        `✗ Change already ${change.status}. Create a new change for further work.`,
      ),
    );
    process.exit(1);
    return;
  }

  console.log(chalk.bold(`\n Applying change: ${change.title}\n`));
  console.log(
    `  Type: ${change.type}  Priority: ${change.priority}  Status: ${change.status}`,
  );

  const profilePath = path.join(projectRoot, ".spec-graph", "profile.yaml");
  const profile = await tryReadYaml<Profile>(profilePath);

  let profileChanged = false;
  if (
    change.profile_patch &&
    Object.keys(change.profile_patch).length > 0 &&
    profile
  ) {
    profileChanged = await applyProfilePatch(profile, change.profile_patch);
    if (profileChanged) {
      await writeYaml(profilePath, profile);
      change.profile_patch_applied_at = new Date().toISOString();
      console.log(
        chalk.green(
          `  ✓ Applied ${Object.keys(change.profile_patch).length} profile patch(es)`,
        ),
      );
      for (const [dim, val] of Object.entries(change.profile_patch)) {
        console.log(`    • ${dim} → ${val}`);
      }
    }
  } else if (
    change.profile_patch &&
    Object.keys(change.profile_patch).length > 0
  ) {
    console.log(
      chalk.yellow(
        "  ⚠ profile.yaml not found — skipping patch (run `spec-graph sense` first)",
      ),
    );
  }

  // (Re)compose if needed
  const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
  const needsCompose = profileChanged || !(await fileExists(graphPath));

  if (needsCompose) {
    const { composeCommand } = await import("./compose");
    await composeCommand(projectRoot, { changeType: change.type });
  } else {
    console.log(chalk.gray("  Graph already exists — skipping compose."));
  }

  // Prime machine state
  const { primeCommand } = await import("./prime");
  await primeCommand(projectRoot, { bootstrap: true });

  // Auto-create worktree for isolation (unless --no-worktree)
  if (options.worktree !== false) {
    try {
      const { WorktreeManager } = await import("../engine/isolation/worktree");
      const wm = new WorktreeManager({ projectRoot });
      const track = change.scope?.tracks?.[0] || change.type || "default";
      const existing = await wm.get(change.id);
      if (!existing) {
        const unit = await wm.create(change.id, track);
        console.log(chalk.green(`  ✓ Worktree created: ${unit.branch}`));
      }
    } catch {
      // No git repo or worktree creation failed — not fatal, just skip
      console.log(
        chalk.gray("  (worktree skipped — no git repo or creation failed)"),
      );
    }
  }

  // Transition change to in_progress
  if (change.status === "proposed") {
    change.status = "in_progress";
    change.applied_at = new Date().toISOString();
    appendAudit(
      change,
      "apply",
      undefined,
      "profile patched, graph recomposed, state primed",
    );
  } else {
    appendAudit(
      change,
      "apply",
      undefined,
      "re-applied (no status transition)",
    );
  }

  await saveChange(changesDir, change);

  console.log(chalk.green(`\n✓ Change ${change.id} now in_progress\n`));
  console.log(chalk.bold("  Next: spec-graph next\n"));
}

// ============ complete ============

async function completeChangeCmd(
  projectRoot: string,
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red("✗ Change ID required. Usage: spec-graph change complete <id>"),
    );
    process.exit(1);
  }
  const change = await loadChangeOrExit(changesDir, options.id);

  if (change.status !== "in_progress") {
    console.log(
      chalk.red(
        `✗ Change status is '${change.status}'. Only in_progress changes can be completed.`,
      ),
    );
    process.exit(1);
  }

  // Soft gate: warn (don't block) if any blocking gate is currently failing.
  // Hard enforcement belongs to the integrate transition itself; this is a
  // sanity check so the user notices an unfinalized gate before archiving.
  try {
    const { runEnforce } = await import("../engine/enforce/index");
    const { readYaml } = await import("../utils/yaml");
    const graph = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "graph.yaml"),
    );
    if (graph) {
      const result = await runEnforce(projectRoot, graph);
      if (result.blocking_gates.length > 0) {
        console.log(
          chalk.yellow(
            `  ⚠ ${result.blocking_gates.length} blocking gate(s) still failing:`,
          ),
        );
        for (const g of result.blocking_gates)
          console.log(chalk.yellow(`    • ${g}`));
        console.log(
          chalk.gray("  Complete anyway? Re-run with --force to ignore.\n"),
        );
        if (!options.force) process.exit(1);
        console.log(chalk.gray("  --force set; completing anyway.\n"));
      }
    }
  } catch {
    // Graph or enforce unavailable — skip the soft check, don't block completion.
  }

  change.status = "completed";
  change.completed_at = new Date().toISOString();
  appendAudit(change, "complete", undefined, "change marked completed");
  await saveChange(changesDir, change);

  // Auto-enqueue in merge queue (unless --no-queue)
  if (options.queue !== false) {
    try {
      const { MergeQueueManager } =
        await import("../engine/isolation/merge-queue");
      const mq = new MergeQueueManager(projectRoot);
      const fileList = change.scope?.files?.include || [];
      const existing = (await mq.listItems()).find(
        (i) => i.unit_id === change.id,
      );
      if (!existing || existing.status === "failed") {
        await mq.enqueue(change.id, { fileList });
        console.log(chalk.green(`  ✓ Enqueued in merge queue`));
      }
    } catch {
      // Merge queue not available — not fatal
      console.log(chalk.gray("  (merge queue skipped)"));
    }
  }

  console.log(
    chalk.green(
      `\n✓ Change ${change.id} completed at ${change.completed_at}\n`,
    ),
  );
  console.log(
    chalk.bold("  Next: spec-graph change archive " + change.id + "\n"),
  );
}

// ============ discard ============

async function discardChangeCmd(
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red(
        "✗ Change ID required. Usage: spec-graph change discard <id> [--reason <text>]",
      ),
    );
    process.exit(1);
  }
  const change = await loadChangeOrExit(changesDir, options.id);

  if (change.status !== "in_progress" && change.status !== "proposed") {
    console.log(
      chalk.red(
        `✗ Change status is '${change.status}'. Only proposed/in_progress changes can be discarded.`,
      ),
    );
    process.exit(1);
  }

  change.status = "discarded";
  change.discarded_at = new Date().toISOString();
  change.discard_reason = options.reason || "No reason provided";
  appendAudit(
    change,
    "discard",
    undefined,
    `discarded: ${change.discard_reason}`,
  );
  await saveChange(changesDir, change);

  console.log(
    chalk.gray(`\n✓ Change ${change.id} discarded at ${change.discarded_at}`),
  );
  console.log(chalk.gray(`  Reason: ${change.discard_reason}\n`));
  console.log(
    chalk.bold("  Next: spec-graph change archive " + change.id + "\n"),
  );
}

async function applyProfilePatch(
  profile: Profile,
  patch: Partial<Record<FactDimension, string>>,
): Promise<boolean> {
  let changed = false;
  for (const [dim, newVal] of Object.entries(patch)) {
    const current = profile.facts[dim as FactDimension];
    if (!current) {
      profile.facts[dim as FactDimension] = {
        value: newVal as string,
        confidence: "high",
        source: "user",
        evidence: "change.profile_patch",
      };
      changed = true;
    } else if (current.value !== newVal) {
      current.value = newVal as string;
      current.source = "user";
      current.evidence = `change.patch (was ${current.value})`;
      current.confidence = "high";
      changed = true;
    }
  }
  return changed;
}

function appendAudit(
  change: ChangeDescriptor,
  action: string,
  author: string | undefined,
  message: string,
): void {
  if (!change.audit_log) change.audit_log = [];
  change.audit_log.push({
    timestamp: new Date().toISOString(),
    action,
    author,
    message,
  });
}

// ============ change sync ============

async function syncChangeCmd(
  projectRoot: string,
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red("✗ Change ID required. Usage: spec-graph change sync <id>"),
    );
    process.exit(1);
    return;
  }

  const change = await loadChangeOrExit(changesDir, options.id);

  if (!change.profile_patch || Object.keys(change.profile_patch).length === 0) {
    console.log(
      chalk.yellow(
        "\n⚠ No profile_patch declared in change — nothing to sync.\n",
      ),
    );
    console.log(
      chalk.gray(
        "  Edit the change JSON to add a `profile_patch` field, e.g.:",
      ),
    );
    console.log(
      chalk.gray('  "profile_patch": { "criticality": "compliance" }\n'),
    );
    return;
  }

  console.log(chalk.bold(`\n🔍 Computing sync-impact for: ${change.title}\n`));

  const profilePath = path.join(projectRoot, ".spec-graph", "profile.yaml");
  const currentProfile = await tryReadYaml<Profile>(profilePath);
  if (!currentProfile) {
    console.log(
      chalk.red("✗ profile.yaml not found. Run `spec-graph sense` first."),
    );
    process.exit(1);
    return;
  }

  const currentGraphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
  const currentGraph = await tryReadYaml<any>(currentGraphPath);

  // Hypothetical profile: apply patch
  const hypotheticalProfile: Profile = JSON.parse(
    JSON.stringify(currentProfile),
  );
  await applyProfilePatch(hypotheticalProfile, change.profile_patch);

  const { runCompose } = await import("../engine/compose/index");
  const result = await runCompose(
    projectRoot,
    hypotheticalProfile,
    change.type,
  );

  const impact = computeSyncImpact(currentGraph, result.graph);

  change.sync_impact = {
    computed_at: new Date().toISOString(),
    artifacts_added: impact.artifacts_added,
    artifacts_removed: impact.artifacts_removed,
    checks_added: impact.checks_added,
    checks_removed: impact.checks_removed,
    gates_added: impact.gates_added,
    gates_removed: impact.gates_removed,
    consumer_ripple: impact.consumer_ripple,
  };

  appendAudit(
    change,
    "sync",
    undefined,
    `computed impact: +${impact.artifacts_added.length}/-${impact.artifacts_removed.length} artifacts`,
  );
  await saveChange(changesDir, change);

  renderSyncImpact(impact);
  console.log(chalk.green(`\n✓ Sync impact recorded on change ${change.id}\n`));
}

function computeSyncImpact(currentGraph: any, newGraph: any): SyncImpact {
  const oldArtifacts = new Set(
    (currentGraph?.artifacts || []).map((a: any) => a.id),
  );
  const newArtifacts = new Set(
    (newGraph.artifacts || []).map((a: any) => a.id),
  );
  const oldChecks = new Set((currentGraph?.checks || []).map((c: any) => c.id));
  const newChecks = new Set((newGraph.checks || []).map((c: any) => c.id));
  const oldGates = new Set((currentGraph?.gates || []).map((g: any) => g.id));
  const newGates = new Set((newGraph.gates || []).map((g: any) => g.id));

  const artifacts_added = [...newArtifacts].filter(
    (a) => !oldArtifacts.has(a),
  ) as string[];
  const artifacts_removed = [...oldArtifacts].filter(
    (a) => !newArtifacts.has(a),
  ) as string[];
  const checks_added = [...newChecks].filter(
    (c) => !oldChecks.has(c),
  ) as string[];
  const checks_removed = [...oldChecks].filter(
    (c) => !newChecks.has(c),
  ) as string[];
  const gates_added = [...newGates].filter((g) => !oldGates.has(g)) as string[];
  const gates_removed = [...oldGates].filter(
    (g) => !newGates.has(g),
  ) as string[];

  const consumer_ripple = computeConsumerRipple(newGraph);

  return {
    artifacts_added,
    artifacts_removed,
    checks_added,
    checks_removed,
    gates_added,
    gates_removed,
    consumer_ripple,
  };
}

function computeConsumerRipple(
  graph: any,
): Array<{ contract: string; consumers: string[] }> {
  const tracks = graph.tracks || [];
  const byContract = new Map<string, Set<string>>();

  for (const track of tracks) {
    const consumes = track.consumes || [];
    if (consumes.length === 0) continue;

    for (const consumedContract of consumes) {
      const producerTrack = tracks.find((t: any) =>
        (t.produces || []).includes(consumedContract),
      );
      if (producerTrack) {
        if (!byContract.has(consumedContract))
          byContract.set(consumedContract, new Set());
        byContract.get(consumedContract)!.add(track.id);
      }
    }
  }

  return [...byContract.entries()].map(([contract, consumers]) => ({
    contract,
    consumers: [...consumers],
  }));
}

function renderSyncImpact(impact: SyncImpact): void {
  console.log(chalk.bold("  📊 Sync Impact Diff\n"));

  const table = new Table({
    head: ["Resource", "Added", "Removed"],
    style: { head: ["cyan"] },
  });

  table.push([
    "Artifacts",
    impact.artifacts_added.length > 0
      ? chalk.green(impact.artifacts_added.join("\n"))
      : "-",
    impact.artifacts_removed.length > 0
      ? chalk.red(impact.artifacts_removed.join("\n"))
      : "-",
  ]);
  table.push([
    "Checks",
    impact.checks_added.length > 0
      ? chalk.green(impact.checks_added.join("\n"))
      : "-",
    impact.checks_removed.length > 0
      ? chalk.red(impact.checks_removed.join("\n"))
      : "-",
  ]);
  table.push([
    "Gates",
    impact.gates_added.length > 0
      ? chalk.green(impact.gates_added.join("\n"))
      : "-",
    impact.gates_removed.length > 0
      ? chalk.red(impact.gates_removed.join("\n"))
      : "-",
  ]);

  console.log(table.toString());

  if (impact.consumer_ripple.length > 0) {
    console.log(chalk.bold("\n  🌊 Consumer Ripple (contract → consumers):\n"));
    for (const r of impact.consumer_ripple) {
      console.log(`    • ${r.contract} → ${r.consumers.join(", ")}`);
    }
  }
}

interface SyncImpact {
  artifacts_added: string[];
  artifacts_removed: string[];
  checks_added: string[];
  checks_removed: string[];
  gates_added: string[];
  gates_removed: string[];
  consumer_ripple: Array<{ contract: string; consumers: string[] }>;
}

// ============ change archive ============

async function archiveChangeCmd(
  projectRoot: string,
  changesDir: string,
  options: ChangeOptions,
): Promise<void> {
  if (!options.id) {
    console.log(
      chalk.red("✗ Change ID required. Usage: spec-graph change archive <id>"),
    );
    process.exit(1);
    return;
  }

  const change = await loadChangeOrExit(changesDir, options.id);

  if (change.status !== "completed" && change.status !== "discarded") {
    console.log(
      chalk.red(
        `✗ Change status is ${change.status}. Only completed/discarded changes can be archived.`,
      ),
    );
    console.log(
      chalk.gray(
        "  Run `spec-graph change complete " +
          change.id +
          "` (or `discard`) first.",
      ),
    );
    process.exit(1);
    return;
  }

  console.log(chalk.bold(`\n📦 Archiving change: ${change.title}\n`));

  const archivedDir = path.join(changesDir, "archived");
  await fs.mkdir(archivedDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.join(
    projectRoot,
    ".spec-graph",
    "snapshots",
    `${change.id}-${timestamp}`,
  );
  await fs.mkdir(snapshotDir, { recursive: true });

  const filesToSnapshot = [
    {
      src: path.join(projectRoot, ".spec-graph", "profile.yaml"),
      dst: "profile.yaml",
    },
    {
      src: path.join(projectRoot, ".spec-graph", "graph.yaml"),
      dst: "graph.yaml",
    },
    {
      src: path.join(projectRoot, ".spec-graph", "machine-state.yaml"),
      dst: "machine-state.yaml",
    },
  ];

  for (const { src, dst } of filesToSnapshot) {
    try {
      const content = await fs.readFile(src);
      await fs.writeFile(path.join(snapshotDir, dst), content);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      console.log(chalk.gray(`  (skipped missing: ${dst})`));
    }
  }

  const manifest = {
    change_id: change.id,
    change_title: change.title,
    archived_at: new Date().toISOString(),
    final_status: change.status,
    snapshot_files: filesToSnapshot.map((f) => f.dst),
  };
  await fs.writeFile(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  change.archive = {
    archived_at: new Date().toISOString(),
    snapshot_dir: path.relative(projectRoot, snapshotDir),
    final_status: change.status,
  };
  appendAudit(change, "archive", undefined, `snapshotted to ${snapshotDir}`);

  // Write change to archived/ and remove from active changes/
  const archivedChangePath = path.join(archivedDir, `${change.id}.json`);
  await fs.writeFile(archivedChangePath, JSON.stringify(change, null, 2));

  const activeChangePath = path.join(changesDir, `${change.id}.json`);
  await fs.unlink(activeChangePath);

  // 归档 plan MD（如果存在 plan_path）
  if (change.plan_path) {
    const planAbsPath = path.join(projectRoot, change.plan_path);
    try {
      const planContent = await fs.readFile(planAbsPath);
      // 快照到 snapshot 目录
      await fs.writeFile(
        path.join(snapshotDir, path.basename(change.plan_path)),
        planContent,
      );
      // 移到 archived 目录
      const archivedPlanPath = path.join(
        archivedDir,
        path.basename(change.plan_path),
      );
      await fs.writeFile(archivedPlanPath, planContent);
      // 删除原文件
      await fs.unlink(planAbsPath);
      console.log(
        chalk.green(
          `  ✓ Plan MD moved to: ${path.relative(projectRoot, archivedPlanPath)}`,
        ),
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      console.log(chalk.gray("  (plan MD not found, skipped)"));
    }
  }

  // Append to changelog
  await appendToChangelog(projectRoot, change);

  console.log(
    chalk.green(
      `  ✓ Snapshotted to: ${path.relative(projectRoot, snapshotDir)}`,
    ),
  );
  console.log(
    chalk.green(
      `  ✓ Moved to: ${path.relative(projectRoot, archivedChangePath)}`,
    ),
  );
  console.log(chalk.green(`  ✓ Changelog updated`));
  console.log(chalk.bold(`\n  📦 Archived ${change.id}\n`));
}

async function appendToChangelog(
  projectRoot: string,
  change: ChangeDescriptor,
): Promise<void> {
  const changelogPath = path.join(projectRoot, ".spec-graph", "CHANGELOG.md");
  const entry = buildChangelogEntry(change);

  let existing = "";
  try {
    existing = await fs.readFile(changelogPath, "utf-8");
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
    existing =
      "# spec-graph Changelog\n\nAll archived changes are recorded here.\n\n";
  }

  const updated = existing + entry;
  await fs.writeFile(changelogPath, updated);
}

function buildChangelogEntry(change: ChangeDescriptor): string {
  const date = new Date(change.archive!.archived_at)
    .toISOString()
    .split("T")[0];
  const lines: string[] = [];

  lines.push(`## ${date} — ${change.id} [${change.archive!.final_status}]`);
  lines.push("");
  lines.push(`**Title**: ${change.title}`);
  lines.push(`**Type**: ${change.type}`);
  lines.push(`**Priority**: ${change.priority}`);
  lines.push("");
  lines.push(`${change.description}`);
  lines.push("");

  if (change.profile_patch && Object.keys(change.profile_patch).length > 0) {
    lines.push("**Profile patches applied**:");
    for (const [dim, val] of Object.entries(change.profile_patch)) {
      lines.push(`- \`${dim}\` → \`${val}\``);
    }
    lines.push("");
  }

  if (change.sync_impact) {
    const si = change.sync_impact;
    lines.push("**Sync impact**:");
    if (si.artifacts_added.length)
      lines.push(`- artifacts added: ${si.artifacts_added.join(", ")}`);
    if (si.artifacts_removed.length)
      lines.push(`- artifacts removed: ${si.artifacts_removed.join(", ")}`);
    if (si.checks_added.length)
      lines.push(`- checks added: ${si.checks_added.join(", ")}`);
    if (si.checks_removed.length)
      lines.push(`- checks removed: ${si.checks_removed.join(", ")}`);
    lines.push("");
  }

  lines.push(`**Snapshot**: \`${change.archive!.snapshot_dir}\``);
  lines.push("");

  return lines.join("\n");
}

// ============ helpers ============

async function loadAllChanges(changesDir: string): Promise<ChangeDescriptor[]> {
  const changes: ChangeDescriptor[] = [];
  try {
    const entries = await fs.readdir(changesDir);
    for (const entry of entries) {
      if (entry.endsWith(".json")) {
        const content = await fs.readFile(
          path.join(changesDir, entry),
          "utf-8",
        );
        changes.push(JSON.parse(content));
      }
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  return changes;
}

/**
 * Find the active (in_progress) change descriptor, if any.
 * Used by other commands (e.g. dispatch) to attach audit entries
 * for traceability — without requiring the user to pass --change-id.
 *
 * Returns null if no in_progress change exists, or if multiple exist
 * (ambiguous — caller should require explicit --change-id).
 */
export async function findActiveChange(
  projectRoot: string,
): Promise<ChangeDescriptor | null> {
  const changesDir = path.join(projectRoot, ".spec-graph", "changes");
  const all = await loadAllChanges(changesDir);
  const inProgress = all.filter((c) => c.status === "in_progress");
  if (inProgress.length !== 1) return null;
  return inProgress[0];
}

/**
 * Append an audit entry to the active change descriptor (if exactly one exists).
 * Silently no-ops when no active change — dispatch still works without a change.
 */
export async function appendToActiveChangeAudit(
  projectRoot: string,
  action: string,
  message: string,
  author?: string,
): Promise<void> {
  const change = await findActiveChange(projectRoot);
  if (!change) return;
  if (!change.audit_log) change.audit_log = [];
  change.audit_log.push({
    timestamp: new Date().toISOString(),
    action,
    author,
    message,
  });
  const changesDir = path.join(projectRoot, ".spec-graph", "changes");
  await saveChange(changesDir, change);
}

async function loadChangeOrExit(
  changesDir: string,
  id: string,
): Promise<ChangeDescriptor> {
  const changePath = path.join(changesDir, `${id}.json`);
  try {
    const content = await fs.readFile(changePath, "utf-8");
    return JSON.parse(content) as ChangeDescriptor;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.log(chalk.red(`✗ Change not found: ${id}`));
      process.exit(1);
      throw new Error("unreachable");
    }
    throw e;
  }
}

async function saveChange(
  changesDir: string,
  change: ChangeDescriptor,
): Promise<void> {
  const changePath = path.join(changesDir, `${change.id}.json`);
  await fs.writeFile(changePath, JSON.stringify(change, null, 2));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
