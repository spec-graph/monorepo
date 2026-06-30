import { Graph, Gate } from "../../types/index";
import { MachineState } from "../machine/index";
import { TraceIndex, evaluateTraceQuery } from "../trace/index";
import { findNextStage } from "../workflow/index";
import {
  loadContractRegistry,
  loadForbiddenInvariants,
  collectDriftedConsumers,
} from "../enforce/index";

export interface NextPlan {
  current_stage: string;
  next_stage: string | null;
  transition: string | null;
  blocking_gate: string | null;
  gate_passed: boolean;
  missing_artifacts: string[];
  failed_checks: string[];
  missing_traces: string[];
  missing_contracts: string[];
  forbidden_violations: string[];
  suggested_actions: SuggestedAction[];
  done: boolean;
}

export interface SuggestedAction {
  type:
    | "produce_artifact"
    | "run_check"
    | "verify_trace"
    | "resolve_violation"
    | "transition"
    | "perform_stage";
  id: string;
  command?: string;
  description: string;
}

/**
 * Compute the next-step plan for the current state.
 *
 * Async because contract drift and forbidden invariants require disk reads
 * (.spec-graph/contracts/*.yaml and .spec-graph/invariants.json). Without
 * projectRoot, these checks are skipped (plan will show gate_passed=true even
 * if contracts are drifted — machine transition will still catch it, but the
 * plan won't pre-warn).
 */
export async function computeNextPlan(
  graph: Graph,
  state: MachineState,
  traceIndex?: TraceIndex,
  projectRoot?: string,
): Promise<NextPlan> {
  const nextStage = findNextStage(graph, state.current_stage);

  if (!nextStage) {
    return {
      current_stage: state.current_stage,
      next_stage: null,
      transition: null,
      blocking_gate: null,
      gate_passed: true,
      missing_artifacts: [],
      failed_checks: [],
      missing_traces: [],
      missing_contracts: [],
      forbidden_violations: [],
      suggested_actions: [],
      done: true,
    };
  }

  const gates = findGatesForTransition(graph, state.current_stage, nextStage);
  const missingArtifacts = unique(
    gates.flatMap((gate) => findMissingArtifacts(gate, state)),
  );
  const failedChecks = unique(
    gates.flatMap((gate) => findFailedChecks(gate, state)),
  );
  const missingTraces = unique(
    gates.flatMap((gate) => findMissingTraces(gate, traceIndex)),
  );

  // Contract drift: only check if any gate requires it AND we have projectRoot.
  // Mirrors engine/machine/index.ts evaluateGate contract currency check.
  const needsContractCheck = gates.some((g) => g.require_contracts_current);
  let missingContracts: string[] = [];
  if (needsContractCheck && projectRoot) {
    const entries = await loadContractRegistry(projectRoot);
    const drifted = collectDriftedConsumers(entries);
    missingContracts = unique(
      drifted.map(
        (d) =>
          `${d.contract} (${d.consumer} ${d.status}: bound ${d.bound} ≠ current ${d.current})`,
      ),
    );
  }

  // Forbidden invariants: only check if any gate declares forbid clauses AND
  // we have projectRoot. Without this, gates with `forbid: [...]` appear passed
  // in the plan but fail at machine transition.
  let forbiddenViolations: string[] = [];
  const gatesWithForbid = gates.filter((g) => (g.forbid || []).length > 0);
  if (gatesWithForbid.length > 0 && projectRoot) {
    const forbiddenInvariants = await loadForbiddenInvariants(projectRoot);
    forbiddenViolations = unique(
      gatesWithForbid.flatMap((g) =>
        (g.forbid || []).filter((f) => forbiddenInvariants.has(f)),
      ),
    );
  }

  const gatePassed =
    missingArtifacts.length === 0 &&
    failedChecks.length === 0 &&
    missingTraces.length === 0 &&
    missingContracts.length === 0 &&
    forbiddenViolations.length === 0;

  return {
    current_stage: state.current_stage,
    next_stage: nextStage,
    transition: `${state.current_stage}→${nextStage}`,
    blocking_gate:
      gates.length > 0 ? gates.map((gate) => gate.id).join(", ") : null,
    gate_passed: gatePassed,
    missing_artifacts: missingArtifacts,
    failed_checks: failedChecks,
    missing_traces: missingTraces,
    missing_contracts: missingContracts,
    forbidden_violations: forbiddenViolations,
    suggested_actions: buildSuggestedActions(
      graph,
      state,
      nextStage,
      missingArtifacts,
      failedChecks,
      missingTraces,
      missingContracts,
      forbiddenViolations,
      gates,
    ),
    done: false,
  };
}

function findGatesForTransition(
  graph: Graph,
  fromStage: string,
  toStage: string,
): Gate[] {
  const arrowKey = `${fromStage}→${toStage}`;
  const commaKey = `${fromStage},${toStage}`;

  return graph.gates.filter((gate) => {
    const transitions = gate.on_transition || [];
    if (transitions.includes(arrowKey) || transitions.includes(commaKey))
      return true;
    return (
      transitions.length === 2 &&
      transitions[0] === fromStage &&
      transitions[1] === toStage
    );
  });
}

function findMissingArtifacts(
  gate: Gate | undefined,
  state: MachineState,
): string[] {
  if (!gate) return [];

  return (gate.require_artifacts || []).filter((artifactId) => {
    return state.artifacts[artifactId]?.status !== "completed";
  });
}

function findFailedChecks(
  gate: Gate | undefined,
  state: MachineState,
): string[] {
  if (!gate) return [];

  return (gate.require_checks || []).filter((checkId) => {
    return state.checks[checkId]?.status !== "passed";
  });
}

function findMissingTraces(
  gate: Gate | undefined,
  traceIndex?: TraceIndex,
): string[] {
  if (!gate) return [];

  return (gate.require_traces || [])
    .filter((trace) => {
      if (!traceIndex) return true;
      return !evaluateTraceQuery(traceIndex, trace).passed;
    })
    .map((trace) => trace.name);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildSuggestedActions(
  graph: Graph,
  state: MachineState,
  nextStage: string,
  missingArtifacts: string[],
  failedChecks: string[],
  missingTraces: string[],
  missingContracts: string[],
  forbiddenViolations: string[],
  gates: Gate[],
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Sort artifacts by plan-stage priority (dependencies first)
  const planOrder: Record<string, number> = {
    requirement: 1, design: 2, plan: 3, contract: 4,
    implementation: 5, verification: 6, "change-record": 7, meta: 8,
  };
  const sortedArtifacts = [...missingArtifacts].sort((a, b) => {
    const kindA = a.split("/")[0] || "";
    const kindB = b.split("/")[0] || "";
    return (planOrder[kindA] || 99) - (planOrder[kindB] || 99);
  });

  for (const artifactId of sortedArtifacts) {
    actions.push({
      type: "produce_artifact",
      id: artifactId,
      command: `spec-graph machine update --artifact ${artifactId} --status completed`,
      description: `Produce and mark artifact '${artifactId}' as completed`,
    });
  }
  for (const checkId of failedChecks) {
    const check = graph.checks.find((candidate) => candidate.id === checkId);
    actions.push({
      type: "run_check",
      id: checkId,
      command:
        check?.command ||
        `spec-graph machine update --check ${checkId} --status passed`,
      description: check
        ? `Run check '${checkId}' and mark it passed if successful`
        : `Mark check '${checkId}' as passed after validating it`,
    });
  }

  for (const traceId of missingTraces) {
    actions.push({
      type: "verify_trace",
      id: traceId,
      description: `Verify required trace '${traceId}'`,
    });
  }

  for (const contractIssue of missingContracts) {
    // Contract drift requires either re-binding the consumer to the new
    // version (spec-graph contract bind) or reverifying the consumer
    // (spec-graph contract reverify). Modeled as resolve_violation since
    // it's a governance issue, not a missing artifact.
    actions.push({
      type: "resolve_violation",
      id: contractIssue,
      description: `Resolve contract drift: ${contractIssue}`,
    });
  }

  for (const violation of forbiddenViolations) {
    actions.push({
      type: "resolve_violation",
      id: violation,
      description: `Resolve forbidden invariant violation '${violation}'`,
    });
  }

  if (actions.length === 0) {
    // Only auto-transition when at least one explicit graph gate guards this
    // transition. Ungated pipeline-adjacent stages (e.g. implement→review)
    // represent manual/agent work that `run` must not skip.
    if (gates.length > 0) {
      actions.push({
        type: "transition",
        id: `${state.current_stage}→${nextStage}`,
        command: `spec-graph machine transition --from ${state.current_stage} --to ${nextStage}`,
        description: `Transition from '${state.current_stage}' to '${nextStage}'`,
      });
    } else {
      actions.push({
        type: "perform_stage",
        id: nextStage,
        description: `Perform '${nextStage}' stage work — produce required artifacts and run checks before transitioning`,
      });
    }
  }

  return actions;
}
