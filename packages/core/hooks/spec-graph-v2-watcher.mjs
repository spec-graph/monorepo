#!/usr/bin/env node
/**
 * spec-graph-v2-watcher.mjs — PostToolUse hook for spec-graph v2
 *
 * Integrates spec-graph's automator with Claude Code. Watches for
 * spec-graph CLI invocations and can auto-inject follow-up actions.
 *
 * V2 commands recognized:
 *   - spec-graph plan ...     → plan creation acknowledged
 *   - spec-graph auto ...     → auto loop started
 *   - spec-graph next-prompt  → prompt injected as context reminder
 *   - spec-graph advance ...  → gate result reported
 *   - spec-graph status       → status snapshot
 *
 * This hook is DEFENSIVE: on any parse error, exits silently.
 * It never blocks tool execution.
 *
 * Input (stdin JSON):
 *   {
 *     "session_id": "...",
 *     "hook_event_name": "PostToolUse",
 *     "tool_name": "Bash",
 *     "tool_input": { "command": "spec-graph status" },
 *     "tool_response": { "stdout": "...", "stderr": "...", "exitCode": 0 }
 *   }
 */

import { readFileSync } from 'node:fs';

function parseStdin() {
  try {
    const raw = readFileSync(0, 'utf-8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  const event = parseStdin();
  if (!event) return; // silent exit

  const command = event?.tool_input?.command || '';
  const stdout = event?.tool_response?.stdout || '';
  const exitCode = event?.tool_response?.exitCode ?? 0;

  // Only react to spec-graph commands
  if (!command.includes('spec-graph')) return;

  // ─── V2 command handlers ────────────────────────────────────────────────

  // spec-graph advance: if gate passed, suggest next-prompt
  if (command.includes('spec-graph advance') && exitCode === 0) {
    try {
      const result = JSON.parse(stdout);
      if (result.advanced && result.nextStage) {
        console.log(
          `[spec-graph] Gate passed → stage ${result.nextStage}. ` +
            `Run \`spec-graph next-prompt\` to get the next prompt.`
        );
      } else if (!result.advanced && result.diagnosis) {
        const failedIds = result.diagnosis.failedCriteria
          ?.map((c) => c.id)
          .join(', ');
        console.log(
          `[spec-graph] Gate failed: ${failedIds}. ` +
            `Run \`spec-graph diagnose\` for details.`
        );
      }
    } catch {
      // Parse error: silent
    }
    return;
  }

  // spec-graph auto: remind about progress checking
  if (command.includes('spec-graph auto') && exitCode === 0) {
    console.log(
      '[spec-graph] Auto loop active. Run `spec-graph status` to check progress.'
    );
    return;
  }

  // spec-graph plan: remind to confirm
  if (command.includes('spec-graph plan') && !command.includes('--confirm')) {
    console.log(
      '[spec-graph] Plan created but not confirmed. ' +
        'Re-run with `--confirm` to begin automatic execution.'
    );
    return;
  }
}

main();
