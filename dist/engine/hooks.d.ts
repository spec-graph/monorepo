import { HooksConfig, HookDecl, HookWhen } from "../types/hooks";
/**
 * Load hooks configuration from .spec-graph/hooks.yaml.
 * Returns empty hooks list if file doesn't exist or is invalid.
 */
export declare function loadHooks(projectRoot: string): Promise<HooksConfig>;
/**
 * Execute hooks for a given command and timing (pre/post).
 *
 * @param projectRoot Project root directory
 * @param commandName Name of the spec-graph command (e.g., 'dispatch')
 * @param when 'pre' or 'post'
 * @param args Optional command arguments for pattern matching
 * @returns Array of hook execution results
 */
export declare function executeHooks(projectRoot: string, commandName: string, when: HookWhen, args?: string[]): Promise<HookResult[]>;
interface HookResult {
    hook: HookDecl;
    success: boolean;
    exit_code: number | null;
    stdout: string;
    stderr: string;
    duration_ms: number;
}
export {};
