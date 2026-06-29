import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../dispatch-watcher.mjs');

function runHook(stdinPayload) {
  const result = execFileSync('node', [HOOK_PATH], {
    input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
    encoding: 'utf-8',
    timeout: 5000,
  });
  return result;
}

describe('dispatch-watcher PostToolUse hook', () => {
  it('exits silently when no stdin provided', () => {
    const output = runHook('');
    expect(output).toBe('');
  });

  it('exits silently on malformed JSON', () => {
    const output = runHook('this is not json');
    expect(output).toBe('');
  });

  it('exits silently when tool is not Bash', () => {
    const output = runHook({
      tool_name: 'Read',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: '{"done": false}', exitCode: 0 },
    });
    expect(output).toBe('');
  });

  it('exits silently when command does not contain spec-graph dispatch', () => {
    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_response: { stdout: '{"done": false}', exitCode: 0 },
    });
    expect(output).toBe('');
  });

  it('exits silently when stdout is not JSON', () => {
    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: 'human readable output, not json', exitCode: 0 },
    });
    expect(output).toBe('');
  });

  it('exits silently when manifest.done === true', () => {
    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: {
        stdout: JSON.stringify({
          done: true,
          current_stage: 'archive',
          next_stage: null,
          gate_passed: true,
          actions: [],
        }),
        exitCode: 0,
      },
    });
    expect(output).toBe('');
  });

  it('exits silently when manifest has no actions', () => {
    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: {
        stdout: JSON.stringify({
          done: false,
          current_stage: 'propose',
          next_stage: null,
          gate_passed: true,
          actions: [],
        }),
        exitCode: 0,
      },
    });
    expect(output).toBe('');
  });

  it('injects manifest when done === false and actions present', () => {
    const manifest = {
      version: '1',
      created_at: '2026-06-27T00:00:00.000Z',
      current_stage: 'propose',
      next_stage: 'specify',
      transition: null,
      blocking_gate: null,
      gate_passed: true,
      done: false,
      actions: [
        {
          index: 1,
          type: 'perform_stage',
          id: 'propose',
          description: "Perform 'propose' stage work",
          next_step: '# Dispatch sub-agent...',
          agent_id: 'pm',
          agent_prompt_ref: 'agents/pm-agent.md',
          model_tier: 'capable',
          agent_role: 'capable',
          role_description: 'capable tier',
          allowed_tools: ['Read', 'Write', 'Edit'],
          requires_sub_agent: true,
          file_scope: {
            read: ['docs/'],
            write: ['docs/'],
          },
          prompt: 'You are the pm agent for a spec-graph workflow.',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: {
        stdout: JSON.stringify(manifest),
        exitCode: 0,
      },
    });

    expect(output).not.toBe('');
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toBeDefined();

    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('<system-reminder>');
    expect(reminder).toContain('spec-graph dispatch output detected');
    expect(reminder).toContain('pm');
    expect(reminder).toContain('capable');
    expect(reminder).toContain('agents/pm-agent.md');
    expect(reminder).toContain('propose');
    expect(reminder).toContain('EXECUTION (sub-agent)');
    expect(reminder).toContain('coordinator-protocol.md');
    // Should NOT include the full prompt (context trimmed — manifest already in main agent context)
    expect(reminder).not.toContain('You are the pm agent for a spec-graph workflow');
  });

  it('includes meeting info when action triggers a meeting', () => {
    const manifest = {
      done: false,
      current_stage: 'propose',
      next_stage: 'specify',
      gate_passed: true,
      actions: [
        {
          index: 1,
          type: 'perform_stage',
          id: 'propose',
          description: "Perform 'propose' stage work",
          agent_id: 'pm',
          agent_prompt_ref: 'agents/pm-agent.md',
          model_tier: 'capable',
          agent_role: 'capable',
          role_description: 'capable tier',
          allowed_tools: ['Read', 'Write'],
          requires_sub_agent: true,
          file_scope: { read: ['docs/'], write: ['docs/'] },
          prompt: 'You are the pm agent.',
          meeting: {
            meeting_id: 'requirements-meeting',
            description: 'Requirements roundtable',
            purpose: 'Discuss requirements',
            participants: [
              { agent_id: 'pm', role: 'core', perspective: 'user needs' },
              { agent_id: 'architect', role: 'core', perspective: 'feasibility' },
            ],
            min_rounds: 2,
            max_rounds: 10,
            output_artifacts: ['requirement/proposal'],
            expert_invite_protocol: 'agents/expert-invite-protocol.md',
            rounds: [
              { number: 1, phase: 'diverge', objective: 'Initial', prompt: 'Share' },
              { number: 2, phase: 'converge', objective: 'Align', prompt: 'Summarize' },
            ],
            runtime: null,
          },
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    const parsed = JSON.parse(output);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Meeting');
    expect(reminder).toContain('requirements-meeting');
  });

  it('handles spec-graph dispatch within a longer chained command', () => {
    const manifest = {
      done: false,
      current_stage: 'propose',
      gate_passed: true,
      actions: [
        {
          index: 1,
          type: 'produce_artifact',
          id: 'requirement/proposal',
          description: 'Produce requirement',
          agent_role: 'capable',
          allowed_tools: [],
          file_scope: { read: [], write: [] },
          prompt: 'produce',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'cd docs && spec-graph dispatch --json --output out.yaml' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    expect(output).not.toBe('');
    const parsed = JSON.parse(output);
    expect(parsed.hookSpecificOutput).toBeDefined();
  });

  it('includes input_artifacts summary in reminder when present', () => {
    const manifest = {
      done: false,
      current_stage: 'design',
      next_stage: 'implement',
      gate_passed: true,
      actions: [
        {
          index: 1,
          type: 'produce_artifact',
          id: 'design/architecture',
          description: 'Produce architecture',
          agent_id: 'architect',
          agent_prompt_ref: 'agents/architect-agent.md',
          model_tier: 'capable',
          agent_role: 'capable',
          allowed_tools: ['Read', 'Write'],
          file_scope: { read: ['docs/'], write: ['docs/'] },
          requires_sub_agent: true,
          input_artifacts: [
            { id: 'requirement/proposal', kind: 'requirement', path: '.spec-graph/artifacts/requirement/proposal.md', status: 'completed' },
            { id: 'requirement/requirements', kind: 'requirement', path: '.spec-graph/artifacts/requirement/requirements.md', status: 'completed' },
          ],
          prompt: 'You are the architect agent.',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    const parsed = JSON.parse(output);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    // Summary count, not full paths (context trimmed)
    expect(reminder).toContain('Input artifacts: 2');
    expect(reminder).toContain('see manifest actions[0].input_artifacts');
    // Should NOT include individual artifact paths (avoid duplication with manifest)
    expect(reminder).not.toContain('.spec-graph/artifacts/requirement/proposal.md');
  });

  it('includes gate failure counts in reminder when gate_blocked', () => {
    const manifest = {
      done: false,
      gate_passed: false,
      current_stage: 'propose',
      missing_artifacts: ['requirement/proposal', 'requirement/requirements'],
      failed_checks: ['lint'],
      missing_traces: [],
      forbidden_violations: [],
      actions: [
        {
          index: 1,
          type: 'produce_artifact',
          id: 'requirement/proposal',
          description: 'Produce proposal',
          agent_id: 'pm',
          agent_prompt_ref: 'agents/pm-agent.md',
          model_tier: 'capable',
          agent_role: 'capable',
          allowed_tools: ['Read', 'Write'],
          file_scope: { read: ['docs/'], write: ['docs/'] },
          requires_sub_agent: true,
          input_artifacts: [],
          prompt: 'produce',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    const parsed = JSON.parse(output);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Gate failures:');
    expect(reminder).toContain('missing_artifacts=2');
    expect(reminder).toContain('failed_checks=1');
  });

  it('instructs coordinator to create trace manually for verify_trace actions', () => {
    const manifest = {
      done: false,
      gate_passed: false,
      current_stage: 'propose',
      missing_artifacts: [],
      failed_checks: [],
      missing_traces: ['req-to-design'],
      forbidden_violations: [],
      actions: [
        {
          index: 1,
          type: 'verify_trace',
          id: 'req-to-design',
          description: 'Verify trace req-to-design',
          agent_role: 'traceability-reviewer',
          allowed_tools: ['Bash'],
          file_scope: { read: [], write: [] },
          requires_sub_agent: false,
          // No check_command for verify_trace — it has trace_query instead
          trace_query: {
            name: 'req-to-design',
            from_kind: 'requirement',
            to_kind: 'design',
            via: ['satisfies'],
            cardinality: 'exists',
          },
          prompt: 'verify',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    const parsed = JSON.parse(output);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('verify_trace');
    expect(reminder).toContain('Trace \'req-to-design\' is required');
    expect(reminder).toContain('spec-graph trace add');
    expect(reminder).toContain('actions[0].trace_query');
    // Should NOT say "Run check_command" for verify_trace (there's no check_command)
    expect(reminder).not.toContain('Run check_command directly via Bash: undefined');
  });

  it('instructs coordinator to run command directly for deterministic actions', () => {
    const manifest = {
      done: false,
      current_stage: 'propose',
      gate_passed: true,
      missing_artifacts: [],
      failed_checks: [],
      missing_traces: [],
      forbidden_violations: [],
      actions: [
        {
          index: 1,
          type: 'run_check',
          id: 'lint-check',
          description: 'Run lint check',
          agent_role: 'quality-runner',
          allowed_tools: ['Bash'],
          file_scope: { read: [], write: [] },
          requires_sub_agent: false,
          check_command: 'npm run lint',
          recommended_command: 'spec-graph check --id lint-check',
          prompt: 'deterministic',
        },
      ],
    };

    const output = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
    });

    const parsed = JSON.parse(output);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('NO — run check_command directly via Bash');
    expect(reminder).toContain('EXECUTION (deterministic');
    // Should prefer check_command over recommended_command
    expect(reminder).toContain('npm run lint');
    expect(reminder).not.toContain('spec-graph check --id');
    // Should NOT instruct sub-agent dispatch
    expect(reminder).not.toContain('Dispatch via Agent tool');
  });

  it('never blocks: returns exit 0 on all edge cases', () => {
    const cases = [
      '',
      'garbage',
      JSON.stringify({ tool_name: 'Read' }),
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'unrelated' },
        tool_response: { stdout: '{}' },
      }),
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'spec-graph dispatch' },
        tool_response: { stdout: 'not json at all' },
      }),
    ];

    for (const c of cases) {
      expect(() => runHook(c)).not.toThrow();
      expect(runHook(c)).toBe('');
    }
  });
});
