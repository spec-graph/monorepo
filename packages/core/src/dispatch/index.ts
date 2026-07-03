/**
 * Dispatch — generate structured dispatch manifests for sub-agent execution.
 *
 * Produces a `DispatchManifest` JSON consumed by the dispatch-watcher.mjs hook.
 * The hook injects a system-reminder into Claude Code's context telling it to
 * dispatch sub-agents via the Agent tool.
 *
 * Core responsibilities:
 *   1. Read session state (stage, plan, capabilities)
 *   2. Load pack agent configs (agent declarations + bindings)
 *   3. Plan actions (parallel waves for implement stage via dependency-analyzer)
 *   4. Resolve agent per action (via agent_bindings)
 *   5. Assemble full prompt envelopes (system prompt + input artifacts)
 *   6. Evaluate gate status
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import * as automator from '../automator/index.js';
import { analyzeTasks } from '../dependency-analyzer/index.js';
import type {
  DispatchAction,
  DispatchManifest,
  AgentDecl,
  Pack,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Stage output mapping — what each stage MUST produce
// ---------------------------------------------------------------------------

interface StageOutput {
  dir: string;
  file: string;
  template: string;
  format: string;
  checks: Record<string, string>;
}

const STAGE_OUTPUT_MAP: Record<string, StageOutput> = {
  specify: {
    dir: 'specify',
    file: 'proposal.md',
    template: 'templates/proposal.md',
    format: 'Markdown with sections: Why, What Changes, User Personas, User Stories, Capabilities, Impact, Out of Scope',
    checks: {},
  },
  specs: {
    dir: 'specs',
    file: 'specs.md',
    template: 'templates/spec.md',
    format: 'Markdown with sections: Introduction, Requirement/Scenario (### Requirement: <name>, #### Scenario: <name>), Non-Functional Requirements',
    checks: {},
  },
  design: {
    dir: 'design',
    file: 'design.md',
    template: 'templates/design.md',
    format: 'Markdown with sections: Context, Goals/Non-Goals, Decisions, Risks/Trade-offs, Alternatives Considered',
    checks: { lint: 'markdownlint **/*.md' },
  },
  tasks: {
    dir: 'tasks',
    file: 'tasks.md',
    template: 'templates/tasks.md',
    format: 'Markdown with checkbox tasks: - [ ] X.Y Task description',
    checks: {},
  },
  implement: {
    dir: 'implement',
    file: 'code',
    template: 'none',
    format: 'Source code files following project conventions',
    checks: {
      validation_report: 'validation-report.json (see Verification section)',
    },
  },
  review: {
    dir: 'review',
    file: 'review.md',
    template: 'none',
    format: 'Markdown with findings and resolutions',
    checks: { lint: 'markdownlint **/*.md' },
  },
  test: {
    dir: 'test',
    file: 'test.md',
    template: 'none',
    format: 'Markdown with test results and coverage report',
    checks: { test: 'npm test' },
  },
  accept: {
    dir: 'accept',
    file: 'verification.md',
    template: 'none',
    format: 'Markdown with E2E verification results and acceptance sign-off',
    checks: { test: 'npm run test:e2e 2>/dev/null || echo "no e2e tests"' },
  },
  integrate: {
    dir: 'integrate',
    file: 'pr.md',
    template: 'none',
    format: 'Markdown PR description with summary, test plan, and checklist',
    checks: { lint: 'markdownlint **/*.md' },
  },
};

// ---------------------------------------------------------------------------
// Backward compatibility — auto-map old stage names
// ---------------------------------------------------------------------------

/**
 * Normalize a stage string to the current Stage type.
 * Auto-maps legacy names (e.g. 'plan' → 'tasks') for backward compatibility
 * with sessions created before the v3.0 rename.
 */
function normalizeStage(stage: string): automator.Stage {
  if (stage === 'plan') return 'tasks';
  return stage as automator.Stage;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a dispatch manifest for the current session state.
 *
 * @param sessionId - active session id
 * @param projectRoot - project root (default: cwd)
 * @param packsDir - directory containing pack subdirectories (auto-detected if omitted)
 * @param graphPath - path to graph.yaml (auto-detected as .spec-graph/graph.yaml if omitted)
 */
export function generateDispatchManifest(
  sessionId: string,
  projectRoot?: string,
  packsDir?: string,
  graphPath?: string
): DispatchManifest {
  const root = projectRoot || process.cwd();
  const packDir = packsDir || findPacksDir();

  // 1. Load session state
  const status = automator.status(sessionId, root);

  // Normalize legacy stage names (v2 'plan' → v3 'tasks')
  if (status.stage) {
    status.stage = normalizeStage(status.stage);
  }

  // Handle terminal states
  if (status.state === 'completed') {
    return emptyManifest(sessionId, status.stage || 'integrate', true);
  }
  if (!status.stage) {
    return emptyManifest(sessionId, 'unknown', false);
  }

  // 2. Load pack agent configs — prefer graph.yaml, fallback to inline pack scanning
  const resolvedGraphPath = graphPath || path.join(root, '.spec-graph', 'graph.yaml');
  let packConfig: PackAgentConfig;
  if (fs.existsSync(resolvedGraphPath)) {
    packConfig = loadPackAgentsFromGraph(resolvedGraphPath);
  } else {
    console.warn(`[dispatch] Warning: graph.yaml not found at ${resolvedGraphPath}, falling back to inline pack scanning`);
    packConfig = loadPackAgents(packDir);
  }

  // 3. Plan actions based on current stage
  const actions = planActions(status, packConfig, root);

  // 4. Fill action metadata and assemble prompt envelopes
  for (const action of actions) {
    // Compute output spec, file scope, and verification for this action
    const stageOutput = STAGE_OUTPUT_MAP[status.stage!];
    if (stageOutput) {
      action.output_spec = {
        path: path.join(
          root,
          '.spec-graph',
          'sessions',
          status.sessionId!,
          stageOutput.dir,
          stageOutput.file
        ),
        template: stageOutput.template,
        format: stageOutput.format,
      };
      action.file_scope = {
        read: [
          `.spec-graph/sessions/${status.sessionId}/**/*`,
          'src/**/*',
          '**/*.md',
        ],
        write: [
          `.spec-graph/sessions/${status.sessionId}/${stageOutput.dir}/*`,
          'src/**/*',
        ],
        forbid: [
          '.git/**',
          'node_modules/**',
          '.spec-graph/worktrees/**',
        ],
      };
      action.verification = stageOutput.checks;
    }

    if (action.requires_sub_agent && action.agent_id) {
      const agent = resolveAgent(action.agent_id, packConfig);
      if (agent) {
        action.prompt = buildPromptEnvelope(agent, action, status, root, packDir);
        action.agent_prompt_ref = agent.prompt_ref;
        action.model_tier = agent.model_tier;
      } else {
        action.prompt = buildFallbackEnvelope(action, status);
      }
    } else {
      action.prompt = '';
    }
  }

  // 5. Evaluate gate status
  const gateStatus = evaluateGateStatus(status, root);

  // 6. Compute meeting metadata (informational — coordinator decides)
  const meetingMeta = buildMeetingMetadata(status, root, resolvedGraphPath);

  // 7. Compute specs metadata (informational — coordinator decides)
  const specsMeta = buildSpecsMetadata(status, root);

  const manifest: DispatchManifest = {
    version: '1',
    session_id: sessionId,
    current_stage: status.stage,
    gate_passed: gateStatus.passed,
    blocking_gate: gateStatus.passed ? null : status.stage,
    missing_artifacts: gateStatus.missing,
    failed_checks: [],
    done: false,
    actions,
  };
  if (meetingMeta) manifest.meeting = meetingMeta;
  if (specsMeta) manifest.specs = specsMeta;

  return manifest;
}

// ---------------------------------------------------------------------------
// Pack Agent Loading
// ---------------------------------------------------------------------------

interface PackAgentConfig {
  agents: AgentDecl[];
  bindings: Record<string, string>; // action → agent_id
}

function loadPackAgents(packsDir: string): PackAgentConfig {
  const agents: AgentDecl[] = [];
  const bindings: Record<string, string> = {};

  if (!fs.existsSync(packsDir)) {
    return { agents, bindings };
  }

  const entries = fs.readdirSync(packsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.pack')) continue;

    const packYamlPath = path.join(packsDir, entry.name, 'pack.yaml');
    if (!fs.existsSync(packYamlPath)) continue;

    try {
      const raw = fs.readFileSync(packYamlPath, 'utf-8');
      const pack = yaml.load(raw) as Pack;

      if (pack.provides?.agents) {
        for (const agent of pack.provides.agents) {
          // Prefix agent id with pack name to avoid collisions
          agents.push({ ...agent, prompt_ref: resolvePromptRef(pack, agent, packsDir) });
        }
      }

      if (pack.provides?.agent_bindings) {
        for (const [action, agentId] of Object.entries(pack.provides.agent_bindings)) {
          // Higher-priority packs override lower-priority bindings
          bindings[action] = agentId;
        }
      }
    } catch {
      // Skip malformed pack.yaml
    }
  }

  return { agents, bindings };
}

function resolvePromptRef(pack: Pack, agent: AgentDecl, packsDir: string): string {
  const packDir = path.join(packsDir, `${pack.name}.pack`);
  const resolved = path.resolve(packDir, agent.prompt_ref);
  return fs.existsSync(resolved) ? resolved : agent.prompt_ref;
}

function resolveAgent(agentId: string, config: PackAgentConfig): AgentDecl | undefined {
  return config.agents.find((a) => a.id === agentId);
}

/**
 * Load agent config from graph.yaml (composed by pack-composer).
 * This is the preferred path — graph.yaml is the single source of truth.
 */
function loadPackAgentsFromGraph(graphPath: string): PackAgentConfig {
  const agents: AgentDecl[] = [];
  const bindings: Record<string, string> = {};

  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const graph = yaml.load(raw) as {
      agents?: AgentDecl[];
      agent_bindings?: Array<{ action: string; agent_id: string; provided_by: string }>;
    };

    if (graph?.agents) {
      for (const agent of graph.agents) {
        agents.push({ ...agent });
      }
    }
    if (graph?.agent_bindings) {
      for (const b of graph.agent_bindings) {
        bindings[b.action] = b.agent_id;
      }
    }
  } catch {
    // If graph is unreadable, return empty config
  }

  return { agents, bindings };
}

// ---------------------------------------------------------------------------
// Action Planning
// ---------------------------------------------------------------------------

function planActions(
  status: automator.Status,
  packConfig: PackAgentConfig,
  projectRoot: string
): DispatchAction[] {
  const stage = status.stage!;

  // For implement stage with a plan containing capabilities, produce parallel waves
  if (stage === 'implement' && status.progress.completedArtifacts !== undefined) {
    const plan = loadSessionPlan(status.sessionId!, projectRoot);
    if (plan && plan.capabilities && plan.capabilities.length > 0) {
      const tasks = plan.capabilities.map((c) => ({
        id: c.id,
        description: c.description,
        dependsOn: c.dependsOn,
      }));

      const analysis = analyzeTasks(tasks);

      if (analysis.waves.length > 0) {
        const actions: DispatchAction[] = [];
        let index = 1;
        for (let waveIdx = 0; waveIdx < analysis.waves.length; waveIdx++) {
          const wave = analysis.waves[waveIdx];
          for (const taskId of wave) {
            const task = tasks.find((t) => t.id === taskId);
            const agentId = packConfig.bindings['implement'];
            actions.push({
              index: index++,
              type: 'perform_stage',
              id: taskId,
              description: task?.description || `Implement ${taskId}`,
              requires_sub_agent: true,
              agent_id: agentId,
              parallel_group: waveIdx,
              prompt: '', // filled later
              next_step: `spec-graph submit --result '{"artifacts": [{"path": ".spec-graph/sessions/${status.sessionId}/implement/${taskId}.md", "content": "..."}]}'`,
            });
          }
        }
        return actions;
      }
    }
  }

  // Single action for all other stages
  const agentId = packConfig.bindings[stage];
  return [
    {
      index: 1,
      type: 'perform_stage',
      id: stage,
      description: `Perform '${stage}' stage work`,
      requires_sub_agent: true,
      agent_id: agentId,
      prompt: '', // filled later
      next_step: `spec-graph submit --result '{"artifacts": []}'`,
    },
  ];
}

function loadSessionPlan(sessionId: string, projectRoot: string): automator.Plan | null {
  const statePath = path.join(projectRoot, '.spec-graph', 'sessions', sessionId, 'state.yaml');
  if (!fs.existsSync(statePath)) return null;

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const data = yaml.load(raw) as Record<string, any>;
    return (data?.plan as automator.Plan) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Meeting Metadata (informational — coordinator decides to initiate or not)
// ---------------------------------------------------------------------------

/**
 * Determine whether a meeting should be recommended based on plan complexity signals.
 */
function shouldRecommendMeeting(plan: automator.Plan | null): { recommended: boolean; reason: string } {
  if (!plan) return { recommended: false, reason: '' };

  if (plan.complexity === 'high') return { recommended: true, reason: 'High complexity' };
  if (plan.capabilities?.length > 3) return { recommended: true, reason: 'Many capabilities' };
  if (plan.openQuestions?.length > 0) return { recommended: true, reason: 'Open questions remain' };
  if (plan.risks?.some(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('brownfield'))) {
    return { recommended: true, reason: 'Security or brownfield risks' };
  }

  return { recommended: false, reason: '' };
}

/**
 * Determine whether specs stage should be recommended based on plan complexity signals.
 */
function shouldRecommendSpecs(plan: automator.Plan | null): { recommended: boolean; reason: string } {
  if (!plan) return { recommended: false, reason: '' };

  if (plan.complexity === 'high') return { recommended: true, reason: 'High complexity' };
  if (plan.capabilities?.length > 3) return { recommended: true, reason: 'Many capabilities' };
  if (plan.openQuestions?.length > 0) return { recommended: true, reason: 'Open questions need formal resolution' };
  if (plan.risks?.some(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('brownfield'))) {
    return { recommended: true, reason: 'Security or brownfield risks require formal requirements' };
  }

  return { recommended: false, reason: '' };
}

/**
 * Build meeting metadata for the dispatch manifest.
 * Returns null if no meeting declaration matches the current stage.
 */
function buildMeetingMetadata(
  status: automator.Status,
  projectRoot: string,
  graphPath: string
): DispatchManifest['meeting'] | null {
  const stage = status.stage;
  if (!stage) return null;

  const meetings = loadMeetingsFromGraph(graphPath);
  const matchingMeeting = meetings.find(m => m.on_actions.includes(stage as string));

  if (!matchingMeeting) return null;

  const plan = loadSessionPlan(status.sessionId!, projectRoot);
  const { recommended, reason } = shouldRecommendMeeting(plan);

  return {
    available: true,
    recommended,
    reason,
    template: {
      id: matchingMeeting.id,
      purpose: matchingMeeting.purpose,
      participants: matchingMeeting.participants.map(p => ({
        agent_id: p.agent_id || p.expert_role || '',
        role: p.role,
        perspective: p.perspective,
      })),
      min_rounds: matchingMeeting.min_rounds,
      max_rounds: matchingMeeting.max_rounds,
    },
  };
}

/**
 * Build specs metadata for the dispatch manifest.
 * Returns null if not at specs stage.
 */
function buildSpecsMetadata(
  status: automator.Status,
  projectRoot: string
): DispatchManifest['specs'] | null {
  const stage = status.stage;
  if (stage !== 'specs') return null;

  const plan = loadSessionPlan(status.sessionId!, projectRoot);
  const { recommended, reason } = shouldRecommendSpecs(plan);

  return {
    available: true,
    recommended,
    reason,
  };
}

interface MeetingSummary {
  id: string;
  purpose: string;
  participants: Array<{
    agent_id?: string;
    expert_role?: string;
    role: string;
    perspective: string;
  }>;
  min_rounds: number;
  max_rounds: number;
  on_actions: string[];
}

function loadMeetingsFromGraph(graphPath: string): MeetingSummary[] {
  if (!fs.existsSync(graphPath)) return [];

  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const graph = yaml.load(raw) as { meetings?: MeetingSummary[] };
    return graph?.meetings || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Prompt Envelope Assembly
// ---------------------------------------------------------------------------

function buildPromptEnvelope(
  agent: AgentDecl,
  action: DispatchAction,
  status: automator.Status,
  projectRoot: string,
  packsDir: string
): string {
  const lines: string[] = [];

  // ════════════════════════════════════════════════════════════
  // IDENTITY
  // ════════════════════════════════════════════════════════════
  lines.push('# Spec-Graph Sub-Agent Dispatch');
  lines.push('');
  lines.push('## Identity');
  lines.push('');
  lines.push(`You are the **${agent.id}** agent — ${agent.description}.`);
  lines.push(`Model tier: ${agent.model_tier}`);
  lines.push(`You can execute: ${agent.actions.join(', ')}`);
  lines.push('');

  // ════════════════════════════════════════════════════════════
  // SYSTEM PROMPT — the agent's domain-specific instructions
  // ════════════════════════════════════════════════════════════
  const systemPrompt = loadSystemPrompt(agent, packsDir);
  if (systemPrompt) {
    lines.push('## System Prompt');
    lines.push('');
    lines.push('--- BEGIN SYSTEM PROMPT ---');
    lines.push(systemPrompt.trim());
    lines.push('--- END SYSTEM PROMPT ---');
    lines.push('');
  }

  // ════════════════════════════════════════════════════════════
  // TASK CONTEXT — what to do, which stage, what's the goal
  // ════════════════════════════════════════════════════════════
  lines.push('## Task Context');
  lines.push('');
  lines.push(`- Stage: ${status.stage}`);
  lines.push(`- Session: ${status.sessionId}`);
  lines.push(`- Intent: ${status.intent || '(unknown)'}`);
  lines.push(`- Action: ${action.description}`);
  lines.push(`- Action type: ${action.type}`);
  lines.push(`- Action id: ${action.id}`);
  lines.push('');

  // ════════════════════════════════════════════════════════════
  // INPUT ARTIFACTS — upstream files the agent MUST read
  // ════════════════════════════════════════════════════════════
  lines.push('## Input Artifacts (READ-ONLY)');
  lines.push('');
  const artifacts = collectInputArtifacts(agent, status, projectRoot);
  if (artifacts.length > 0) {
    lines.push('These are the upstream artifacts. Read them before starting.');
    lines.push('');
    for (const art of artifacts) {
      lines.push(`### ${art.id}`);
      lines.push(`- Kind: ${art.kind} | Path: \`${art.path}\``);
      lines.push('');
      lines.push('```markdown');
      lines.push(art.content.length > 3000
        ? art.content.slice(0, 3000) + '\n\n... (truncated, see full file at path)'
        : art.content);
      lines.push('```');
      lines.push('');
    }
    action.input_artifacts = artifacts;
  } else {
    lines.push('No upstream artifacts. This is the first stage.');
    lines.push('');
  }

  // ════════════════════════════════════════════════════════════
  // OUTPUT SPEC — exactly what files to create, where, what format
  // ════════════════════════════════════════════════════════════
  lines.push('## Output Specification (MUST)');
  lines.push('');
  if (action.output_spec) {
    lines.push(`**Write to**: \`${action.output_spec.path}\``);
    if (action.output_spec.template) {
      lines.push(`**Template**: ${action.output_spec.template}`);
    }
    if (action.output_spec.format) {
      lines.push(`**Format**: ${action.output_spec.format}`);
    }
    lines.push('');
    lines.push('You MUST write the artifact to the exact path specified above.');
    lines.push('Do NOT write to a different location.');
    lines.push('');
  }

  // ════════════════════════════════════════════════════════════
  // FILE SCOPE — what the agent CAN and CANNOT touch
  // ════════════════════════════════════════════════════════════
  lines.push('## File Scope (MUST)');
  lines.push('');
  if (action.file_scope) {
    lines.push('**READ only**:');
    for (const p of action.file_scope.read) {
      lines.push(`  - \`${p}\``);
    }
    lines.push('');
    lines.push('**WRITE only**:');
    for (const p of action.file_scope.write) {
      lines.push(`  - \`${p}\``);
    }
    lines.push('');
    lines.push('**DO NOT TOUCH**:');
    for (const p of action.file_scope.forbid) {
      lines.push(`  - \`${p}\``);
    }
    lines.push('');
  }
  lines.push('Violating file scope = immediate BLOCKED status. Stay within bounds.');
  lines.push('');

  // ════════════════════════════════════════════════════════════
  // VERIFICATION — what to run before reporting done
  // ════════════════════════════════════════════════════════════
  lines.push('## Verification (MUST — before reporting done)');
  lines.push('');
  if (action.verification && (action.verification.lint || action.verification.test || action.verification.typecheck)) {
    lines.push('Run these commands and verify they pass:');
    lines.push('');
    if (action.verification.lint) {
      lines.push(`\`\`\`bash`);
      lines.push(action.verification.lint);
      lines.push(`\`\`\``);
      lines.push('');
    }
    if (action.verification.typecheck) {
      lines.push(`\`\`\`bash`);
      lines.push(action.verification.typecheck);
      lines.push(`\`\`\``);
      lines.push('');
    }
    if (action.verification.test) {
      lines.push(`\`\`\`bash`);
      lines.push(action.verification.test);
      lines.push(`\`\`\``);
      lines.push('');
    }
  } else if (status.stage === 'implement') {
    lines.push('You MUST analyze the project and run appropriate quality validation.');
    lines.push('');
    lines.push('Steps:');
    lines.push('1. Inspect the project structure (language, test framework, build system)');
    lines.push('2. Determine the correct validation commands (NOT hardcoded guesses)');
    lines.push('3. Run type-checking (e.g., tsc, mypy, go vet, cargo check)');
    lines.push('4. Run linting (e.g., eslint, pylint, golangci-lint, clippy)');
    lines.push('5. Run existing tests (e.g., npm test, pytest, go test, cargo test)');
    lines.push('6. Run the build (e.g., npm run build, make, go build, cargo build)');
    lines.push('7. If a command fails, fix the errors and re-run');
    lines.push('');
    lines.push('After validation, write `validation-report.json` to the implement directory:');
    lines.push('');
    lines.push(`\`\`\`json`);
    lines.push('{');
    lines.push('  "validation_passed": true,');
    lines.push('  "commands_run": ["pytest -v", "mypy src/"],');
    lines.push('  "output": "All 42 tests passed. Type checking OK.",');
    lines.push('  "errors": []');
    lines.push('}');
    lines.push(`\`\`\``);
    lines.push('');
    lines.push('DO NOT skip validation. validation-report.json is REQUIRED by the gate.');
  } else {
    lines.push('- Verify the artifact matches the format specification above');
    lines.push('- Verify all acceptance criteria from the System Prompt are met');
    lines.push('');
  }
  lines.push('If verification fails, fix and re-verify. Do NOT report DONE with failures.');
  lines.push('');

  // ════════════════════════════════════════════════════════════
  // STATUS REPORT PROTOCOL — exact format for completion
  // ════════════════════════════════════════════════════════════
  lines.push('## Status Report Protocol (MUST)');
  lines.push('');
  lines.push('End your response with EXACTLY this block (replace values as needed):');
  lines.push('');
  lines.push('```status-report');
  lines.push('{');
  lines.push('  "status": "DONE",');
  const outputFile = action.output_spec
    ? path.basename(action.output_spec.path)
    : 'output';
  lines.push(`  "artifacts_produced": ["${status.stage}/${outputFile}"],`);
  lines.push('  "concerns": [],');
  lines.push('  "missing_context": null,');
  lines.push('  "blocker": null,');
  lines.push('  "summary": "One-sentence summary of what you did"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('**Status values**:');
  lines.push('- `DONE` — all artifacts produced, all verification passed');
  lines.push('- `DONE_WITH_CONCERNS` — work done but noted issues the coordinator should weigh');
  lines.push('- `NEEDS_CONTEXT` — cannot proceed without specific missing information');
  lines.push('- `BLOCKED` — hard blocker requiring user intervention');
  lines.push('');

  // ════════════════════════════════════════════════════════════
  // NEXT STEP — what the coordinator will run after
  // ════════════════════════════════════════════════════════════
  lines.push('## After Completion');
  lines.push('');
  lines.push(`The coordinator will run: \`${action.next_step}\``);
  lines.push('');

  return lines.join('\n');
}

function loadSystemPrompt(agent: AgentDecl, packsDir: string): string | null {
  const promptPath = agent.prompt_ref;
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf-8');
  }
  // Try relative to packs dir
  const tryPath = path.join(packsDir, promptPath);
  if (fs.existsSync(tryPath)) {
    return fs.readFileSync(tryPath, 'utf-8');
  }
  return null;
}

function collectInputArtifacts(
  agent: AgentDecl,
  status: automator.Status,
  projectRoot: string
): Array<{ id: string; kind: string; path: string; content: string }> {
  const artifacts: Array<{ id: string; kind: string; path: string; content: string }> = [];
  const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', status.sessionId!);

  if (!fs.existsSync(sessionDir)) return artifacts;

  // Collect completed artifacts from the session directory
  const stageDirs = fs.readdirSync(sessionDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of stageDirs) {
    if (dir.name === 'implement') continue; // Skip implement dir for now
    const files = fs.readdirSync(path.join(sessionDir, dir.name));
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(sessionDir, dir.name, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const id = `${dir.name}/${file.replace(/\.\w+$/, '')}`;
        const kind = `${dir.name}/*`;
        // Check if this kind matches agent's input_artifact_kinds
        if (matchesKinds(kind, agent.input_artifact_kinds)) {
          artifacts.push({ id, kind, path: filePath, content });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return artifacts;
}

function matchesKinds(kind: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return kind.startsWith(prefix + '/') || kind === pattern;
    }
    return kind === pattern;
  });
}

function buildFallbackEnvelope(action: DispatchAction, status: automator.Status): string {
  return [
    `# spec-graph dispatch — stage ${status.stage}`,
    '',
    `Action: ${action.id}`,
    `Description: ${action.description}`,
    '',
    'No agent binding found for this action. Please execute the work and submit results via:',
    '```bash',
    action.next_step,
    '```',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Gate Status — Three-level fallback chain
//
// Priority:
//   1. machine-state.yaml (primary) — tracked artifact statuses
//   2. File-existence check (fallback) — when machine-state.yaml absent
//   3. Session diagnosis (last resort) — when neither provides clarity
// ---------------------------------------------------------------------------

function evaluateGateStatus(
  status: automator.Status,
  projectRoot: string
): { passed: boolean; missing: string[] } {
  const stage = status.stage;
  if (!stage) return { passed: false, missing: ['unknown-stage'] };

  const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', status.sessionId!);
  const stageArtifacts: Record<string, string> = {
    specify: 'specify/proposal.md',
    specs: 'specs/specs.md',
    design: 'design/design.md',
    tasks: 'tasks/tasks.md',
    review: 'review/review.md',
    test: 'test/test.md',
    accept: 'accept/verification.md',
    integrate: 'integrate/pr.md',
  };
  const expectedArtifact = stageArtifacts[stage];
  if (!expectedArtifact) return { passed: true, missing: [] };

  // Level 1: machine-state.yaml
  const machineStatePath = path.join(projectRoot, '.spec-graph', 'machine-state.yaml');
  if (fs.existsSync(machineStatePath)) {
    try {
      const raw = fs.readFileSync(machineStatePath, 'utf-8');
      const parsed = yaml.load(raw) as { artifacts?: Record<string, { status: string }> };
      if (parsed?.artifacts) {
        const record = parsed.artifacts[expectedArtifact];
        if (record) {
          return {
            passed: record.status === 'completed',
            missing: record.status === 'completed' ? [] : [expectedArtifact],
          };
        }
      }
    } catch {
      // Fall through to file existence check
    }
  }

  // Level 2: file existence
  const fullPath = path.join(sessionDir, expectedArtifact);
  if (fs.existsSync(fullPath)) {
    return { passed: true, missing: [] };
  }

  // Level 3: session diagnosis
  if (status.recentDiagnosis && status.recentDiagnosis.failedCriteria.length > 0) {
    const missing = status.recentDiagnosis.failedCriteria.map((c) => c.id);
    return { passed: false, missing };
  }

  return { passed: false, missing: [expectedArtifact] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyManifest(sessionId: string, stage: string, done: boolean): DispatchManifest {
  return {
    version: '1',
    session_id: sessionId,
    current_stage: stage,
    gate_passed: done,
    blocking_gate: null,
    missing_artifacts: [],
    failed_checks: [],
    done,
    actions: [],
  };
}

function findPacksDir(): string {
  // Try common locations
  const candidates = [
    path.join(__dirname, '..', '..', 'packs'),           // monorepo: core/dist/dispatch → core/packs
    path.join(__dirname, '..', '..', '..', 'packs'),     // fallback
    path.join(process.cwd(), 'node_modules', '@spec-graph', 'core', 'packs'),
    path.join(process.cwd(), 'packages', 'core', 'packs'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  return candidates[0]; // Return first candidate even if missing
}
