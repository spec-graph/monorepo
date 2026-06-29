"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.senseCommand = senseCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/sense/index");
const overrides_1 = require("../engine/sense/overrides");
const yaml_1 = require("../utils/yaml");
async function senseCommand(projectRoot, options) {
    const spinner = (0, ora_1.default)("Analyzing project...").start();
    try {
        // Construct classifier if --llm-classify is set
        let classifier;
        if (options.llmClassify) {
            const backend = new index_1.HttpLlmBackend();
            classifier = new index_1.LlmClassifier(backend);
        }
        const { profile, signals, warnings } = await (0, index_1.runSense)(projectRoot, {
            description: options.description,
            classifier,
        });
        // Apply user overrides on top of sensed facts
        const { overrides, warnings: overrideWarnings } = (0, overrides_1.collectOverrides)(options.build, options.profileOverride);
        if (Object.keys(overrides).length > 0) {
            profile.overrides = { ...profile.overrides, ...overrides };
        }
        warnings.push(...overrideWarnings);
        spinner.succeed("Analysis complete");
        // Display profile summary
        console.log("");
        console.log(chalk_1.default.bold("  📊 Profile Summary"));
        console.log("");
        const table = new cli_table3_1.default({
            head: ["Dimension", "Value", "Confidence", "Source", "Evidence"],
            style: { head: ["cyan"] },
        });
        const dimensions = [
            "has_ui",
            "boundary",
            "topology",
            "deployment",
            "consumers",
            "field",
            "criticality",
            "team",
            "persistence",
        ];
        for (const dim of dimensions) {
            const fact = profile.facts[dim];
            if (!fact)
                continue;
            const confColor = fact.confidence === "high" ? chalk_1.default.green : chalk_1.default.yellow;
            const sourceColor = fact.source === "repo" ? chalk_1.default.blue : chalk_1.default.gray;
            table.push([
                dim,
                fact.value,
                confColor(fact.confidence),
                sourceColor(fact.source),
                (fact.evidence || "").slice(0, 40),
            ]);
        }
        console.log(table.toString());
        // Show repo signals if requested
        if (options.showSignals) {
            console.log("");
            console.log(chalk_1.default.bold("  🔍 Repo Signals Detected:"));
            console.log("");
            printSignals(signals);
        }
        if (warnings.length > 0) {
            console.log("");
            console.log(chalk_1.default.yellow("  ⚠️  Warnings:"));
            for (const w of warnings) {
                console.log(chalk_1.default.yellow(`     • ${w}`));
            }
        }
        // Save if output specified or .spec-graph exists
        const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
        try {
            await promises_1.default.access(specGraphDir);
            const profilePath = node_path_1.default.join(specGraphDir, "profile.yaml");
            await (0, yaml_1.writeYaml)(profilePath, profile);
            console.log("");
            console.log(chalk_1.default.green(`  💾 Profile saved to: .spec-graph/profile.yaml`));
        }
        catch {
            // Not initialized yet - skip save
            if (options.output) {
                await (0, yaml_1.writeYaml)(options.output, profile);
                console.log(chalk_1.default.green(`  💾 Profile saved to: ${options.output}`));
            }
        }
    }
    catch (e) {
        spinner.fail(`Sense failed: ${e.message}`);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
function printSignals(signals) {
    const items = [
        ["package.json", signals.hasPackageJson],
        ["exports field", signals.hasExportsField],
        ["React", signals.hasReact],
        ["Vue", signals.hasVue],
        ["Next.js", signals.hasNextConfig],
        ["Tailwind", signals.hasTailwind],
        ["OpenAPI", signals.hasOpenApiYaml],
        ["Prisma", signals.hasPrismaSchema],
        ["Docker", signals.hasDockerfile],
        ["GraphQL", signals.hasGraphqlSchema],
        ["gRPC", signals.hasGrpcProtos],
        ["PlatformIO", signals.hasPlatformioIni],
        ["CI Config", signals.hasCiConfig],
        [`src files`, signals.srcFileCount],
        [`test files`, signals.testFileCount],
    ];
    for (let i = 0; i < items.length; i += 3) {
        const row = items.slice(i, i + 3);
        const line = row
            .map(([name, val]) => {
            const icon = val ? chalk_1.default.green("✓") : chalk_1.default.gray("○");
            const count = typeof val === "boolean" ? "" : chalk_1.default.gray(`(${val})`);
            return `  ${icon} ${name} ${count}`;
        })
            .join("  ");
        console.log(line);
    }
}
//# sourceMappingURL=sense.js.map