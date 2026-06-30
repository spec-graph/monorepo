/**
 * Placeholder Resolver
 *
 * Resolves `<test-command>`, `<lint-command>`, `<typecheck-command>` etc.
 * in pack.yaml checks based on the project's commands.yaml configuration.
 *
 * Per architecture: spec-graph does NOT auto-detect tech stack.
 * The AI agent analyzes the project and generates .spec-graph/commands.yaml
 * during init (via --stack parameter or manual configuration).
 *
 * This resolver reads commands.yaml and replaces placeholders.
 * Unresolved placeholders cause the check to be skipped (not failed).
 */

import { loadProjectCommands, ProjectCommands } from "./project-commands";

export interface ResolvedCommand {
  placeholder: string;
  resolved: string | null;
  source: string;
}

/**
 * Resolve all placeholders in a command string using commands.yaml.
 *
 * Priority:
 * 1. .spec-graph/commands.yaml (user/agent config, the only source)
 * 2. Leave unresolved (check will be skipped)
 */
export async function resolveCommand(
  command: string,
  projectRoot?: string,
): Promise<string> {
  // Find all <placeholder> patterns
  const placeholderPattern = /<[a-z][-a-z]*-command>/g;
  const placeholders = command.match(placeholderPattern) || [];

  if (placeholders.length === 0) {
    return command;
  }

  // Load user/agent config
  let userCommands: ProjectCommands | null = null;
  if (projectRoot) {
    try {
      userCommands = await loadProjectCommands(projectRoot);
    } catch {
      // ignore
    }
  }

  let resolved = command;
  for (const placeholder of placeholders) {
    const value = userCommands?.commands?.[placeholder];
    if (value) {
      // Escape special regex chars in placeholder for replacement
      const escaped = placeholder.replace(/[<>]/g, "\\$&");
      resolved = resolved.replace(new RegExp(escaped, "g"), value);
    }
  }

  return resolved;
}

/**
 * Check if a command still contains unresolved placeholders.
 */
export function hasUnresolvedPlaceholders(command: string): boolean {
  return /<[a-z][-a-z]*-command>/.test(command);
}

/**
 * List all known placeholder names from the current commands.yaml.
 */
export async function getKnownPlaceholders(projectRoot: string): Promise<string[]> {
  const config = await loadProjectCommands(projectRoot);
  return config ? Object.keys(config.commands) : [];
}
