/**
 * spec-graph install — Copies skill files to IDE project directories.
 *
 * Supports Claude Code (.claude/skills/), Cursor (.agents/skills/),
 * OpenCode (.agents/skills/), and GitHub Copilot (.agents/skills/).
 *
 * Usage:
 *   spec-graph install                   # Auto-detect IDE, install to current project
 *   spec-graph install --ide claude-code # Force specific IDE
 *   spec-graph install --target ~/my-project  # Install to specific project
 *   spec-graph install --quick           # Install + init + compose + prime --bootstrap
 */
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";

export interface InstallOptions {
  ide?: string;
  target?: string;
  quick?: boolean;
  force?: boolean;
  json?: boolean;
  description?: string;
  permissionLevel?: string;
  syncAgentConfig?: boolean;
  gitHooks?: boolean;
}

interface InstallResult {
  skills_installed: string[];
  skills_skipped: string[];
  target_dir: string;
  ide: string;
  spec_graph_dir: string;
  quick_bootstrap: boolean;
}

// IDE configurations — mirrors BMAD's platform-codes.yaml
const IDE_CONFIG: Record<
  string,
  { name: string; skillDir: string; globalSkillDir: string }
> = {
  "claude-code": {
    name: "Claude Code",
    skillDir: ".claude/skills",
    globalSkillDir: ".claude/skills",
  },
  cursor: {
    name: "Cursor",
    skillDir: ".agents/skills",
    globalSkillDir: ".agents/skills",
  },
  opencode: {
    name: "OpenCode",
    skillDir: ".agents/skills",
    globalSkillDir: ".agents/skills",
  },
  "github-copilot": {
    name: "GitHub Copilot",
    skillDir: ".agents/skills",
    globalSkillDir: ".agents/skills",
  },
};

export async function installCommand(
  projectRoot: string,
  options: InstallOptions,
): Promise<void> {
  const targetRoot = options.target || projectRoot;
  const ide = options.ide || (await detectIDE(targetRoot));
  const config = IDE_CONFIG[ide];

  if (!config) {
    console.log(chalk.red(`Unknown IDE: ${ide}`));
    console.log(`Supported IDEs: ${Object.keys(IDE_CONFIG).join(", ")}`);
    process.exit(1);
    return;
  }

  const result: InstallResult = {
    skills_installed: [],
    skills_skipped: [],
    target_dir: path.join(targetRoot, config.skillDir),
    ide: config.name,
    spec_graph_dir: path.join(targetRoot, ".spec-graph"),
    quick_bootstrap: false,
  };

  // Step 1: Find skills source directory
  const skillsSource = await findSkillsSource();
  if (!skillsSource) {
    console.log(chalk.red("✗ Could not locate spec-graph skills directory."));
    console.log("  Ensure spec-graph is properly installed.");
    process.exit(1);
    return;
  }

  // Step 2: Create target directories
  await fs.mkdir(result.target_dir, { recursive: true });
  await fs.mkdir(result.spec_graph_dir, { recursive: true });

  // Step 3: Copy skills
  const skillDirs = await fs.readdir(skillsSource);
  for (const dir of skillDirs) {
    const sourcePath = path.join(skillsSource, dir);
    const stat = await fs.stat(sourcePath);
    if (!stat.isDirectory()) continue;

    const skillFile = path.join(sourcePath, "SKILL.md");
    try {
      await fs.access(skillFile);
    } catch {
      continue; // Skip directories without SKILL.md
    }

    const destPath = path.join(result.target_dir, dir);
    if ((await dirExists(destPath)) && !options.force) {
      result.skills_skipped.push(dir);
      continue;
    }

    if ((await dirExists(destPath)) && options.force) {
      await fs.rm(destPath, { recursive: true, force: true });
    }

    await copyDir(sourcePath, destPath);
    result.skills_installed.push(dir);
  }

  // Step 4: Display results
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderInstallResult(result);
  }

  // Step 5: Quick bootstrap if requested
  if (options.quick) {
    console.log(chalk.cyan("\n  ⚡ Quick mode: running init..."));
    try {
      // Dynamic import to avoid circular dependency
      const { initCommand } = await import("./init");
      await initCommand(targetRoot, {
        force: options.force,
        description: options.description,
        permissionLevel: options.permissionLevel || "semi-auto",
        quick: true,
      });
    } catch (e: any) {
      console.log(chalk.yellow(`  Quick bootstrap skipped: ${e.message}`));
    }
  }

  // Step 6: Git hooks installation
  if (options.gitHooks) {
    console.log(chalk.cyan("\n  🔗 Installing git hooks..."));
    try {
      await installGitHooks(targetRoot);
      console.log(chalk.green("  ✓ Git hooks installed"));
    } catch (e: any) {
      console.log(chalk.yellow(`  Git hooks skipped: ${e.message}`));
    }
  }
}

async function detectIDE(projectRoot: string): Promise<string> {
  // Check for Claude Code first (most common)
  if (await dirExists(path.join(projectRoot, ".claude"))) {
    return "claude-code";
  }

  // Check for Cursor
  if (await dirExists(path.join(projectRoot, ".cursor"))) {
    return "cursor";
  }

  // Check for OpenCode
  if (await fileExists(path.join(projectRoot, ".opencode.json"))) {
    return "opencode";
  }

  // Default to Claude Code
  return "claude-code";
}

async function findSkillsSource(): Promise<string | null> {
  // Try relative to __dirname (when running from dist/)
  const distRelative = path.resolve(__dirname, "../../skills");
  if (await dirExists(distRelative)) return distRelative;

  // Try relative to __dirname (when running from src/ via tsx)
  const srcRelative = path.resolve(__dirname, "../skills");
  if (await dirExists(srcRelative)) return srcRelative;

  // Try from project root
  const projectRelative = path.resolve(process.cwd(), "skills");
  if (await dirExists(projectRelative)) return projectRelative;

  return null;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip OS artifacts
    if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") continue;

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function renderInstallResult(result: InstallResult): void {
  console.log(chalk.bold("\n✓ spec-graph skills installed\n"));

  const table = new Table({
    head: ["Item", "Value"],
    style: { head: ["cyan"] },
  });

  table.push(["IDE", result.ide]);
  table.push(["Target directory", result.target_dir]);
  table.push(["Skills installed", `${result.skills_installed.length}`]);
  if (result.skills_skipped.length > 0) {
    table.push([
      "Skills skipped (existing)",
      `${result.skills_skipped.length}`,
    ]);
  }

  console.log(table.toString());

  if (result.skills_installed.length > 0) {
    console.log(chalk.green("\n  Installed skills:"));
    for (const skill of result.skills_installed) {
      console.log(`    ✓ ${skill}`);
    }
  }

  if (
    result.skills_skipped.length > 0 &&
    result.skills_installed.length === 0
  ) {
    console.log(
      chalk.yellow(
        "\n  All skills already installed. Use --force to overwrite.",
      ),
    );
  }

  console.log(chalk.bold("\n  Slash commands available in your IDE:"));
  console.log(
    chalk.gray("  Type / followed by a skill name to see available commands."),
  );
  for (const skill of result.skills_installed.length > 0
    ? result.skills_installed
    : result.skills_skipped) {
    const cmdName = skill.replace(/^spec-graph-/, "/");
    console.log(chalk.gray(`    ${cmdName}`));
  }

  console.log(chalk.bold("\n  Next: spec-graph init --quick"));
  console.log("");
}

async function installGitHooks(projectRoot: string): Promise<void> {
  const gitDir = path.join(projectRoot, ".git");
  const hooksDir = path.join(gitDir, "hooks");

  // Check if git repo exists
  try {
    await fs.access(gitDir);
  } catch {
    throw new Error("Not a git repository");
  }

  await fs.mkdir(hooksDir, { recursive: true });

  // Pre-commit hook: run gate checks before commit
  const preCommitHook = `#!/bin/sh
# spec-graph pre-commit hook
# Runs gate evaluation before allowing commit

echo "🔍 Running spec-graph gate checks..."
npx spec-graph gate --json > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ spec-graph gate check failed. Fix issues before committing."
  echo "   Run: npx spec-graph gate"
  exit 1
fi
echo "✓ spec-graph gate check passed"
`;

  // Post-commit hook: log commit to spec-graph
  const postCommitHook = `#!/bin/sh
# spec-graph post-commit hook
# Logs commit for traceability

COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)
echo "✓ Commit $COMMIT_SHA: $COMMIT_MSG"
echo "  (spec-graph post-commit hook)"
`;

  await fs.writeFile(
    path.join(hooksDir, "pre-commit"),
    preCommitHook,
    { mode: 0o755 },
  );
  await fs.writeFile(
    path.join(hooksDir, "post-commit"),
    postCommitHook,
    { mode: 0o755 },
  );
}
