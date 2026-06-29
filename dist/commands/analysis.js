"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analysisCommand = analysisCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
async function analysisCommand(projectRoot, options) {
    const analysisDir = node_path_1.default.join(projectRoot, ".spec-graph", "analysis");
    await promises_1.default.mkdir(analysisDir, { recursive: true });
    const subcommand = options.phase === "list"
        ? "list"
        : options.phase === "show"
            ? "show"
            : "write";
    switch (subcommand) {
        case "list":
            await listAnalysis(analysisDir, options);
            break;
        case "show":
            await showAnalysis(analysisDir, options);
            break;
        case "write":
            await writeAnalysis(analysisDir, options);
            break;
    }
}
async function listAnalysis(analysisDir, options) {
    const files = await promises_1.default.readdir(analysisDir);
    const analysisDocs = [];
    for (const file of files) {
        if (file.endsWith(".yaml")) {
            const content = await promises_1.default.readFile(node_path_1.default.join(analysisDir, file), "utf-8");
            const doc = js_yaml_1.default.load(content);
            analysisDocs.push(doc);
        }
    }
    if (options.json) {
        console.log(JSON.stringify(analysisDocs, null, 2));
        return;
    }
    if (analysisDocs.length === 0) {
        console.log(chalk_1.default.yellow("No analysis documents found."));
        console.log(chalk_1.default.gray("Use `spec-graph analysis write --phase <phase>` to create one."));
        return;
    }
    const table = new cli_table3_1.default({
        head: ["Phase", "Status", "Updated", "Linked Tasks", "Linked Artifacts"],
        style: { head: ["cyan"] },
    });
    for (const doc of analysisDocs.sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
        table.push([
            doc.phase,
            doc.status,
            new Date(doc.updated_at).toLocaleDateString(),
            doc.linked_tasks.length.toString(),
            doc.linked_artifacts.length.toString(),
        ]);
    }
    console.log(table.toString());
}
async function showAnalysis(analysisDir, options) {
    if (!options.phase) {
        console.error(chalk_1.default.red("Error: --phase is required for show command"));
        process.exit(1);
    }
    const filePath = node_path_1.default.join(analysisDir, `${options.phase}.yaml`);
    try {
        const content = await promises_1.default.readFile(filePath, "utf-8");
        const doc = js_yaml_1.default.load(content);
        if (options.json) {
            console.log(JSON.stringify(doc, null, 2));
            return;
        }
        console.log(chalk_1.default.bold(`\nPhase Analysis: ${doc.phase}\n`));
        console.log(chalk_1.default.gray(`Status: ${doc.status}`));
        console.log(chalk_1.default.gray(`Updated: ${new Date(doc.updated_at).toLocaleString()}\n`));
        console.log(chalk_1.default.bold("Summary:"));
        console.log(doc.summary);
        console.log();
        if (doc.key_findings.length > 0) {
            console.log(chalk_1.default.bold("Key Findings:"));
            for (const finding of doc.key_findings) {
                console.log(`  • ${finding}`);
            }
            console.log();
        }
        if (doc.decisions.length > 0) {
            console.log(chalk_1.default.bold("Decisions:"));
            for (const decision of doc.decisions) {
                console.log(`  • ${decision}`);
            }
            console.log();
        }
        if (doc.linked_tasks.length > 0) {
            console.log(chalk_1.default.bold("Linked Tasks:"));
            for (const task of doc.linked_tasks) {
                console.log(`  • ${task}`);
            }
            console.log();
        }
        if (doc.linked_artifacts.length > 0) {
            console.log(chalk_1.default.bold("Linked Artifacts:"));
            for (const artifact of doc.linked_artifacts) {
                console.log(`  • ${artifact}`);
            }
            console.log();
        }
        if (doc.document_paths.length > 0) {
            console.log(chalk_1.default.bold("Document Paths:"));
            for (const docPath of doc.document_paths) {
                console.log(`  • ${docPath}`);
            }
            console.log();
        }
        if (doc.templates_used.length > 0) {
            console.log(chalk_1.default.bold("Templates Used:"));
            for (const template of doc.templates_used) {
                console.log(`  • ${template}`);
            }
            console.log();
        }
        if (doc.content) {
            console.log(chalk_1.default.bold("Detailed Content:"));
            console.log(doc.content);
        }
    }
    catch (e) {
        console.error(chalk_1.default.red(`Error: Analysis for phase '${options.phase}' not found`));
        process.exit(1);
    }
}
async function writeAnalysis(analysisDir, options) {
    if (!options.phase) {
        console.error(chalk_1.default.red("Error: --phase is required"));
        process.exit(1);
    }
    const filePath = node_path_1.default.join(analysisDir, `${options.phase}.yaml`);
    // Load existing or create new
    let doc;
    try {
        const content = await promises_1.default.readFile(filePath, "utf-8");
        doc = js_yaml_1.default.load(content);
        doc.updated_at = new Date().toISOString();
    }
    catch {
        doc = {
            id: `analysis-${options.phase}`,
            phase: options.phase,
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            summary: "",
            key_findings: [],
            decisions: [],
            linked_tasks: [],
            linked_artifacts: [],
            document_paths: [],
            templates_used: [],
            content: "",
        };
    }
    // Update fields
    if (options.content !== undefined) {
        doc.content = options.content;
    }
    if (options.tasks !== undefined) {
        doc.linked_tasks = options.tasks
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);
    }
    if (options.artifacts !== undefined) {
        doc.linked_artifacts = options.artifacts
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a);
    }
    if (options.docs !== undefined) {
        doc.document_paths = options.docs
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d);
    }
    if (options.templates !== undefined) {
        doc.templates_used = options.templates
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);
    }
    // Save
    const yamlContent = js_yaml_1.default.dump(doc, { lineWidth: -1 });
    await promises_1.default.writeFile(filePath, yamlContent, "utf-8");
    if (options.json) {
        console.log(JSON.stringify(doc, null, 2));
    }
    else {
        console.log(chalk_1.default.green(`✓ Analysis for phase '${options.phase}' saved`));
    }
}
//# sourceMappingURL=analysis.js.map