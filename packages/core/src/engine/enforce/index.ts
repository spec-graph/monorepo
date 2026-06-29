import fs from "node:fs/promises";
import path from "node:path";
import {
  Graph,
  Gate,
  ContractRegistryEntry,
  ContractBinding,
} from "../../types/index";
import { MachineState } from "../machine/index";
import {
  buildTraceIndex,
  evaluateTraceQuery,
  TraceIndex,
} from "../trace/index";
import { readYaml, tryReadYaml } from "../../utils/yaml";

export interface GateEvaluationResult {
  gate_id: string;
  passed: boolean;
  missing_artifacts: string[];
  missing_checks: string[];
  missing_traces: string[];
  missing_contracts: string[];
  violated_forbids: string[];
  warnings: string[];
}

export interface EnforceResult {
  evaluated_gates: GateEvaluationResult[];
  blocking_gates: string[];
  all_passed: boolean;
}

export interface EnforceOptions {
  phase?: string;
}

export async function runEnforce(
  projectRoot: string,
  graph: Graph,
  options: EnforceOptions = {},
): Promise<EnforceResult> {
  const state = await loadMachineState(projectRoot, graph);
  const traceIndex = await buildTraceIndex(projectRoot, graph);
  const forbiddenInvariants = await loadForbiddenInvariants(projectRoot);
  const contractEntries = await loadContractRegistry(projectRoot);
  const evaluatedGates: GateEvaluationResult[] = [];
  const blockingGates: string[] = [];

  for (const gate of graph.gates) {
    if (!gate.enabled) continue;
    if (options.phase && gate.id !== options.phase) continue;

    const result = evaluateGate(
      gate,
      state,
      traceIndex,
      forbiddenInvariants,
      contractEntries,
    );
    evaluatedGates.push(result);

    if (!result.passed && gate.fail_mode === "block") {
      blockingGates.push(gate.id);
    }
  }

  return {
    evaluated_gates: evaluatedGates,
    blocking_gates: blockingGates,
    all_passed: blockingGates.length === 0,
  };
}

async function loadMachineState(
  projectRoot: string,
  graph: Graph,
): Promise<MachineState> {
  const statePath = path.join(projectRoot, ".spec-graph", "machine-state.yaml");

  try {
    return await readYaml<MachineState>(statePath);
  } catch {
    return {
      current_stage: graph.pipeline_skeleton.stages[0] || "start",
      stage_history: [],
      artifacts: {},
      checks: {},
      metadata: {},
    };
  }
}

export async function loadForbiddenInvariants(
  projectRoot: string,
): Promise<Set<string>> {
  const invariantsFile = path.join(
    projectRoot,
    ".spec-graph",
    "invariants.json",
  );

  try {
    const content = await fs.readFile(invariantsFile, "utf-8");
    const invariantsData = JSON.parse(content);
    return new Set(invariantsData.violations || []);
  } catch {
    return new Set();
  }
}

export async function loadContractRegistry(
  projectRoot: string,
): Promise<ContractRegistryEntry[]> {
  const dir = path.join(projectRoot, ".spec-graph", "contracts");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: ContractRegistryEntry[] = [];
  for (const f of entries) {
    if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
    const entry = await tryReadYaml<ContractRegistryEntry>(path.join(dir, f));
    if (entry) out.push(entry);
  }
  return out;
}

// Recompute drift against the live registry: a consumer is stale when its
// bound version differs from the producer's current_version. Mirrors the
// logic in commands/contract.ts so gate evaluation stays consistent without
// a hard dep on the command layer.
export function collectDriftedConsumers(
  entries: ContractRegistryEntry[],
): Array<{
  contract: string;
  consumer: string;
  status: string;
  bound: string;
  current: string;
}> {
  const drifted: Array<{
    contract: string;
    consumer: string;
    status: string;
    bound: string;
    current: string;
  }> = [];
  for (const e of entries) {
    for (const c of e.consumers || []) {
      if (c.status === "broken") {
        drifted.push({
          contract: e.contract_id,
          consumer: c.consumer,
          status: "broken",
          bound: c.bound_version,
          current: e.current_version,
        });
      } else if (c.bound_version !== e.current_version) {
        drifted.push({
          contract: e.contract_id,
          consumer: c.consumer,
          status: "stale",
          bound: c.bound_version,
          current: e.current_version,
        });
      }
    }
  }
  return drifted;
}

function evaluateGate(
  gate: Gate,
  state: MachineState,
  traceIndex: TraceIndex,
  forbiddenInvariants: Set<string>,
  contractEntries: ContractRegistryEntry[],
): GateEvaluationResult {
  const missingArtifacts: string[] = [];
  const missingChecks: string[] = [];
  const missingTraces: string[] = [];
  const missingContracts: string[] = [];
  const violatedForbids: string[] = [];
  const warnings: string[] = [];

  for (const artifactId of gate.require_artifacts) {
    if (state.artifacts[artifactId]?.status !== "completed") {
      missingArtifacts.push(artifactId);
    }
  }

  for (const checkId of gate.require_checks) {
    if (state.checks[checkId]?.status !== "passed") {
      missingChecks.push(checkId);
    }
  }

  for (const trace of gate.require_traces) {
    const evaluation = evaluateTraceQuery(traceIndex, trace);
    if (!evaluation.passed) {
      missingTraces.push(trace.name);
      if (evaluation.missing_reason) {
        warnings.push(`${trace.name}: ${evaluation.missing_reason}`);
      }
    }
  }

  if (gate.require_contracts_current) {
    const drifted = collectDriftedConsumers(contractEntries);
    for (const d of drifted) {
      missingContracts.push(
        `${d.contract} (${d.consumer} ${d.status}: bound ${d.bound} ≠ current ${d.current})`,
      );
    }
    if (drifted.length > 0) {
      warnings.push(
        `${drifted.length} consumer(s) on stale/broken contract versions — see missing_contracts`,
      );
    }
  }

  for (const forbid of gate.forbid) {
    if (forbiddenInvariants.has(forbid)) {
      violatedForbids.push(forbid);
    }
  }

  return {
    gate_id: gate.id,
    passed:
      missingArtifacts.length === 0 &&
      missingChecks.length === 0 &&
      missingTraces.length === 0 &&
      missingContracts.length === 0 &&
      violatedForbids.length === 0,
    missing_artifacts: missingArtifacts,
    missing_checks: missingChecks,
    missing_traces: missingTraces,
    missing_contracts: missingContracts,
    violated_forbids: violatedForbids,
    warnings,
  };
}
