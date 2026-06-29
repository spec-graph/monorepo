/**
 * State Machine Engine - Enforces state transitions based on graph gates
 *
 * This engine manages the execution state of a change and enforces
 * that all gate conditions are met before allowing transitions.
 */

import {
  Graph,
  Gate,
  ArtifactDecl,
  CheckDecl,
  ContractRegistryEntry,
} from "../../types/index";
import { readYaml, writeYaml, tryReadYaml } from "../../utils/yaml";
import { buildTraceIndex, evaluateTraceQuery } from "../trace/index";
import { inferStageOrder, isValidTransition } from "../workflow/index";
import {
  loadContractRegistry as loadContractRegistryImpl,
  loadForbiddenInvariants as loadForbiddenInvariantsImpl,
  collectDriftedConsumers as collectDriftedConsumersImpl,
} from "../enforce/index";
import fs from "node:fs/promises";
import path from "node:path";

export interface MachineState {
  current_stage: string;
  stage_history: StageTransition[];
  artifacts: Record<string, ArtifactStatus>;
  checks: Record<string, CheckStatus>;
  metadata: Record<string, any>;
}

export interface StageTransition {
  from_stage: string;
  to_stage: string;
  timestamp: string;
  triggered_by: string;
  gate_evaluation: GateEvaluationResult;
}

export interface ArtifactStatus {
  id: string;
  status:
    | "pending"
    | "in_progress"
    | "ready"
    | "completed"
    | "failed"
    | "blocked";
  produced_by?: string;
  consumed_by?: string[];
  metadata?: Record<string, any>;
}

export interface CheckStatus {
  id: string;
  status: "pending" | "running" | "passed" | "failed";
  result?: any;
  executed_at?: string;
}

export interface GateEvaluationResult {
  gate_id: string;
  passed: boolean;
  missing_artifacts: string[];
  failed_checks: string[];
  missing_traces: string[];
  missing_contracts: string[];
  forbidden_violations: string[];
  warnings: string[];
}

export interface TransitionRequest {
  from_stage: string;
  to_stage: string;
  triggered_by: string;
  context?: Record<string, any>;
}

export interface TransitionResult {
  success: boolean;
  new_state: MachineState;
  gate_evaluation?: GateEvaluationResult;
  error?: string;
}

/**
 * State Machine Engine
 */
export class StateMachineEngine {
  private graph: Graph;
  private statePath: string;
  private projectRoot?: string;
  private state: MachineState | null = null;

  constructor(graph: Graph, statePath: string, projectRoot?: string) {
    this.graph = graph;
    this.statePath = statePath;
    this.projectRoot = projectRoot;
  }

  /**
   * Initialize or load the machine state
   */
  async initialize(startStage?: string): Promise<MachineState> {
    try {
      // Try to load existing state
      this.state = await readYaml<MachineState>(this.statePath);
      return this.state;
    } catch {
      // Create new state
      const initialStage =
        startStage || inferStageOrder(this.graph)[0] || "start";
      this.state = {
        current_stage: initialStage,
        stage_history: [],
        artifacts: {},
        checks: {},
        metadata: {
          created_at: new Date().toISOString(),
          change_type: this.graph.meta.change_type,
        },
      };
      await this.saveState();
      return this.state;
    }
  }

  /**
   * Get current state
   */
  async getState(): Promise<MachineState> {
    if (!this.state) {
      await this.initialize();
    }
    return this.state!;
  }

  /**
   * Request a state transition
   */
  async transition(request: TransitionRequest): Promise<TransitionResult> {
    if (!this.state) {
      await this.initialize();
    }

    const currentState = this.state!;

    // Validate the transition is from current stage
    if (request.from_stage !== currentState.current_stage) {
      return {
        success: false,
        new_state: currentState,
        error: `Cannot transition from ${request.from_stage}: current stage is ${currentState.current_stage}`,
      };
    }

    if (!isValidTransition(this.graph, request.from_stage, request.to_stage)) {
      return {
        success: false,
        new_state: currentState,
        error: `Invalid transition: ${request.from_stage} → ${request.to_stage}`,
      };
    }

    // Find gates for this transition
    const gates = this.findGatesForTransition(
      request.from_stage,
      request.to_stage,
    );

    // Evaluate all matching gates
    const gateEvaluation = await this.evaluateGates(gates);

    // Check if transition is allowed
    if (
      !gateEvaluation.passed &&
      gates.some((gate) => gate.fail_mode === "block")
    ) {
      return {
        success: false,
        new_state: currentState,
        gate_evaluation: gateEvaluation,
        error: `Transition blocked by gate ${gateEvaluation.gate_id}`,
      };
    }

    // Perform the transition
    const transition: StageTransition = {
      from_stage: request.from_stage,
      to_stage: request.to_stage,
      timestamp: new Date().toISOString(),
      triggered_by: request.triggered_by,
      gate_evaluation: gateEvaluation,
    };

    // Update state
    currentState.stage_history.push(transition);
    currentState.current_stage = request.to_stage;

    if (request.context) {
      currentState.metadata = { ...currentState.metadata, ...request.context };
    }

    await this.saveState();

    return {
      success: true,
      new_state: currentState,
      gate_evaluation: gateEvaluation,
    };
  }

  /**
   * Update artifact status
   */
  async updateArtifact(
    artifactId: string,
    status: Partial<ArtifactStatus>,
  ): Promise<void> {
    if (!this.state) {
      await this.initialize();
    }

    const currentState = this.state!;
    const existing = currentState.artifacts[artifactId] || {
      id: artifactId,
      status: "pending",
    };

    currentState.artifacts[artifactId] = { ...existing, ...status };
    await this.saveState();
  }

  /**
   * Update check status
   */
  async updateCheck(
    checkId: string,
    status: Partial<CheckStatus>,
  ): Promise<void> {
    if (!this.state) {
      await this.initialize();
    }

    const currentState = this.state!;
    const existing = currentState.checks[checkId] || {
      id: checkId,
      status: "pending",
    };

    currentState.checks[checkId] = { ...existing, ...status };
    await this.saveState();
  }

  /**
   * Find gates for a transition
   */
  private findGatesForTransition(fromStage: string, toStage: string): Gate[] {
    const arrowKey = `${fromStage}→${toStage}`;
    const commaKey = `${fromStage},${toStage}`;

    return this.graph.gates.filter((gate) => {
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

  /**
   * Evaluate all gates against current state
   */
  private async evaluateGates(gates: Gate[]): Promise<GateEvaluationResult> {
    if (gates.length === 0) {
      return this.evaluateGate(undefined);
    }

    const results = await Promise.all(
      gates.map((gate) => this.evaluateGate(gate)),
    );
    return {
      gate_id: gates.map((gate) => gate.id).join(", "),
      passed: results.every((result) => result.passed),
      missing_artifacts: unique(
        results.flatMap((result) => result.missing_artifacts),
      ),
      failed_checks: unique(results.flatMap((result) => result.failed_checks)),
      missing_traces: unique(
        results.flatMap((result) => result.missing_traces),
      ),
      missing_contracts: unique(
        results.flatMap((result) => result.missing_contracts),
      ),
      forbidden_violations: unique(
        results.flatMap((result) => result.forbidden_violations),
      ),
      warnings: results.flatMap((result) => result.warnings),
    };
  }

  /**
   * Evaluate a gate against current state
   */
  private async evaluateGate(gate?: Gate): Promise<GateEvaluationResult> {
    const result: GateEvaluationResult = {
      gate_id: gate?.id || "no_gate",
      passed: true,
      missing_artifacts: [],
      failed_checks: [],
      missing_traces: [],
      missing_contracts: [],
      forbidden_violations: [],
      warnings: [],
    };

    if (!gate) {
      return result;
    }

    const currentState = this.state!;

    // Check required artifacts
    for (const artifactId of gate.require_artifacts || []) {
      const artifact = currentState.artifacts[artifactId];
      if (!artifact || artifact.status !== "completed") {
        result.missing_artifacts.push(artifactId);
        result.passed = false;
      }
    }

    // Check required checks
    for (const checkId of gate.require_checks || []) {
      const check = currentState.checks[checkId];
      if (!check || check.status !== "passed") {
        result.failed_checks.push(checkId);
        result.passed = false;
      }
    }

    // Check required traces
    for (const trace of gate.require_traces || []) {
      if (!this.projectRoot) {
        result.missing_traces.push(trace.name);
        result.passed = false;
        continue;
      }

      const traceIndex = await buildTraceIndex(this.projectRoot, this.graph);
      const evaluation = evaluateTraceQuery(traceIndex, trace);
      if (!evaluation.passed) {
        result.missing_traces.push(trace.name);
        result.passed = false;
        if (evaluation.missing_reason) {
          result.warnings.push(`${trace.name}: ${evaluation.missing_reason}`);
        }
      }
    }

    // Check required contract currency (drift detection)
    // Mirrors enforce/index.ts collectDriftedConsumers: a consumer is stale
    // when its bound_version differs from the producer's current_version, or
    // broken when explicitly marked. Without this check, `machine transition`
    // would let transitions through even when consumers are on stale contract
    // versions — silently breaking the contract federation guarantee.
    if (gate.require_contracts_current) {
      if (!this.projectRoot) {
        result.warnings.push(
          "require_contracts_current: no projectRoot — cannot load contract registry",
        );
      } else {
        const entries = await loadContractRegistry(this.projectRoot);
        const drifted = collectDriftedConsumers(entries);
        for (const d of drifted) {
          result.missing_contracts.push(
            `${d.contract} (${d.consumer} ${d.status}: bound ${d.bound} ≠ current ${d.current})`,
          );
        }
        if (drifted.length > 0) {
          result.passed = false;
          result.warnings.push(
            `${drifted.length} consumer(s) on stale/broken contract versions — see missing_contracts`,
          );
        }
      }
    }

    // Check forbidden invariants
    if (gate.forbid.length > 0) {
      const forbiddenInvariants = this.projectRoot
        ? await loadForbiddenInvariants(this.projectRoot)
        : new Set<string>();

      for (const forbidden of gate.forbid) {
        if (forbiddenInvariants.has(forbidden)) {
          result.forbidden_violations.push(forbidden);
          result.passed = false;
        }
      }
    }

    return result;
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    await writeYaml(this.statePath, this.state);
  }

  /**
   * Get stage history
   */
  async getHistory(): Promise<StageTransition[]> {
    const state = await this.getState();
    return state.stage_history;
  }

  /**
   * Get all artifacts
   */
  async getArtifacts(): Promise<Record<string, ArtifactStatus>> {
    const state = await this.getState();
    return state.artifacts;
  }

  /**
   * Get all checks
   */
  async getChecks(): Promise<Record<string, CheckStatus>> {
    const state = await this.getState();
    return state.checks;
  }

  /**
   * Check if current stage allows a specific action.
   *
   * Actions are allowed if:
   * 1. The action is a governance action (always allowed).
   * 2. The action is declared in graph.actions.
   * 3. The action matches the current stage's allowed actions.
   */
  async canPerformAction(action: string): Promise<boolean> {
    const state = await this.getState();
    const stages = this.graph.pipeline_skeleton.stages;
    const currentIdx = stages.indexOf(state.current_stage);

    if (currentIdx === -1) return false;

    // Governance actions are always allowed
    const GOVERNANCE_ACTIONS = new Set([
      "review",
      "test",
      "accept",
      "integrate",
      "archive",
      "propose",
      "diagnose",
      "release",
    ]);
    if (GOVERNANCE_ACTIONS.has(action)) return true;

    // Check if the action is declared in the graph
    if (this.graph.actions && this.graph.actions.length > 0) {
      if (!this.graph.actions.includes(action)) return false;
    }

    // Stage-to-action mapping
    const stageActionMap: Record<string, string[]> = {
      specify: ["propose", "specify"],
      design: ["specify", "design", "contract"],
      plan: ["design", "plan", "contract"],
      implement: ["plan", "implement"],
      review: ["implement", "review"],
      test: ["review", "test"],
      accept: ["test", "accept"],
      integrate: ["accept", "integrate"],
    };

    const allowedForStage = stageActionMap[state.current_stage];
    if (allowedForStage) return allowedForStage.includes(action);
    return true;
  }
  /**
   * Restart the current stage: reset incomplete artifacts/checks while keeping
   * completed ones. This allows retrying a failed stage without losing progress.
   *
   * @param projectRoot Project root (for loading graph)
   * @returns The reset state with incomplete items reset to pending
   */
  async restartStage(projectRoot: string): Promise<MachineState> {
    const state = await this.getState();
    const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
    const graph = await readYaml<Graph>(graphPath);

    // Find artifacts/checks declared in this stage's scope
    const stageArtifacts = (graph.artifacts || []).map((a) => a.id);
    const stageChecks = (graph.checks || []).map((c) => c.id);

    // Reset incomplete items to pending
    for (const id of stageArtifacts) {
      if (state.artifacts[id] && state.artifacts[id].status !== "completed") {
        state.artifacts[id].status = "pending";
      }
    }

    for (const id of stageChecks) {
      if (state.checks[id] && state.checks[id].status !== "passed") {
        state.checks[id].status = "pending";
      }
    }

    // Save the reset state
    await this.saveState();

    // Add to history
    if (!state.stage_history) state.stage_history = [];
    state.stage_history.push({
      from_stage: state.current_stage,
      to_stage: state.current_stage,
      triggered_by: "restart-stage",
      timestamp: new Date().toISOString(),
      gate_evaluation: {
        gate_id: "restart",
        passed: true,
        missing_artifacts: [],
        failed_checks: [],
        missing_traces: [],
        missing_contracts: [],
        forbidden_violations: [],
        warnings: ["Stage restarted (incomplete items reset to pending)"],
      },
    });

    await this.saveState();
    return state;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

// Local wrappers that delegate to enforce/index.ts (canonical implementations).
// The duplicates that previously lived here were removed to ensure gate
// evaluation stays consistent across machine transition, standalone `gate`,
// `dispatch`, `status`, and `next`.
async function loadForbiddenInvariants(
  projectRoot: string,
): Promise<Set<string>> {
  return loadForbiddenInvariantsImpl(projectRoot);
}

async function loadContractRegistry(
  projectRoot: string,
): Promise<ContractRegistryEntry[]> {
  return loadContractRegistryImpl(projectRoot);
}

function collectDriftedConsumers(entries: ContractRegistryEntry[]): Array<{
  contract: string;
  consumer: string;
  status: string;
  bound: string;
  current: string;
}> {
  return collectDriftedConsumersImpl(entries);
}
