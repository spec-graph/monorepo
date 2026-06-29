/**
 * State Machine Engine - Enforces state transitions based on graph gates
 *
 * This engine manages the execution state of a change and enforces
 * that all gate conditions are met before allowing transitions.
 */
import { Graph } from "../../types/index";
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
    status: "pending" | "in_progress" | "ready" | "completed" | "failed" | "blocked";
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
export declare class StateMachineEngine {
    private graph;
    private statePath;
    private projectRoot?;
    private state;
    constructor(graph: Graph, statePath: string, projectRoot?: string);
    /**
     * Initialize or load the machine state
     */
    initialize(startStage?: string): Promise<MachineState>;
    /**
     * Get current state
     */
    getState(): Promise<MachineState>;
    /**
     * Request a state transition
     */
    transition(request: TransitionRequest): Promise<TransitionResult>;
    /**
     * Update artifact status
     */
    updateArtifact(artifactId: string, status: Partial<ArtifactStatus>): Promise<void>;
    /**
     * Update check status
     */
    updateCheck(checkId: string, status: Partial<CheckStatus>): Promise<void>;
    /**
     * Find gates for a transition
     */
    private findGatesForTransition;
    /**
     * Evaluate all gates against current state
     */
    private evaluateGates;
    /**
     * Evaluate a gate against current state
     */
    private evaluateGate;
    /**
     * Save state to disk
     */
    private saveState;
    /**
     * Get stage history
     */
    getHistory(): Promise<StageTransition[]>;
    /**
     * Get all artifacts
     */
    getArtifacts(): Promise<Record<string, ArtifactStatus>>;
    /**
     * Get all checks
     */
    getChecks(): Promise<Record<string, CheckStatus>>;
    /**
     * Check if current stage allows a specific action.
     *
     * Actions are allowed if:
     * 1. The action is a governance action (always allowed).
     * 2. The action is declared in graph.actions.
     * 3. The action matches the current stage's allowed actions.
     */
    canPerformAction(action: string): Promise<boolean>;
    /**
     * Restart the current stage: reset incomplete artifacts/checks while keeping
     * completed ones. This allows retrying a failed stage without losing progress.
     *
     * @param projectRoot Project root (for loading graph)
     * @returns The reset state with incomplete items reset to pending
     */
    restartStage(projectRoot: string): Promise<MachineState>;
}
