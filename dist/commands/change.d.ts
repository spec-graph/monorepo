import { ChangeDescriptor } from "../types/index";
export interface ChangeOptions {
    subcommand?: string;
    id?: string;
    title?: string;
    type?: string;
    priority?: string;
    description?: string;
    force?: boolean;
    reason?: string;
    worktree?: boolean;
    queue?: boolean;
    json?: boolean;
}
export declare function changeCommand(projectRoot: string, options: ChangeOptions): Promise<void>;
/**
 * Find the active (in_progress) change descriptor, if any.
 * Used by other commands (e.g. dispatch) to attach audit entries
 * for traceability — without requiring the user to pass --change-id.
 *
 * Returns null if no in_progress change exists, or if multiple exist
 * (ambiguous — caller should require explicit --change-id).
 */
export declare function findActiveChange(projectRoot: string): Promise<ChangeDescriptor | null>;
/**
 * Append an audit entry to the active change descriptor (if exactly one exists).
 * Silently no-ops when no active change — dispatch still works without a change.
 */
export declare function appendToActiveChangeAudit(projectRoot: string, action: string, message: string, author?: string): Promise<void>;
