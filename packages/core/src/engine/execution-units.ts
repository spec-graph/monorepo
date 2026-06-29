import { ChangeDescriptor, ExecutionUnit } from "../types/index";

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
export function deriveStoryStatus(
  change: ChangeDescriptor,
): "pending" | "in_progress" | "completed" | "failed" {
  if (!change.execution_units || change.execution_units.length === 0) {
    return "pending";
  }

  const units = change.execution_units;

  // Check if any unit failed
  if (units.some((u) => u.status === "failed")) {
    return "failed";
  }

  // Check if all units completed
  if (units.every((u) => u.status === "completed")) {
    return "completed";
  }

  // Check if any unit in progress
  if (units.some((u) => u.status === "in_progress")) {
    return "in_progress";
  }

  // Otherwise pending
  return "pending";
}

/**
 * Get unit statistics for a story.
 */
export function getUnitStats(change: ChangeDescriptor): {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
} {
  const units = change.execution_units || [];
  return {
    total: units.length,
    pending: units.filter((u) => u.status === "pending").length,
    in_progress: units.filter((u) => u.status === "in_progress").length,
    completed: units.filter((u) => u.status === "completed").length,
    failed: units.filter((u) => u.status === "failed").length,
  };
}
