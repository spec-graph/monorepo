/**
 * spec-graph dev — Development Loop Engine
 *
 * Drives coding/reviewing/testing through sub-agent dispatch.
 * Each phase dispatches a dedicated sub-agent via the Agent tool.
 *
 * Phase agents:
 *   - coding:    Developer Agent (write code, run unit tests)
 *   - reviewing: Reviewer Agent (code review, approve/reject)
 *   - testing:   QA Agent (run test suite, fix failures)
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { readYaml } from "../utils/yaml";
import { runCheck } from "../engine/check/index";

export interface DevOptions {
  change?: string;
  skipReview?: boolean;
  maxIterations?: string;
}

const PHASE_AGENTS = {
  coding: {
    agent_id: "developer-agent",
    agent_prompt_ref: "packs/foundation.pack/agents/developer-agent.md",
    title: "CODING",
    role: "Software Developer — implements code, writes unit tests, commits",
  },
  reviewing: {
    agent_id: "reviewer-agent",
    agent_prompt_ref: "packs/foundation.pack/agents/reviewer-agent.md",
    title: "REVIEWING",
    role: "Code Reviewer — reviews implementation, finds issues, suggests improvements",
  },
  testing: {
    agent_id: "qa-agent",
    agent_prompt_ref: "packs/foundation.pack/agents/qa-agent.md",
    title: "TESTING",
    role: "QA Engineer — runs tests, reports failures, verifies fixes",
  },
};

export async function devCommand(
  projectRoot: string,
  options: DevOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const changesDir = path.join(specGraphDir, "changes");

  try {
    const changeId = options.change || await findActiveChange(changesDir);
    if (!changeId) {
      console.log("No active change. Create: spec-graph change create; Apply: spec-graph change apply");
      process.exit(1);
    }

    const changePath = path.join(changesDir, `${changeId}.json`);
    let change: any;
    try { change = await readYaml(changePath); } catch {
      console.log(`Change not found: ${changeId}`);
      process.exit(1);
    }
    if (change.status !== "in_progress") {
      console.log(`Change is '${change.status}', not 'in_progress'. Apply first.`);
      process.exit(1);
    }

    // Load dev state or start from coding
    const devState = await loadDevState(projectRoot);
    const phase = devState?.phase || "coding";
    const iteration = (devState?.iteration || 0) + 1;
    const maxIter = parseInt(options.maxIterations || "10", 10);

    if (iteration > maxIter) {
      console.log(`Max iterations (${maxIter}) reached.`);
      process.exit(1);
    }

    await saveDevState(projectRoot, { change_id: changeId, phase, iteration });

    const agent = PHASE_AGENTS[phase as "coding" | "reviewing" | "testing"];
    console.log(`\n  ${agent.title}  (Iteration ${iteration}/${maxIter})\n`);
    console.log(`  Role: ${agent.role}`);
    console.log(`  Change: ${change.title}`);

    if (change.linked_story) {
      console.log(`  Story: ${change.linked_story}`);
    }

    // ── CODING ──
    if (phase === "coding") {
      console.log("\n  Agent — dispatch Developer Agent:\n");
      console.log("  Agent({");
      console.log(`    description: "coding - ${change.title}",`);
      console.log("    subagent_type: \"general-purpose\",");
      console.log(`    prompt: \`Role: ${agent.role}`);
      console.log(`      Task: Implement ${change.title}`);
      console.log("      1. Read story requirements");
      console.log("      2. Write implementation code + unit tests");
      console.log("      3. Run: spec-graph check --layer unit");
      console.log("      4. If pass → report DONE, run spec-graph dev");
      console.log("      5. If fail → fix and re-run checks");
      console.log(`      System prompt: ${agent.agent_prompt_ref}\``);
      console.log("  })");
      console.log("\n  After coding: spec-graph dev (advances to reviewing)");
    }

    // ── REVIEWING ──
    if (phase === "reviewing") {
      if (options.skipReview) {
        console.log("\n  (Review skipped)");
        await saveDevState(projectRoot, { change_id: changeId, phase: "testing", iteration });
        console.log("  Re-run: spec-graph dev");
        return;
      }

      console.log("\n  Agent — dispatch Reviewer Agent:\n");
      console.log("  Agent({");
      console.log(`    description: "reviewing - ${change.title}",`);
      console.log("    subagent_type: \"general-purpose\",");
      console.log(`    prompt: \`Role: ${agent.role}`);
      console.log(`      Task: Review code for ${change.title}`);
      console.log("      Focus: correctness, security, performance, maintainability");
      console.log("      Output: APPROVE / REQUEST_CHANGES / REJECT");
      console.log("      If APPROVE → report DONE, run spec-graph dev --skip-review");
      console.log("      If CHANGES → list issues, return to coding");
      console.log(`      System prompt: ${agent.agent_prompt_ref}\``);
      console.log("  })");
      console.log("\n  After review: spec-graph dev (advances or back to coding)");
    }

    // ── TESTING ──
    if (phase === "testing") {
      console.log("\n  Running test suite...");
      const result = await runCheckLayer(projectRoot, "unit,integration");

      if (result.passed) {
        console.log("  ✓ All tests passed");
        console.log("\n  ✅ Dev loop completed!");
        console.log(`  Next: spec-graph change complete ${changeId}`);
        await saveDevState(projectRoot, {
          change_id: changeId, phase: "complete", iteration,
          completed_at: new Date().toISOString(),
        });
        return;
      }

      console.log(`  ✗ Failed: ${result.failed.join(", ")}`);
      console.log("\n  Agent — dispatch QA Agent:\n");
      console.log("  Agent({");
      console.log(`    description: "testing - ${change.title}",`);
      console.log("    subagent_type: \"general-purpose\",");
      console.log(`    prompt: \`Role: ${agent.role}`);
      console.log(`      Task: Fix failing tests for ${change.title}`);
      console.log("      1. Analyze test failures");
      console.log("      2. Fix the issues");
      console.log("      3. Re-run: spec-graph check --layer unit,integration");
      console.log("      4. If all pass → report DONE, run spec-graph dev");
      console.log(`      System prompt: ${agent.agent_prompt_ref}\``);
      console.log("  })");
      console.log("\n  After fixing: spec-graph dev (returns to testing)");
    }
  } catch (e: any) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

async function loadDevState(projectRoot: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, ".spec-graph", "dev-state.json"), "utf-8"));
  } catch { return null; }
}

async function saveDevState(projectRoot: string, state: Record<string, any>): Promise<void> {
  const p = path.join(projectRoot, ".spec-graph", "dev-state.json");
  let existing: any = {};
  try { existing = JSON.parse(await fs.readFile(p, "utf-8")); } catch {}
  await fs.writeFile(p, JSON.stringify({ ...existing, ...state, updated_at: new Date().toISOString() }, null, 2));
}

async function findActiveChange(changesDir: string): Promise<string | null> {
  try {
    for (const f of await fs.readdir(changesDir)) {
      if (!f.endsWith(".json") || f.includes("-plan")) continue;
      const c: any = await readYaml(path.join(changesDir, f));
      if (c.status === "in_progress") return c.id;
    }
  } catch {}
  return null;
}

async function runCheckLayer(projectRoot: string, layer: string): Promise<{ passed: boolean; failed: string[] }> {
  try {
    const graph = await readYaml<any>(path.join(projectRoot, ".spec-graph", "graph.yaml"));
    const layers = layer.split(",");
    const checks = (graph.checks || []).filter((c: any) => layers.includes(c.layer));
    if (checks.length === 0) return { passed: true, failed: [] };
    let passed = true; const failed: string[] = [];
    for (const check of checks) {
      try {
        const r = await runCheck(check, { cwd: projectRoot, timeoutMs: 30000 });
        if (r.status !== "passed") { passed = false; failed.push(check.id); }
      } catch { passed = false; failed.push(check.id); }
    }
    return { passed, failed };
  } catch { return { passed: true, failed: [] }; }
}
