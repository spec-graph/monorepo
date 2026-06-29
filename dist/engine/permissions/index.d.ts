/**
 * Permission Engine — Controls what the spec-graph CLI and AI agents can auto-execute.
 *
 * Two-level permission model:
 *   Project-level — what `spec-graph run` can auto-execute (global automation level)
 *   Sub-agent-level — per-role tool + file permissions for AI agents (Claude Code/Codex)
 *
 * Permission levels:
 *   full-auto  — `run` ATTEMPTS all action types. Truly deterministic ones
 *                (run_check, transition) execute directly. LLM-requiring ones
 *                (produce_artifact, perform_stage, resolve_violation) yield
 *                'blocked' with a clear "dispatch required" message rather than
 *                crashing. verify_trace re-evaluates the trace query — if now
 *                satisfied (artifacts completed since last check), it succeeds;
 *                otherwise blocked with a 'create via spec-graph trace add' hint.
 *   semi-auto  — `run` auto-executes only run_check + transition (default)
 *   manual     — `run` auto-executes nothing; everything requires agent dispatch
 *   custom     — user-defined allow.auto_execute list
 */
import { SuggestedAction } from "../next/index";
export type PermissionLevel = "full-auto" | "semi-auto" | "manual" | "custom";
export type ActionType = SuggestedAction["type"];
export type AgentRole = "spec-author" | "quality-runner" | "traceability-reviewer" | "governance-reviewer" | "workflow-operator" | "stage-agent";
export interface AgentPermissions {
    enabled: boolean;
    auto_approve_tools: string[];
    note?: string;
}
export interface RolePermissions {
    description: string;
    tools: string[];
    file_scope: {
        read: string[];
        write: string[];
    };
    /** Which action types this role can take */
    actions: ActionType[];
}
export interface PermissionConfig {
    version: string;
    level: PermissionLevel;
    /** Project-level: what `run` can auto-execute */
    allow: {
        auto_execute: ActionType[];
        agent_actions: ActionType[];
    };
    /** Project-level: global file scope for all agents */
    file_scope: {
        read: string[];
        write: string[];
    };
    /** Sub-agent-level: per-role permissions */
    roles: Record<AgentRole, RolePermissions>;
    /** Sub-agent-level: per-agent-tool (Claude Code, Codex, etc.) default tool grants */
    agents: Record<string, AgentPermissions>;
}
export declare const DEFAULT_ROLES: Record<AgentRole, RolePermissions>;
declare const PRESETS: Record<Exclude<PermissionLevel, "custom">, PermissionConfig>;
export declare function getPermissionsPath(projectRoot: string): string;
export declare function loadPermissions(projectRoot: string): Promise<PermissionConfig>;
export declare function savePermissions(projectRoot: string, config: PermissionConfig): Promise<void>;
export declare function getPreset(level: Exclude<PermissionLevel, "custom">): PermissionConfig;
export declare function isActionAllowed(actionType: ActionType, config: PermissionConfig): boolean;
export declare function getAgentConfig(agentName: string, config: PermissionConfig): AgentPermissions | undefined;
export declare function getRoleConfig(role: AgentRole, config: PermissionConfig): RolePermissions;
/** Map an action type to the agent role best suited to handle it */
export declare function roleForAction(actionType: ActionType): AgentRole;
/** Resolve effective file scope for a role: role scope overrides, project scope as fallback */
export declare function resolveFileScope(role: AgentRole, config: PermissionConfig): {
    read: string[];
    write: string[];
};
export { PRESETS };
/**
 * Generate a Claude Code `.claude/settings.json` permissions section
 * from the spec-graph permission config.
 */
export declare function generateClaudeCodeSettings(config: PermissionConfig): Record<string, any>;
/**
 * Generate an OpenCode `.opencode.json` config from spec-graph permissions.
 */
export declare function generateOpenCodeSettings(config: PermissionConfig): Record<string, any>;
/**
 * Write agent config files to the project root if they don't already exist.
 * Returns which files were created.
 */
export declare function writeAgentConfigs(projectRoot: string, config: PermissionConfig, options?: {
    force?: boolean;
}): Promise<{
    created: string[];
    skipped: string[];
}>;
