#!/usr/bin/env node
/**
 * spec-graph plan — Plan Stage Orchestrator
 *
 * Single-shot command that shows plan status and outputs clear agent instructions.
 *
 * Usage pattern (agent-driven):
 *   1. spec-graph plan          → show what needs to be produced
 *   2. Agent reads instructions → produces documents
 *   3. Agent calls: spec-graph artifact complete <id>
 *   4. spec-graph plan          → check progress
 *   5. Repeat until plan complete
 *
 * This is NOT a loop — it's a single-shot status + instruction command.
 * The agent re-runs it after each artifact to drive the plan forward.
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { readYaml } from "../utils/yaml";

export interface PlanOptions {
  json?: boolean;
}

export async function planCommand(
  projectRoot: string,
  options: PlanOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    await fs.access(graphPath);
    await fs.access(statePath);
  } catch {
    console.log(chalk.red("✗ Project not initialized. Run `spec-graph init` first."));
    process.exit(1);
  }

  const graph = await readYaml<any>(graphPath);
  const state = await readYaml<any>(statePath);

  const currentStage = state.current_stage || "plan";
  if (currentStage !== "plan") {
    console.log(chalk.green(`✓ Plan complete. Current: ${currentStage}`));
    return;
  }

  // Dispatches won't progress without an agent — just run one dispatch
  const { dispatchCommand } = await import("./dispatch");
  let manifest: any = null;

  // Capture dispatch output
  const originalLog = console.log;
  console.log = (data: string) => {
    try { manifest = JSON.parse(data); } catch {}
  };

  try {
    await dispatchCommand(projectRoot, { json: true });
  } catch (e: any) {
    console.log = originalLog;
    console.log(chalk.yellow(`(Dispatch: ${e.message})`));
  }
  console.log = originalLog;

  // Show current status
  const allArtifacts = graph.artifacts || [];
  const artifactStates = state.artifacts || {};

  const completed = allArtifacts.filter((a: any) => {
    const s = artifactStates[a.id];
    return s && s.status === "completed";
  });

  const pending = allArtifacts.filter((a: any) => {
    const s = artifactStates[a.id];
    return !s || s.status !== "completed";
  });

  if (options.json) {
    console.log(JSON.stringify({
      stage: currentStage,
      gate: manifest?.blocking_gate,
      gate_passed: manifest?.gate_passed,
      artifacts_total: allArtifacts.length,
      artifacts_completed: completed.length,
      artifacts_pending: pending.map((a: any) => ({ id: a.id, kind: a.kind })),
      actions: manifest?.actions,
    }, null, 2));
    return;
  }

  console.log(chalk.bold(`\n Plan Stage Status`));
  console.log(chalk.gray(`  Stage: ${currentStage}`));
  console.log(chalk.gray(`  Artifacts: ${completed.length}/${allArtifacts.length} completed`));

  if (pending.length === 0) {
    console.log(chalk.green("\n✓ All plan artifacts completed."));
    console.log(chalk.gray("  Run: spec-graph next"));
    return;
  }

  // Show pending by kind with priority
  const byKind: Record<string, string[]> = {};
  for (const a of pending) {
    const kind = a.kind || "unknown";
    if (!byKind[kind]) byKind[kind] = [];
    byKind[kind].push(a.id);
  }

  const kindOrder = ["requirement", "design", "plan", "contract", "verification", "implementation", "meta"];

  console.log(chalk.cyan(`\n  Pending artifacts (${pending.length}):\n`));
  for (const kind of kindOrder) {
    if (!byKind[kind]) continue;
    for (const id of byKind[kind]) {
      const action = manifest?.actions?.find((a: any) => a.id === id);
      const agentRole = action?.agent_role || "agent";
      const templateRef = action?.template_ref || "";
      const docPath = action?.suggested_doc_path || `.spec-graph/artifacts/${kind}/`;
      console.log(chalk.yellow(`  ⬜ ${id}`));
      console.log(chalk.gray(`      Role: ${agentRole}  →  ${docPath}`));
    }
  }

  // Gate status
  if (manifest && !manifest.gate_passed) {
    console.log(chalk.red(`\n  Gate blocked: ${manifest.blocking_gate}`));
  }

  // Agent instructions
  console.log(chalk.gray("\n  ─────────────────────────────────────────"));
  console.log(chalk.bold("\n  Agent — execute this:"));
  console.log(chalk.gray("\n  For each pending artifact above:"));
  console.log(chalk.gray("    1. Produce document at the suggested path"));
  console.log(chalk.gray("    2. Mark complete:"));
  console.log(chalk.green("       spec-graph artifact complete <id> --producer agent"));
  console.log(chalk.gray("    3. Re-check progress:"));
  console.log(chalk.green("       spec-graph plan"));
  console.log(chalk.gray("\n  Or run dispatch for detailed context:"));
  console.log(chalk.green("       spec-graph dispatch --json"));
}
