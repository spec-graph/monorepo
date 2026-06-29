/**
 * Hook configuration types for spec-graph pre/post command hooks.
 *
 * Hooks are shell commands that run before or after spec-graph commands.
 * Configured via .spec-graph/hooks.yaml.
 *
 * Example:
 *   hooks:
 *     - command: echo "About to dispatch"
 *       when: pre
 *       command_name: dispatch
 *     - command: curl -X POST https://hooks.slack.com/... -d '{"text":"Dispatched"}'
 *       when: post
 *       command_name: dispatch
 */

export type HookWhen = "pre" | "post";

export interface HookDecl {
  /**
   * Shell command to execute.
   * Can use environment variables: $SPEC_GRAPH_PROJECT_ROOT, $SPEC_GRAPH_COMMAND
   */
  command: string;
  /**
   * When to run: 'pre' (before command) or 'post' (after command).
   */
  when: HookWhen;
  /**
   * Which spec-graph command this hook applies to.
   * Examples: 'dispatch', 'transition', 'check', 'artifact'
   * If undefined, hook runs for ALL commands.
   */
  command_name?: string;
  /**
   * Optional glob pattern to match command arguments.
   * Example: 'transition --from * --to *' matches any transition command.
   */
  args_pattern?: string;
  /**
   * Timeout in milliseconds (default: 10000).
   */
  timeout_ms?: number;
  /**
   * If true, hook failure aborts the command (pre hooks only).
   * Default: false.
   */
  abort_on_failure?: boolean;
}

export interface HooksConfig {
  version: string;
  hooks: HookDecl[];
}
