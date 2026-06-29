import { ChangeDescriptor } from "../types/index";
/**
 * Derive story status from execution unit statuses.
 *
 * Rules:
 *   - All units 'completed' → story 'completed'
 *   - Any unit 'failed' → story 'failed'
 *   - Any unit 'in_progress' → story 'in_progress'
 *   - Otherwise → story 'pending'
 *
 * If execution_units is undefined or empty, returns 'pending' (backward compat).
 */
export declare function deriveStoryStatus(change: ChangeDescriptor): "pending" | "in_progress" | "completed" | "failed";
/**
 * Get unit statistics for a story.
 */
export declare function getUnitStats(change: ChangeDescriptor): {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
};
