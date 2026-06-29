"use strict";
/**
 * State Machine Engine - Enforces state transitions based on graph gates
 *
 * This engine manages the execution state of a change and enforces
 * that all gate conditions are met before allowing transitions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachineEngine = void 0;
const yaml_1 = require("../../utils/yaml");
const index_1 = require("../trace/index");
const index_2 = require("../workflow/index");
const index_3 = require("../enforce/index");
const node_path_1 = __importDefault(require("node:path"));
/**
 * State Machine Engine
 */
class StateMachineEngine {
    graph;
    statePath;
    projectRoot;
    state = null;
    constructor(graph, statePath, projectRoot) {
        this.graph = graph;
        this.statePath = statePath;
        this.projectRoot = projectRoot;
    }
    /**
     * Initialize or load the machine state
     */
    async initialize(startStage) {
        try {
            // Try to load existing state
            this.state = await (0, yaml_1.readYaml)(this.statePath);
            return this.state;
        }
        catch {
            // Create new state
            const initialStage = startStage || (0, index_2.inferStageOrder)(this.graph)[0] || "start";
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
    async getState() {
        if (!this.state) {
            await this.initialize();
        }
        return this.state;
    }
    /**
     * Request a state transition
     */
    async transition(request) {
        if (!this.state) {
            await this.initialize();
        }
        const currentState = this.state;
        // Validate the transition is from current stage
        if (request.from_stage !== currentState.current_stage) {
            return {
                success: false,
                new_state: currentState,
                error: `Cannot transition from ${request.from_stage}: current stage is ${currentState.current_stage}`,
            };
        }
        if (!(0, index_2.isValidTransition)(this.graph, request.from_stage, request.to_stage)) {
            return {
                success: false,
                new_state: currentState,
                error: `Invalid transition: ${request.from_stage} → ${request.to_stage}`,
            };
        }
        // Find gates for this transition
        const gates = this.findGatesForTransition(request.from_stage, request.to_stage);
        // Evaluate all matching gates
        const gateEvaluation = await this.evaluateGates(gates);
        // Check if transition is allowed
        if (!gateEvaluation.passed &&
            gates.some((gate) => gate.fail_mode === "block")) {
            return {
                success: false,
                new_state: currentState,
                gate_evaluation: gateEvaluation,
                error: `Transition blocked by gate ${gateEvaluation.gate_id}`,
            };
        }
        // Perform the transition
        const transition = {
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
    async updateArtifact(artifactId, status) {
        if (!this.state) {
            await this.initialize();
        }
        const currentState = this.state;
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
    async updateCheck(checkId, status) {
        if (!this.state) {
            await this.initialize();
        }
        const currentState = this.state;
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
    findGatesForTransition(fromStage, toStage) {
        const arrowKey = `${fromStage}→${toStage}`;
        const commaKey = `${fromStage},${toStage}`;
        return this.graph.gates.filter((gate) => {
            const transitions = gate.on_transition || [];
            if (transitions.includes(arrowKey) || transitions.includes(commaKey))
                return true;
            return (transitions.length === 2 &&
                transitions[0] === fromStage &&
                transitions[1] === toStage);
        });
    }
    /**
     * Evaluate all gates against current state
     */
    async evaluateGates(gates) {
        if (gates.length === 0) {
            return this.evaluateGate(undefined);
        }
        const results = await Promise.all(gates.map((gate) => this.evaluateGate(gate)));
        return {
            gate_id: gates.map((gate) => gate.id).join(", "),
            passed: results.every((result) => result.passed),
            missing_artifacts: unique(results.flatMap((result) => result.missing_artifacts)),
            failed_checks: unique(results.flatMap((result) => result.failed_checks)),
            missing_traces: unique(results.flatMap((result) => result.missing_traces)),
            missing_contracts: unique(results.flatMap((result) => result.missing_contracts)),
            forbidden_violations: unique(results.flatMap((result) => result.forbidden_violations)),
            warnings: results.flatMap((result) => result.warnings),
        };
    }
    /**
     * Evaluate a gate against current state
     */
    async evaluateGate(gate) {
        const result = {
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
        const currentState = this.state;
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
            const traceIndex = await (0, index_1.buildTraceIndex)(this.projectRoot, this.graph);
            const evaluation = (0, index_1.evaluateTraceQuery)(traceIndex, trace);
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
                result.warnings.push("require_contracts_current: no projectRoot — cannot load contract registry");
            }
            else {
                const entries = await loadContractRegistry(this.projectRoot);
                const drifted = collectDriftedConsumers(entries);
                for (const d of drifted) {
                    result.missing_contracts.push(`${d.contract} (${d.consumer} ${d.status}: bound ${d.bound} ≠ current ${d.current})`);
                }
                if (drifted.length > 0) {
                    result.passed = false;
                    result.warnings.push(`${drifted.length} consumer(s) on stale/broken contract versions — see missing_contracts`);
                }
            }
        }
        // Check forbidden invariants
        if (gate.forbid.length > 0) {
            const forbiddenInvariants = this.projectRoot
                ? await loadForbiddenInvariants(this.projectRoot)
                : new Set();
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
    async saveState() {
        await (0, yaml_1.writeYaml)(this.statePath, this.state);
    }
    /**
     * Get stage history
     */
    async getHistory() {
        const state = await this.getState();
        return state.stage_history;
    }
    /**
     * Get all artifacts
     */
    async getArtifacts() {
        const state = await this.getState();
        return state.artifacts;
    }
    /**
     * Get all checks
     */
    async getChecks() {
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
    async canPerformAction(action) {
        const state = await this.getState();
        const stages = this.graph.pipeline_skeleton.stages;
        const currentIdx = stages.indexOf(state.current_stage);
        if (currentIdx === -1)
            return false;
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
        if (GOVERNANCE_ACTIONS.has(action))
            return true;
        // Check if the action is declared in the graph
        if (this.graph.actions && this.graph.actions.length > 0) {
            if (!this.graph.actions.includes(action))
                return false;
        }
        // Stage-to-action mapping
        const stageActionMap = {
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
        if (allowedForStage)
            return allowedForStage.includes(action);
        return true;
    }
    /**
     * Restart the current stage: reset incomplete artifacts/checks while keeping
     * completed ones. This allows retrying a failed stage without losing progress.
     *
     * @param projectRoot Project root (for loading graph)
     * @returns The reset state with incomplete items reset to pending
     */
    async restartStage(projectRoot) {
        const state = await this.getState();
        const graphPath = node_path_1.default.join(projectRoot, ".spec-graph", "graph.yaml");
        const graph = await (0, yaml_1.readYaml)(graphPath);
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
        if (!state.stage_history)
            state.stage_history = [];
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
exports.StateMachineEngine = StateMachineEngine;
function unique(values) {
    return Array.from(new Set(values));
}
// Local wrappers that delegate to enforce/index.ts (canonical implementations).
// The duplicates that previously lived here were removed to ensure gate
// evaluation stays consistent across machine transition, standalone `gate`,
// `dispatch`, `status`, and `next`.
async function loadForbiddenInvariants(projectRoot) {
    return (0, index_3.loadForbiddenInvariants)(projectRoot);
}
async function loadContractRegistry(projectRoot) {
    return (0, index_3.loadContractRegistry)(projectRoot);
}
function collectDriftedConsumers(entries) {
    return (0, index_3.collectDriftedConsumers)(entries);
}
//# sourceMappingURL=index.js.map