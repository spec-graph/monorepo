import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";

export interface RetroOptions {
  changeId?: string;
}

/**
 * Generate a retrospective document for a completed change.
 * Captures what worked, what didn't, and action items for future changes.
 */
export async function retroCommand(
  projectRoot: string,
  options: RetroOptions,
): Promise<void> {
  const changesDir = path.join(projectRoot, ".spec-graph", "changes");
  const retrosDir = path.join(projectRoot, ".spec-graph", "retros");

  if (!options.changeId) {
    console.log(chalk.red("✗ Change ID required. Usage: spec-graph retro <change-id>"));
    process.exit(1);
    return;
  }

  // Find the change JSON
  const changePath = await findChangeJson(changesDir, options.changeId);
  if (!changePath) {
    console.log(chalk.red(`✗ Change not found: ${options.changeId}`));
    process.exit(1);
    return;
  }

  // Read change data
  const changeData = JSON.parse(await fs.readFile(changePath, "utf-8"));

  // Create retro directory
  await fs.mkdir(retrosDir, { recursive: true });

  // Generate retro MD
  const retroPath = path.join(retrosDir, `${options.changeId}-retro.md`);
  const retroContent = generateRetroTemplate(changeData);
  await fs.writeFile(retroPath, retroContent, "utf-8");

  console.log(chalk.green(`✓ Retrospective generated: ${retroPath}`));
  console.log(chalk.gray(`  Edit this file to capture lessons learned.`));
  console.log(chalk.gray(`  Changes archive: ${changesDir}`));
}

async function findChangeJson(
  changesDir: string,
  changeId: string,
): Promise<string | null> {
  try {
    const files = await fs.readdir(changesDir);
    const match = files.find((f) => f.startsWith(changeId) && f.endsWith(".json"));
    return match ? path.join(changesDir, match) : null;
  } catch {
    return null;
  }
}

function generateRetroTemplate(changeData: any): string {
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
