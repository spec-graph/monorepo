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
exports.initCommand = initCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const index_1 = require("../engine/sense/index");
const overrides_1 = require("../engine/sense/overrides");
const yaml_1 = require("../utils/yaml");
const index_2 = require("../engine/permissions/index");
async function initCommand(projectRoot, options) {
    const spinner = (0, ora_1.default)("Initializing spec-graph project...").start();
    try {
        const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
        // Check if already initialized
        try {
            await promises_1.default.access(specGraphDir);
            if (!options.force) {
                spinner.fail("Project already initialized");
                console.log(chalk_1.default.yellow("  Use --force to re-initialize"));
                process.exit(1);
            }
        }
        catch {
            // Doesn't exist - proceed
        }
        // Create directory structure
        await promises_1.default.mkdir(node_path_1.default.join(specGraphDir, "changes"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(specGraphDir, "artifacts"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(specGraphDir, "traces"), { recursive: true });
        // Create permissions with chosen level (default: semi-auto)
        const permLevel = (options.permissionLevel || "semi-auto");
        const permConfig = (0, index_2.getPreset)(permLevel);
        await (0, index_2.savePermissions)(projectRoot, permConfig);
        // Auto-generate agent config files (.claude/settings.json, .opencode.json)
        const { created, skipped } = await (0, index_2.writeAgentConfigs)(projectRoot, permConfig);
        // Run initial sense
        spinner.text = "Analyzing project structure...";
        let classifier;
        if (options.llmClassify) {
            const backend = new index_1.HttpLlmBackend();
            classifier = new index_1.LlmClassifier(backend);
        }
        const { profile, warnings } = await (0, index_1.runSense)(projectRoot, {
            description: options.description,
            classifier,
        });
        // Apply user overrides (--build / --profile-override) on top of sensed facts
        const { overrides, warnings: overrideWarnings } = (0, overrides_1.collectOverrides)(options.build, options.profileOverride);
        if (Object.keys(overrides).length > 0) {
            profile.overrides = { ...profile.overrides, ...overrides };
        }
        warnings.push(...overrideWarnings);
        // Write profile
        spinner.text = "Writing profile.yaml...";
        await (0, yaml_1.writeYaml)(node_path_1.default.join(specGraphDir, "profile.yaml"), profile);
        // Write initial graph
        spinner.text = "Composing initial graph...";
        // Write README
        const readme = `# ${options.description || "Spec-Graph Project"}

Initialized at ${new Date().toISOString()}

## Commands

\`\`\`bash
spec-graph sense    # Re-analyze project, update profile
spec-graph compose  # Compose workflow graph
spec-graph gate     # Evaluate gates, show blocking items
spec-graph show     # Display current graph summary
spec-graph change   # Manage changes (create/list/...)
\`\`\`
`;
        await promises_1.default.writeFile(node_path_1.default.join(specGraphDir, "README.md"), readme);
        spinner.succeed("Project initialized successfully!");
        // Report created agent configs
        for (const c of created) {
            console.log(chalk_1.default.green(`  ✓ ${c}`));
        }
        for (const s of skipped) {
            console.log(chalk_1.default.gray(`  - ${s}`));
        }
        if (warnings.length > 0) {
            console.log(chalk_1.default.yellow("\n  Warnings:"));
            for (const w of warnings) {
                console.log(chalk_1.default.yellow(`   • ${w}`));
            }
        }
        console.log(chalk_1.default.green("\n  Next steps:"));
        console.log("   1. Review .spec-graph/profile.yaml");
        console.log("   2. Review .spec-graph/permissions.yaml (level: " + permLevel + ")");
        console.log("   3. Run `spec-graph compose` to generate workflow graph");
        console.log("   4. Run `spec-graph gate` to evaluate entry gates");
        // --quick: full bootstrap (init + compose + prime)
        if (options.quick) {
            console.log(chalk_1.default.cyan("\n  ⚡ Quick mode: running compose + prime...\n"));
            const { composeCommand } = await Promise.resolve().then(() => __importStar(require("./compose")));
            const { primeCommand } = await Promise.resolve().then(() => __importStar(require("./prime")));
            await composeCommand(projectRoot, { changeType: "feature" });
            console.log("");
            await primeCommand(projectRoot, { bootstrap: true });
            console.log(chalk_1.default.green("\n  ✓ Full bootstrap complete."));
            console.log(chalk_1.default.gray("  Next: spec-graph status"));
            console.log(chalk_1.default.gray("  Next: spec-graph next"));
        }
    }
    catch (e) {
        spinner.fail(`Initialization failed: ${e.message}`);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=init.js.map