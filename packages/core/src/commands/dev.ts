#!/usr/bin/env node
/**
 * spec-graph dev — Development Loop Engine
 *
 * Drives the codingreviewingtesting iterative cycle.
 * Independent top-level command, not a subcommand of change.
 *
 * Workflow:
 *   1. Find active change (in_progress)
 *   2. Read linked story for requirements
 *   3. Dev loop:
 *      - coding: agent writes code, runs unit tests
 *      - reviewing: code quality review
 *      - testing: full test suite
 *      - if issues found → fix → back to coding
 *   4. Loop until all checks pass
 *   5. Suggest: spec-graph change complete
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { readYaml } from "../utils/yaml";
import { runCheck } from "../engine/check/index";

export interface DevOptions {
  change?: string;  // Optional: specify change ID
  skipReview?: boolean;
  maxIterations?: string;
}

export async function devCommand(
  projectRoot: string,
  options: DevOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const changesDir = path.join(specGraphDir, "changes");

  try {
    // Step 1: Find active change
    const changeId = options.change || await findActiveChange(changesDir);
    if (!changeId) {
      console.log(chalk.red("✗ No active change found"));
      console.log(chalk.gray("  Create one: spec-graph change create"));
      console.log(chalk.gray("  Apply it: spec-graph change apply <id>"));
      process.exit(1);
    }

    // Step 2: Load change
    const changePath = path.join(changesDir, `${changeId}.json`);
    let change: any;
    try {
      change = await readYaml(changePath);
    } catch {
      console.log(chalk.red(`✗ Change not found: ${changeId}`));
      process.exit(1);
    }

    if (change.status !== "in_progress") {
      console.log(chalk.red(`✗ Change '${changeId}' is '${change.status}', not 'in_progress'`));
      console.log(chalk.gray("  Apply it first: spec-graph change apply " + changeId));
      process.exit(1);
    }

    // Step 3: Load linked story (if any)
    let storyContext = "";
    if (change.linked_story) {
      storyContext = await loadStoryContext(projectRoot, change.linked_story);
    }

    // Step 4: Start dev loop
    console.log(chalk.bold(`\n Dev Loop: ${change.title}`));
    if (change.linked_story) {
      console.log(chalk.gray(`  Story: ${change.linked_story}`));
    }
    console.log(chalk.gray(`  Change: ${changeId}\n`));

    const maxIterations = parseInt(options.maxIterations || "10", 10);
    let iteration = 0;
    let phase: "coding" | "reviewing" | "testing" = "coding";

    while (iteration < maxIterations) {
      iteration++;
      console.log(chalk.cyan(`\n  ── Iteration ${iteration} / ${maxIterations} ──\n`));

      if (phase === "coding") {
        console.log(chalk.yellow("   Phase: CODING"));
        console.log(chalk.gray("  Agent: Write/modify code for this change"));
        if (storyContext) {
          console.log(chalk.gray(`  Requirements: ${change.linked_story}`));
        }
        console.log(chalk.gray("  Agent: spec-graph dispatch"));
        console.log(chalk.gray("  Agent: spec-graph check --layer unit"));

        const unitResult = await runCheckLayer(projectRoot, "unit");
        if (unitResult.passed) {
          console.log(chalk.green("  ✓ Unit tests passed"));
          phase = "reviewing";
        } else {
          console.log(chalk.red(`  ✗ Unit tests failed: ${unitResult.failed.join(", ")}`));
          console.log(chalk.yellow("  → Agent: Fix code"));
          console.log(chalk.gray("  Agent: spec-graph dev (retry)"));
          return;
        }
      }

      if (phase === "reviewing") {
        if (options.skipReview) {
          console.log(chalk.gray("  (Review skipped)"));
          phase = "testing";
          continue;
        }

        console.log(chalk.yellow("   Phase: REVIEWING"));
        console.log(chalk.gray("  Agent: Review code quality"));
        console.log(chalk.gray("  Agent: spec-graph review --artifact <id>"));

        // For now, auto-advance (sub-agent review not yet integrated)
        console.log(chalk.gray("  (Automated review pending sub-agent integration)"));
        phase = "testing";
      }

      if (phase === "testing") {
        console.log(chalk.yellow("  🧪 Phase: TESTING"));
        console.log(chalk.gray("  Running full test suite..."));

        const allResult = await runCheckLayer(projectRoot, "unit,integration");
        if (allResult.passed) {
          console.log(chalk.green("  ✓ All tests passed"));
          console.log(chalk.green(`\n  ✅ Dev loop completed!`));
          console.log(chalk.gray(`  Next: spec-graph change complete ${changeId}`));
          return;
        } else {
          console.log(chalk.red(`  ✗ Tests failed: ${allResult.failed.join(", ")}`));
          console.log(chalk.yellow("  → Agent: Fix issues"));
          phase = "coding";
        }
      }
    }

    console.log(chalk.red(`\n   Max iterations (${maxIterations}) reached`));
    console.log(chalk.gray("  Agent: Manual intervention required"));
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    process.exit(1);
  }
}

/**
 * Find the active (in_progress) change.
 */
async function findActiveChange(changesDir: string): Promise<string | null> {
  try {
    const files = await fs.readdir(changesDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json") && !f.includes("-plan"));

    for (const file of jsonFiles) {
      const change: any = await readYaml(path.join(changesDir, file));
      if (change.status === "in_progress") {
        return change.id;
      }
    }
  } catch {
    // Changes dir doesn't exist
  }
  return null;
}

/**
 * Load story context from plan/story.md.
 */
async function loadStoryContext(projectRoot: string, storyId: string): Promise<string> {
  const storyPath = path.join(projectRoot, ".spec-graph/artifacts/plan/story.md");
  try {
    const content = await fs.readFile(storyPath, "utf-8");
    // Extract story section by ID
    const lines = content.split("\n");
    let inStory = false;
    const storyLines: string[] = [];

    for (const line of lines) {
      if (line.includes(storyId)) {
        inStory = true;
      } else if (inStory && line.startsWith("#") && line.includes("S")) {
        break;
      } else if (inStory) {
        storyLines.push(line);
      }
    }

    return storyLines.join("\n").trim();
  } catch {
    return "";
  }
}

/**
 * Run checks for a layer and return result.
 */
async function runCheckLayer(
  projectRoot: string,
  layer: string,
): Promise<{ passed: boolean; failed: string[] }> {
  try {
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
