import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { ScopeLockDecl, EnforcementMode } from "../types/index";
import {
  validateScopeLock,
  summarizeViolations,
  detectScopeOverlaps,
} from "../engine/isolation/scope-lock";
import { readYaml, writeYaml, tryReadYaml } from "../utils/yaml";

export interface ScopeOptions {
  subcommand?: string;
  unitId?: string;
  allowed?: string;
  protected?: string;
  forbidden?: string;
  mode?: string;
  files?: string;
  json?: boolean;
}

const SCOPE_DIR = ".spec-graph/isolation";

export async function scopeCommand(
  projectRoot: string,
  options: ScopeOptions,
): Promise<void> {
  const sub = options.subcommand || "show";
  const scopeDir = path.join(projectRoot, SCOPE_DIR);
  await fs.mkdir(scopeDir, { recursive: true });

  try {
    switch (sub) {
      case "lock":
        await lockCmd(projectRoot, options);
        break;
      case "check":
        await checkCmd(projectRoot, options);
        break;
      case "show":
        await showCmd(projectRoot, options);
        break;
      case "list":
        await listCmd(projectRoot, options);
        break;
      case "unlock":
        await unlockCmd(projectRoot, options);
        break;
      case "overlap":
        await overlapCmd(projectRoot, options);
        break;
      default:
        console.log(chalk.red(`✗ Unknown subcommand: ${sub}`));
        console.log("Available: lock, check, show, list, unlock, overlap");
        process.exit(1);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}

// ============ overlap ============

async function overlapCmd(
  projectRoot: string,
  options: ScopeOptions,
): Promise<void> {
  const scopeDir = path.join(projectRoot, SCOPE_DIR);
  const locks: Record<string, ScopeLockDecl> = {};

  // Load all active scope locks
  try {
    const entries = await fs.readdir(scopeDir);
    for (const entry of entries) {
      if (entry.endsWith(".yaml")) {
        const unitId = entry.replace(".yaml", "");
        const lock = await tryReadYaml<ScopeLockDecl>(
          path.join(scopeDir, entry),
        );
        if (lock) {
          locks[unitId] = lock;
        }
      }
    }
  } catch {
    // No scope locks exist
  }

  if (Object.keys(locks).length === 0) {
    console.log(chalk.yellow("No scope locks found."));
    return;
  }

  const overlaps = detectScopeOverlaps(locks);

  if (options.json) {
    console.log(
      JSON.stringify({ locks: Object.keys(locks).length, overlaps }, null, 2),
    );
    return;
  }

  if (overlaps.length === 0) {
    console.log(chalk.green("✓ No scope overlaps detected."));
    console.log(chalk.gray(`  ${Object.keys(locks).length} active lock(s), all disjoint`));
    return;
  }

  console.log(
    chalk.yellow(`⚠ ${overlaps.length} scope overlap(s) detected:\n`),
  );
  for (const overlap of overlaps) {
    const kindIcon =
      overlap.kind === "exact"
        ? chalk.red("✗")
        : chalk.yellow("⚠");
    console.log(
      `  ${kindIcon} [${chalk.bold(overlap.kind)}] ${overlap.lock_a} ↔ ${overlap.lock_b}`,
    );
    console.log(chalk.gray(`    path: ${overlap.path}`));
  }
  console.log("");
}

async function lockCmd(projectRoot: string, opts: ScopeOptions): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red(
        "✗ Unit ID required. Usage: spec-graph scope lock <id> --allowed <globs> ...",
      ),
    );
    process.exit(1);
    return;
  }

  const lock: ScopeLockDecl = {
    unit_id: opts.unitId,
    allowed_paths: parseGlobs(opts.allowed),
    protected_paths: parseGlobs(opts.protected),
    forbidden_paths: parseGlobs(opts.forbidden),
    enforcement_mode: (opts.mode as EnforcementMode) || "strict",
    locked_at: new Date().toISOString(),
    locked_by: "cli",
  };

  const filePath = scopeFilePath(projectRoot, opts.unitId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeYaml(filePath, lock);

  console.log(chalk.green(`\n✓ Scope lock created for ${opts.unitId}`));
  console.log(
    `  Allowed:   ${lock.allowed_paths.join(", ") || "(none — anything goes)"}`,
  );
  console.log(`  Protected: ${lock.protected_paths.join(", ") || "(none)"}`);
  console.log(`  Forbidden: ${lock.forbidden_paths.join(", ") || "(none)"}`);
  console.log(`  Mode:      ${lock.enforcement_mode}\n`);
}

// ============ check ============

async function checkCmd(
  projectRoot: string,
  opts: ScopeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(
      chalk.red(
        "✗ Unit ID required. Usage: spec-graph scope check <id> --files <comma-list>",
      ),
    );
    process.exit(1);
    return;
  }
  if (!opts.files) {
    console.log(chalk.red("✗ Files required."));
    process.exit(1);
    return;
  }

  const lock = await loadLock(projectRoot, opts.unitId);
  const files = opts.files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const result = validateScopeLock(files, lock);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.bold("\n🔒 Scope Check\n"));
  console.log(`  Unit:   ${opts.unitId}`);
  console.log(`  Mode:   ${result.enforcement_mode}`);
  console.log(`  Files:  ${files.length}`);
  console.log(
    `  Result: ${result.passed ? chalk.green("PASS") : chalk.red("FAIL")}`,
  );

  if (!result.passed) {
    console.log("");
    console.log(chalk.red(`  ${summarizeViolations(result)}`));
    for (const v of result.violations) {
      const icon =
        v.kind === "forbidden-touched"
          ? "✗"
          : v.kind === "protected-modified"
            ? "⚠"
            : "○";
      console.log(chalk.red(`    ${icon} ${v.file}: ${v.message}`));
    }
    if (result.enforcement_mode === "strict") {
      process.exit(1);
    }
  }
  console.log("");
}

// ============ show ============

async function showCmd(projectRoot: string, opts: ScopeOptions): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  const lock = await loadLock(projectRoot, opts.unitId);

  if (opts.json) {
    console.log(JSON.stringify(lock, null, 2));
    return;
  }

  console.log(chalk.bold(`\n🔒 Scope Lock: ${lock.unit_id}\n`));
  console.log(`  Allowed:   ${lock.allowed_paths.join(", ") || "(none)"}`);
  console.log(`  Protected: ${lock.protected_paths.join(", ") || "(none)"}`);
  console.log(`  Forbidden: ${lock.forbidden_paths.join(", ") || "(none)"}`);
  console.log(`  Mode:      ${lock.enforcement_mode}`);
  console.log(`  Locked at: ${lock.locked_at}`);
  console.log(`  Locked by: ${lock.locked_by}\n`);
}

// ============ list ============

async function listCmd(projectRoot: string, opts: ScopeOptions): Promise<void> {
  const dir = path.join(projectRoot, SCOPE_DIR);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      files = [];
    } else throw e;
  }

  const locks: ScopeLockDecl[] = [];
  for (const f of files) {
    if (!f.startsWith("scope-") || !f.endsWith(".yaml")) continue;
    const lock = await tryReadYaml<ScopeLockDecl>(path.join(dir, f));
    if (lock) locks.push(lock);
  }

  if (locks.length === 0) {
    console.log(chalk.yellow("\nNo scope locks registered.\n"));
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(locks, null, 2));
    return;
  }

  console.log(chalk.bold("\n🔒 Scope Locks\n"));
  for (const l of locks) {
    console.log(
      `  • ${l.unit_id} [${l.enforcement_mode}] allowed=${l.allowed_paths.length} protected=${l.protected_paths.length} forbidden=${l.forbidden_paths.length}`,
    );
  }
  console.log("");
}

// ============ unlock ============

async function unlockCmd(
  projectRoot: string,
  opts: ScopeOptions,
): Promise<void> {
  if (!opts.unitId) {
    console.log(chalk.red("✗ Unit ID required."));
    process.exit(1);
    return;
  }
  const filePath = scopeFilePath(projectRoot, opts.unitId);
  try {
    await fs.unlink(filePath);
    console.log(chalk.green(`\n✓ Scope lock removed for ${opts.unitId}\n`));
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.log(chalk.yellow(`\n⚠ No scope lock found for ${opts.unitId}\n`));
    } else throw e;
  }
}

// ============ helpers ============

function parseGlobs(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function scopeFilePath(projectRoot: string, unitId: string): string {
  const safe = unitId.replace(/\//g, "_");
  return path.join(projectRoot, SCOPE_DIR, `scope-${safe}.yaml`);
}

async function loadLock(
  projectRoot: string,
  unitId: string,
): Promise<ScopeLockDecl> {
  const filePath = scopeFilePath(projectRoot, unitId);
  const lock = await tryReadYaml<ScopeLockDecl>(filePath);
  if (!lock) {
    console.log(
      chalk.red(
        `✗ No scope lock found for ${unitId}. Run \`spec-graph scope lock\` first.`,
      ),
    );
    process.exit(1);
    throw new Error("unreachable");
  }
  return lock;
}
