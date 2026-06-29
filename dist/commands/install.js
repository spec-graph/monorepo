"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installCommand = installCommand;
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
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
// IDE configurations — mirrors BMAD's platform-codes.yaml
const IDE_CONFIG = {
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
async function installCommand(projectRoot, options) {
    const targetRoot = options.target || projectRoot;
    const ide = options.ide || (await detectIDE(targetRoot));
    const config = IDE_CONFIG[ide];
    if (!config) {
        console.log(chalk_1.default.red(`Unknown IDE: ${ide}`));
        console.log(`Supported IDEs: ${Object.keys(IDE_CONFIG).join(", ")}`);
        process.exit(1);
        return;
    }
    const result = {
        skills_installed: [],
        skills_skipped: [],
        target_dir: node_path_1.default.join(targetRoot, config.skillDir),
        ide: config.name,
        spec_graph_dir: node_path_1.default.join(targetRoot, ".spec-graph"),
        quick_bootstrap: false,
    };
    // Step 1: Find skills source directory
    const skillsSource = await findSkillsSource();
    if (!skillsSource) {
        console.log(chalk_1.default.red("✗ Could not locate spec-graph skills directory."));
        console.log("  Ensure spec-graph is properly installed.");
        process.exit(1);
        return;
    }
    // Step 2: Create target directories
    await promises_1.default.mkdir(result.target_dir, { recursive: true });
    await promises_1.default.mkdir(result.spec_graph_dir, { recursive: true });
    // Step 3: Copy skills
    const skillDirs = await promises_1.default.readdir(skillsSource);
    for (const dir of skillDirs) {
        const sourcePath = node_path_1.default.join(skillsSource, dir);
        const stat = await promises_1.default.stat(sourcePath);
        if (!stat.isDirectory())
            continue;
        const skillFile = node_path_1.default.join(sourcePath, "SKILL.md");
        try {
            await promises_1.default.access(skillFile);
        }
        catch {
            continue; // Skip directories without SKILL.md
        }
        const destPath = node_path_1.default.join(result.target_dir, dir);
        if ((await dirExists(destPath)) && !options.force) {
            result.skills_skipped.push(dir);
            continue;
        }
        if ((await dirExists(destPath)) && options.force) {
            await promises_1.default.rm(destPath, { recursive: true, force: true });
        }
        await copyDir(sourcePath, destPath);
        result.skills_installed.push(dir);
    }
    // Step 4: Display results
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    }
    else {
        renderInstallResult(result);
    }
    // Step 5: Quick bootstrap if requested
    if (options.quick) {
        console.log(chalk_1.default.cyan("\n  ⚡ Quick mode: running init..."));
        try {
            // Dynamic import to avoid circular dependency
            const { initCommand } = await Promise.resolve().then(() => __importStar(require("./init")));
            await initCommand(targetRoot, {
                force: options.force,
                description: options.description,
                permissionLevel: options.permissionLevel || "semi-auto",
                quick: true,
            });
        }
        catch (e) {
            console.log(chalk_1.default.yellow(`  Quick bootstrap skipped: ${e.message}`));
        }
    }
    // Step 6: Git hooks installation
    if (options.gitHooks) {
        console.log(chalk_1.default.cyan("\n  🔗 Installing git hooks..."));
        try {
            await installGitHooks(targetRoot);
            console.log(chalk_1.default.green("  ✓ Git hooks installed"));
        }
        catch (e) {
            console.log(chalk_1.default.yellow(`  Git hooks skipped: ${e.message}`));
        }
    }
}
async function detectIDE(projectRoot) {
    // Check for Claude Code first (most common)
    if (await dirExists(node_path_1.default.join(projectRoot, ".claude"))) {
        return "claude-code";
    }
    // Check for Cursor
    if (await dirExists(node_path_1.default.join(projectRoot, ".cursor"))) {
        return "cursor";
    }
    // Check for OpenCode
    if (await fileExists(node_path_1.default.join(projectRoot, ".opencode.json"))) {
        return "opencode";
    }
    // Default to Claude Code
    return "claude-code";
}
async function findSkillsSource() {
    // Try relative to __dirname (when running from dist/)
    const distRelative = node_path_1.default.resolve(__dirname, "../../skills");
    if (await dirExists(distRelative))
        return distRelative;
    // Try relative to __dirname (when running from src/ via tsx)
    const srcRelative = node_path_1.default.resolve(__dirname, "../skills");
    if (await dirExists(srcRelative))
        return srcRelative;
    // Try from project root
    const projectRelative = node_path_1.default.resolve(process.cwd(), "skills");
    if (await dirExists(projectRelative))
        return projectRelative;
    return null;
}
async function copyDir(src, dest) {
    await promises_1.default.mkdir(dest, { recursive: true });
    const entries = await promises_1.default.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = node_path_1.default.join(src, entry.name);
        const destPath = node_path_1.default.join(dest, entry.name);
        // Skip OS artifacts
        if (entry.name === ".DS_Store" || entry.name === "Thumbs.db")
            continue;
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        }
        else {
            await promises_1.default.copyFile(srcPath, destPath);
        }
    }
}
async function dirExists(dirPath) {
    try {
        const stat = await promises_1.default.stat(dirPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
async function fileExists(filePath) {
    try {
        const stat = await promises_1.default.stat(filePath);
        return stat.isFile();
    }
    catch {
        return false;
    }
}
function renderInstallResult(result) {
    console.log(chalk_1.default.bold("\n✓ spec-graph skills installed\n"));
    const table = new cli_table3_1.default({
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
        console.log(chalk_1.default.green("\n  Installed skills:"));
        for (const skill of result.skills_installed) {
            console.log(`    ✓ ${skill}`);
        }
    }
    if (result.skills_skipped.length > 0 &&
        result.skills_installed.length === 0) {
        console.log(chalk_1.default.yellow("\n  All skills already installed. Use --force to overwrite."));
    }
    console.log(chalk_1.default.bold("\n  Slash commands available in your IDE:"));
    console.log(chalk_1.default.gray("  Type / followed by a skill name to see available commands."));
    for (const skill of result.skills_installed.length > 0
        ? result.skills_installed
        : result.skills_skipped) {
        const cmdName = skill.replace(/^spec-graph-/, "/");
        console.log(chalk_1.default.gray(`    ${cmdName}`));
    }
    console.log(chalk_1.default.bold("\n  Next: spec-graph init --quick"));
    console.log("");
}
async function installGitHooks(projectRoot) {
    const gitDir = node_path_1.default.join(projectRoot, ".git");
    const hooksDir = node_path_1.default.join(gitDir, "hooks");
    // Check if git repo exists
    try {
        await promises_1.default.access(gitDir);
    }
    catch {
        throw new Error("Not a git repository");
    }
    await promises_1.default.mkdir(hooksDir, { recursive: true });
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
    await promises_1.default.writeFile(node_path_1.default.join(hooksDir, "pre-commit"), preCommitHook, { mode: 0o755 });
    await promises_1.default.writeFile(node_path_1.default.join(hooksDir, "post-commit"), postCommitHook, { mode: 0o755 });
}
//# sourceMappingURL=install.js.map