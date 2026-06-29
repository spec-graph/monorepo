import path from "node:path";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import chalk from "chalk";
import Table from "cli-table3";
import { Graph } from "../types/index";
import { StateMachineEngine } from "../engine/machine/index";
import { readYaml, writeYaml } from "../utils/yaml";

export interface PrimeOptions {
  bootstrap?: boolean;
  json?: boolean;
}

interface PrimeResult {
  artifacts_seeded: number;
  checks_seeded: number;
  checks_bootstrapped: number;
  traces_seeded: number;
  total_artifacts: number;
  total_checks: number;
}

export async function primeCommand(
  projectRoot: string,
  options: PrimeOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  try {
    const graph = await loadGraphOrExit(graphPath);
    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    await engine.getState();

    const result: PrimeResult = {
      artifacts_seeded: 0,
      checks_seeded: 0,
      checks_bootstrapped: 0,
      traces_seeded: 0,
      total_artifacts: (graph.artifacts || []).length,
      total_checks: (graph.checks || []).length,
    };

    await seedArtifacts(graph, engine, result);
    await seedChecks(graph, engine, options, result);
    await seedTraceSkeletons(graph, specGraphDir, result);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      renderPrimeResult(result);
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function loadGraphOrExit(graphPath: string): Promise<Graph> {
  try {
    return await readYaml<Graph>(graphPath);
  } catch {
    console.log(
      chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
    );
    process.exit(1);
    throw new Error("unreachable");
  }
}

async function seedArtifacts(
  graph: Graph,
  engine: StateMachineEngine,
  result: PrimeResult,
): Promise<void> {
  for (const artifact of graph.artifacts || []) {
    const current = (await engine.getArtifacts())[artifact.id];
    if (!current) {
      await engine.updateArtifact(artifact.id, { status: "pending" });
      result.artifacts_seeded++;
    }
  }
}

async function seedChecks(
  graph: Graph,
  engine: StateMachineEngine,
  options: PrimeOptions,
  result: PrimeResult,
): Promise<void> {
  for (const check of graph.checks || []) {
    const current = (await engine.getChecks())[check.id];
    if (current) continue;

    if (options.bootstrap && isPlaceholderCommand(check.command)) {
      await engine.updateCheck(check.id, {
        status: "passed",
        executed_at: new Date().toISOString(),
      });
      result.checks_bootstrapped++;
    } else {
      await engine.updateCheck(check.id, { status: "pending" });
      result.checks_seeded++;
    }
  }
}

async function seedTraceSkeletons(
  graph: Graph,
  specGraphDir: string,
  result: PrimeResult,
): Promise<void> {
  const tracesDir = path.join(specGraphDir, "traces");
  await fs.mkdir(tracesDir, { recursive: true });

  for (const gate of graph.gates || []) {
    for (const trace of gate.require_traces || []) {
      const seeded = await seedTraceFile(
        tracesDir,
        trace,
        graph.artifacts || [],
      );
      if (seeded) result.traces_seeded++;
    }
  }
}

async function seedTraceFile(
  tracesDir: string,
  trace: any,
  artifacts: any[],
): Promise<boolean> {
  const traceFile = path.join(tracesDir, `${kebabToSnake(trace.name)}.yaml`);
  try {
    await fs.access(traceFile, fsConstants.F_OK);
    return false; // already exists
  } catch {
    // continue to create
  }

  const fromArtifacts = artifacts.filter(
    (a) => a.kind === trace.from_kind || a.id === trace.from_kind,
  );
  const toArtifacts = artifacts.filter(
    (a) => a.kind === trace.to_kind || a.id === trace.to_kind,
  );
  const relation = (trace.via || ["derives"])[0];

  const skeleton = buildTraceSkeleton(
    fromArtifacts,
    toArtifacts,
    trace,
    relation,
  );
  await writeYaml(traceFile, skeleton);
  return true;
}

function buildTraceSkeleton(
  fromArtifacts: any[],
  toArtifacts: any[],
  trace: any,
  relation: string,
): any {
  // If 1:1 match, use real IDs
  if (fromArtifacts.length === 1 && toArtifacts.length === 1) {
    return {
      traces: [
        {
          from: fromArtifacts[0].id,
          from_kind: trace.from_kind,
          to: toArtifacts[0].id,
          to_kind: trace.to_kind,
          relation,
        },
      ],
    };
  }

  // Multiple or zero matches — enumerate possibilities
  const fromList =
    fromArtifacts.length > 0
      ? fromArtifacts
      : [{ id: "<source-artifact-id>", kind: trace.from_kind }];
  const toList =
    toArtifacts.length > 0
      ? toArtifacts
      : [{ id: "<target-artifact-id>", kind: trace.to_kind }];

  const entries = fromList.flatMap((fa) =>
    toList.map((ta) => ({
      from: fa.id,
      from_kind: trace.from_kind,
      to: ta.id,
      to_kind: trace.to_kind,
      relation,
    })),
  );

  return { traces: entries };
}

function isPlaceholderCommand(command: string): boolean {
  return /^<[^>]+>$/.test(command.trim());
}

function kebabToSnake(name: string): string {
  return name.replace(/-/g, "_");
}

function renderPrimeResult(result: PrimeResult): void {
  console.log(chalk.bold("\n✓ Machine state primed\n"));

  const table = new Table({
    head: ["Resource", "Seeded", "Total"],
    style: { head: ["cyan"] },
  });

  const artifactLine =
    result.artifacts_seeded > 0
      ? `${result.artifacts_seeded} added`
      : "up to date";
  table.push(["Artifacts", artifactLine, result.total_artifacts]);

  const checkParts: string[] = [];
  if (result.checks_seeded > 0)
    checkParts.push(`${result.checks_seeded} pending`);
  if (result.checks_bootstrapped > 0)
    checkParts.push(`${result.checks_bootstrapped} bootstrapped`);
  const checkLine =
    checkParts.length > 0 ? checkParts.join(", ") : "up to date";
  table.push(["Checks", checkLine, result.total_checks]);

  table.push([
    "Trace files",
    result.traces_seeded > 0
      ? `${result.traces_seeded} skeletons`
      : "none needed",
    "-",
  ]);

  console.log(table.toString());

  if (result.checks_bootstrapped > 0) {
    console.log(
      chalk.gray("\n  Bootstrapped placeholder checks are marked passed."),
    );
    console.log(
      chalk.gray(
        "  Replace <placeholder> commands with real checks and re-run `spec-graph check`.",
      ),
    );
  }

  if (result.traces_seeded > 0) {
    console.log(
      chalk.gray("\n  Trace skeleton files created in .spec-graph/traces/."),
    );
    console.log(
      chalk.gray(
        "  Edit them to link real artifact IDs, then re-run `spec-graph next`.",
      ),
    );
  }

  console.log(chalk.bold("\n  Next: spec-graph next\n"));
}
