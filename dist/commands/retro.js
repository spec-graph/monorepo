"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retroCommand = retroCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Generate a retrospective document for a completed change.
 * Captures what worked, what didn't, and action items for future changes.
 */
async function retroCommand(projectRoot, options) {
    const changesDir = node_path_1.default.join(projectRoot, ".spec-graph", "changes");
    const retrosDir = node_path_1.default.join(projectRoot, ".spec-graph", "retros");
    if (!options.changeId) {
        console.log(chalk_1.default.red("✗ Change ID required. Usage: spec-graph retro <change-id>"));
        process.exit(1);
        return;
    }
    // Find the change JSON
    const changePath = await findChangeJson(changesDir, options.changeId);
    if (!changePath) {
        console.log(chalk_1.default.red(`✗ Change not found: ${options.changeId}`));
        process.exit(1);
        return;
    }
    // Read change data
    const changeData = JSON.parse(await promises_1.default.readFile(changePath, "utf-8"));
    // Create retro directory
    await promises_1.default.mkdir(retrosDir, { recursive: true });
    // Generate retro MD
    const retroPath = node_path_1.default.join(retrosDir, `${options.changeId}-retro.md`);
    const retroContent = generateRetroTemplate(changeData);
    await promises_1.default.writeFile(retroPath, retroContent, "utf-8");
    console.log(chalk_1.default.green(`✓ Retrospective generated: ${retroPath}`));
    console.log(chalk_1.default.gray(`  Edit this file to capture lessons learned.`));
    console.log(chalk_1.default.gray(`  Changes archive: ${changesDir}`));
}
async function findChangeJson(changesDir, changeId) {
    try {
        const files = await promises_1.default.readdir(changesDir);
        const match = files.find((f) => f.startsWith(changeId) && f.endsWith(".json"));
        return match ? node_path_1.default.join(changesDir, match) : null;
    }
    catch {
        return null;
    }
}
function generateRetroTemplate(changeData) {
    return `# Retrospective: ${changeData.title}

> Change ID: ${changeData.id}
> Type: ${changeData.type} | Priority: ${changeData.priority}
> Created: ${changeData.created_at}
> Archived: ${new Date().toISOString()}

## 概述

${changeData.description || "（描述此变更的目标）"}

## 什么有效

- （列出做得好的方面）
-
-

## 什么无效

- （列出遇到的问题）
-
-

## 学到的教训

- （列出关键教训）
-
-

## 下次改进

- （列出下次改进的具体行动）
-
-

## 行动项

| 行动项 | 负责人 | 截止日期 | 状态 |
|--------|--------|----------|------|
| | | | TODO |
| | | | TODO |
`;
}
//# sourceMappingURL=retro.js.map