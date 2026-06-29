#!/usr/bin/env node
/**
 * dispatch-watcher.mjs — PostToolUse hook for spec-graph
 *
 * Detects when the main agent runs `spec-graph dispatch` via the Bash tool,
 * parses the manifest JSON from stdout, and injects it as additionalContext
 * into the main agent's context so it can auto-execute per
 * agents/coordinator-protocol.md.
 *
 * Trigger flow:
 *   1. Main agent runs `spec-graph dispatch --json` via Bash tool
 *   2. Claude Code fires PostToolUse hook (matcher: Bash)
 *   3. This script reads tool_input.command + tool_response.stdout from stdin
 *   4. If command contains "spec-graph dispatch" and stdout is valid JSON manifest:
 *      - If manifest.done === true → silent exit (workflow complete)
 *      - If manifest.done === false → inject system-reminder with manifest
 *   5. Main agent sees the reminder and auto-executes via Agent tool
 *
 * This hook is DEFENSIVE: on any parse error or unexpected input, it exits
 * silently (exit 0, no output). It never blocks tool execution.
 *
 * Input (stdin JSON, per Claude Code PostToolUse hook contract):
 *   {
 *     "session_id": "...",
 *     "transcript_path": "...",
 *     "cwd": "...",
 *     "hook_event_name": "PostToolUse",
 *     "tool_name": "Bash",
 *     "tool_input": { "command": "spec-graph dispatch --json" },
 *     "tool_response": { "stdout": "...", "stderr": "...", "exitCode": 0 }
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PostToolUse",
 *       "additionalContext": "<system-reminder>...</system-reminder>"
 *     }
 *   }
 */

import { readFileSync } from 'node:fs';

let input = '';
try {
  input = readFileSync(0, 'utf-8');  // fd 0 = stdin
} catch {
  // No stdin available — not in a hook context, exit silently
  process.exit(0);
}

// Empty stdin = nothing to do
if (!input.trim()) {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(input);
} catch {
  // Malformed JSON — can't parse, exit silently
  process.exit(0);
}

// Only care about Bash tool invocations
if (data.tool_name !== 'Bash') {
  process.exit(0);
}

const command = data.tool_input?.command || '';

// Check if this was a spec-graph dispatch command
if (!command.includes('spec-graph dispatch')) {
  process.exit(0);
}

// Get stdout from tool response
const stdout = data.tool_response?.stdout || '';

// Try to parse stdout as JSON manifest
let manifest;
try {
  manifest = JSON.parse(stdout);
} catch {
  // Not JSON output (maybe human-readable format, or error message) — skip
  process.exit(0);
}

// Only inject if workflow is not done
if (manifest.done === true) {
  // Workflow complete — no action needed
  process.exit(0);
}

// Check there are actions to execute
const actions = manifest.actions || [];
if (actions.length === 0) {
  process.exit(0);
}

// Build the reminder for the main agent
const action = actions[0];
const agentId = action.agent_id || action.agent_role || 'unknown';
const requiresSubAgent = action.requires_sub_agent !== false;  // default true for backwards compat

// Surface gate failure details when blocked — coordinator needs to know WHAT
// failed (not just that gate_passed === false) to decide which action to take.
const gateFailures = (!manifest.gate_passed && !manifest.done)
  ? `\n   Gate failures: ${
      [
        manifest.missing_artifacts?.length && `missing_artifacts=${manifest.missing_artifacts.length}`,
        manifest.failed_checks?.length && `failed_checks=${manifest.failed_checks.length}`,
        manifest.missing_traces?.length && `missing_traces=${manifest.missing_traces.length}`,
        manifest.missing_contracts?.length && `contract_drift=${manifest.missing_contracts.length}`,
        manifest.forbidden_violations?.length && `forbidden=${manifest.forbidden_violations.length}`,
      ].filter(Boolean).join(', ') || 'unspecified'
    }`
  : '';

// Minimal context: just what the coordinator needs to decide dispatch vs direct execution.
// The FULL manifest (including action.prompt) is already in the main agent's context
// from the Bash tool output that triggered this hook — don't duplicate it here.
const hasMeeting = action.meeting ? `\n   Meeting: ${action.meeting.meeting_id} (${action.meeting.runtime?.status || 'fresh'})` : '';
const inputArtifactsSummary = (action.input_artifacts && action.input_artifacts.length > 0)
  ? `\n   Input artifacts: ${action.input_artifacts.length} (see manifest actions[0].input_artifacts for paths)`
  : '';

const executionBlock = requiresSubAgent
  ? `EXECUTION (sub-agent):
1. Load system prompt from ${action.agent_prompt_ref || '(none)'}
2. Construct prompt from actions[0].prompt envelope + fill placeholders with input artifact contents
3. Dispatch via Agent tool: description="${action.id} stage", model="${action.model_tier || 'standard'}", prompt=<envelope>
4. Wait for status-report block (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
5. Run next_step: ${action.next_step || 'spec-graph dispatch --json'}
6. Loop back to dispatch`
  : (action.type === 'verify_trace'
      ? `EXECUTION (deterministic — NO sub-agent):
1. Trace '${action.id}' is required by gate but missing.
2. Read actions[0].trace_query for from_kind/to_kind/via/cardinality.
3. Either create the trace manually: spec-graph trace add --from <from_kind> --to <to_kind> --via <via>
   OR complete dependent artifacts (auto-wires traces).
4. Loop back to: spec-graph dispatch --json`
      : `EXECUTION (deterministic — NO sub-agent):
1. Run check_command directly via Bash: ${action.check_command || action.recommended_command || action.command}
2. Loop back to: spec-graph dispatch --json`);

const reminder = `<system-reminder>
spec-graph dispatch output detected. The FULL manifest is already in your context from the Bash result above — use actions[0] fields directly. Per packs/foundation.pack/agents/coordinator-protocol.md, execute NOW (pre-approved, no user confirmation needed).

Action: ${action.type} — ${action.id}
  Agent: ${agentId}
  Model tier: ${action.model_tier || 'standard'}${hasMeeting}${inputArtifactsSummary}${gateFailures}
  Requires sub-agent: ${requiresSubAgent ? 'YES — dispatch via Agent tool' : 'NO — run check_command directly via Bash'}

${executionBlock}

⚠️ AUTO-LOOP PROTOCOL: After completing this action, IMMEDIATELY re-run 'spec-graph dispatch --json' to get the next action. Do NOT wait for user input. Continue this loop until manifest.done === true, gate is blocked with no auto-fix, or sub-agent returns BLOCKED.

Stop when:
  - manifest.done === true (workflow complete)
  - gate_blocked AND you cannot fix it (escalate to user)
  - sub-agent returns BLOCKED (escalate to user)

For unclear issues, self-initiate a meeting: spec-graph meeting init <id> --purpose <text> --participants <list>
</system-reminder>`;

// Output the additionalContext
const output = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: reminder,
  },
};

process.stdout.write(JSON.stringify(output));
process.exit(0);
