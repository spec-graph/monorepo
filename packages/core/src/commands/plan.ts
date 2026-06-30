#!/usr/bin/env node
/**
 * spec-graph plan — Plan Stage Status
 *
 * Single-shot command that reads graph.yaml + machine-state.yaml
 * and shows which artifacts still need to be produced.
 *
 * Does NOT call dispatch — reads files directly.
 * The agent uses dispatch to get detailed production context.
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
    console.log("Project not initialized. Run: spec-graph init");
    process.exit(1);
  }

  const graph = await readYaml<any>(graphPath);
  const state = await readYaml<any>(statePath);

  const currentStage = state.current_stage || "plan";
  if (currentStage !== "plan") {
    console.log(`✓ Plan complete. Current stage: ${currentStage}`);
    return;
  }

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
      artifacts_total: allArtifacts.length,
      artifacts_completed: completed.length,
      artifacts_pending: pending.map((a: any) => ({
        id: a.id,
        kind: a.kind,
        agent_role: inferRoleByKind(a.kind),
        suggested_path: `.spec-graph/artifacts/${getKindDir(a.kind)}/${a.id.split("/").pop()}.md`,
      })),
    }, null, 2));
    return;
  }

  console.log(`\n Plan Stage Status`);
  console.log(`  Stage: ${currentStage}`);
  console.log(`  Artifacts: ${completed.length}/${allArtifacts.length} completed`);

  if (pending.length === 0) {
    console.log("\n✓ All artifacts completed. Ready for development.");
    return;
  }

  // Group by kind
  const byKind: Record<string, string[]> = {};
  for (const a of pending) {
    const k = a.kind || "unknown";
    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(a.id);
  }

  const kindOrder = ["requirement", "design", "plan", "contract", "verification", "implementation", "change-record", "meta"];

  console.log(`\n  Pending (${pending.length}):\n`);
  for (const kind of kindOrder) {
    if (!byKind[kind]) continue;
    const role = inferRoleByKind(kind);
    console.log(`  ${kind}:`);
    for (const id of byKind[kind]) {
      console.log(`    ⬜ ${id}`);
    }
  }

  console.log(`\n  ───────────────────────────────────────────`);
  console.log(`\n  Agent — produce these artifacts:`);
  console.log(`\n  For each artifact:`);
  console.log(`    1. spec-graph dispatch --json  (get full context)`);
  console.log(`    2. Produce document at suggested path`);
  console.log(`    3. spec-graph artifact complete <id> --producer agent`);
  console.log(`    4. spec-graph plan              (re-check progress)`);
}

/** Map artifact kind to responsible agent role */
function inferRoleByKind(kind: string): string {
  const map: Record<string, string> = {
    requirement: "pm-agent",
    design: "architect-agent",
    plan: "developer-agent",
    contract: "architect-agent",
    verification: "qa-agent",
    implementation: "developer-agent",
    "change-record": "developer-agent",
    meta: "developer-agent",
  };
  return map[kind] || "developer-agent";
}

/** Map artifact kind to directory */
function getKindDir(kind: string): string {
  const map: Record<string, string> = {
    requirement: "requirements",
    design: "design",
    plan: "plan",
    contract: "contract",
    verification: "verification",
    implementation: "implementation",
    "change-record": "change-record",
    meta: "meta",
  };
  return map[kind] || kind;
}
