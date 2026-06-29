"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=hooks.js.map