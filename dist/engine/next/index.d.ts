import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";
import { TraceIndex } from "../trace/index";
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
    type: "produce_artifact" | "run_check" | "verify_trace" | "resolve_violation" | "transition" | "perform_stage";
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
export declare function computeNextPlan(graph: Graph, state: MachineState, traceIndex?: TraceIndex, projectRoot?: string): Promise<NextPlan>;
