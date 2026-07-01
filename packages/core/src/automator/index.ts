/**
 * Automator — the core automatic progression engine.
 *
 * The automator owns the session lifecycle and the main loop that drives
 * spec-graph's 8-stage state machine: specify → design → plan → implement
 * → review → test → accept → integrate.
 *
 * It exposes a TypeScript API consumed by the spec-graph CLI.
 *
 * ## Session lifecycle
 *
 *   1. startSession(intent)     → creates session + draft plan
 *   2. confirmPlan(id, plan)    → user confirms, automator ready
 *   3. nextPrompt(id)           → generate prompt for current stage
 *      (agent executes prompt externally)
 *   4. submitResult(id, result) → evaluate gate, advance state
 *      loop 3-4 until done
 *   5. intervene(id, action)    → manual intervention if needed
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPrompt, weaveMethodology, type PromptContext } from '../prompt-construction/index.js';
import {
  evaluateGate,
  diagnoseFailure,
  loadGateConfig,
  type EvaluationContext,
  type GateResult,
  type Diagnosis as GateDiagnosis,
} from '../gate-enforcement/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Stage =
  | 'specify'
  | 'design'
  | 'plan'
  | 'implement'
  | 'review'
  | 'test'
  | 'accept'
  | 'integrate';

export type SessionState = 'running' | 'paused' | 'completed' | 'failed';

export interface Plan {
  sessionId: string;
  intent: string;
  capabilities: Array<{
    id: string;
    description: string;
    dependsOn: string[];
  }>;
  order: string[];
  complexity: 'low' | 'medium' | 'high';
  risks: string[];
  openQuestions: string[];
}

export interface LayeredPrompt {
  xml: string;
  stage: string;
  sessionId: string;
}

export interface AgentResult {
  artifacts: Array<{ path: string; content: string }>;
  selfCheck?: {
    acceptanceCriteriaMet: boolean;
    notes?: string;
  };
}

export interface AdvanceResult {
  advanced: boolean;
  nextStage: Stage | null;
  diagnosis?: Diagnosis;
  done: boolean;
}

export interface DiagnosedCriterion {
  id: string;
  reason: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface Diagnosis {
  gateId: string;
  failedCriteria: DiagnosedCriterion[];
  retryLevel: 1 | 2 | 3 | 4;
  similarToPrevious: boolean;
}

export interface Status {
  sessionId: string | null;
  intent: string | null;
  stage: Stage | null;
  state: SessionState | null;
  progress: {
    currentStageIndex: number;
    totalStages: number;
    completedArtifacts: number;
  };
  blockers: string[];
  recentDiagnosis: Diagnosis | null;
}

interface SessionData {
  sessionId: string;
  intent: string;
  stage: Stage;
  state: SessionState;
  plan: Plan;
  completedArtifacts: string[];
  trace: TraceEntry[];
  previousDiagnoses: Diagnosis[];
  retryCount: number;
}

interface TraceEntry {
  timestamp: string;
  fromStage?: string;
  toStage: string;
  trigger: 'gate-pass' | 'user-force' | 'hook';
  result?: 'pass' | 'fail';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STAGES: Stage[] = [
  'specify', 'design', 'plan', 'implement',
  'review', 'test', 'accept', 'integrate',
];

export const STAGE_OUTPUTS: Record<Stage, { artifact: string; dir: string }> = {
  specify: { artifact: 'proposal.md', dir: 'specify' },
  design: { artifact: 'design.md', dir: 'design' },
  plan: { artifact: 'tasks.md', dir: 'plan' },
  implement: { artifact: 'code', dir: 'implement' },
  review: { artifact: 'review.md', dir: 'review' },
  test: { artifact: 'test.md', dir: 'test' },
  accept: { artifact: 'verification.md', dir: 'accept' },
  integrate: { artifact: 'pr.md', dir: 'integrate' },
};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionData>();

function sessionDir(sessionId: string, projectRoot?: string): string {
  const base = projectRoot || process.cwd();
  return path.join(base, '.spec-graph', 'sessions', sessionId);
}

function loadSession(sessionId: string, projectRoot?: string): SessionData | null {
  // Check memory cache first
  const cached = sessions.get(sessionId);
  if (cached) return cached;

  // Try disk
  const statePath = path.join(sessionDir(sessionId, projectRoot), 'state.yaml');
  if (fs.existsSync(statePath)) {
    try {
      const yaml = fs.readFileSync(statePath, 'utf-8');
      const data = parseStateYaml(yaml) as SessionData;
      sessions.set(sessionId, data);
      return data;
    } catch {
      return null;
    }
  }
  return null;
}

function saveSession(data: SessionData, projectRoot?: string): void {
  sessions.set(data.sessionId, data);
  const dir = sessionDir(data.sessionId, projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const yaml = formatStateYaml(data);
  fs.writeFileSync(path.join(dir, 'state.yaml'), yaml, 'utf-8');
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Start a new session. Creates a session with a draft plan.
 *
 * The plan is a simple decomposition of the intent. For richer planning,
 * the user can call `spec-graph plan <intent>` which will invoke a planning
 * skill via an external agent.
 */
export function startSession(intent: string, projectRoot?: string): Plan {
  const sessionId = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  // Already exists? Return existing plan
  const existing = loadSession(sessionId, projectRoot);
  if (existing) {
    return existing.plan;
  }

  // Simple plan: one capability per keyword detected in intent
  const capabilityHints: Record<string, string[]> = {
    auth: ['user-auth', 'protected-routes', 'token-management'],
    api: ['api-endpoints', 'request-validation', 'error-handling'],
    ui: ['ui-components', 'state-management', 'routing'],
    db: ['data-model', 'migrations', 'query-layer'],
    test: ['test-coverage', 'test-automation'],
  };

  const capabilities: Plan['capabilities'] = [];
  const seen = new Set<string>();
  for (const [keyword, caps] of Object.entries(capabilityHints)) {
    if (intent.toLowerCase().includes(keyword)) {
      for (const cap of caps) {
        if (!seen.has(cap)) {
          capabilities.push({ id: cap, description: '', dependsOn: [] });
          seen.add(cap);
        }
      }
    }
  }
  if (capabilities.length === 0) {
    capabilities.push({ id: 'implementation', description: intent, dependsOn: [] });
  }

  const plan: Plan = {
    sessionId,
    intent,
    capabilities,
    order: capabilities.map((c) => c.id),
    complexity: 'medium',
    risks: [],
    openQuestions: [],
  };

  // Save as draft (not confirmed yet)
  const data: SessionData = {
    sessionId,
    intent,
    stage: 'specify',
    state: 'paused', // paused until plan confirmed
    plan,
    completedArtifacts: [],
    trace: [],
    previousDiagnoses: [],
    retryCount: 0,
  };
  saveSession(data, projectRoot);

  return plan;
}

/**
 * Confirm a plan. Transitions the session from paused to running.
 * After confirmation, the automator is ready to generate prompts.
 */
export function confirmPlan(sessionId: string, plan?: Plan, projectRoot?: string): void {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  if (plan) data.plan = plan;
  data.state = 'running';

  const entry: TraceEntry = {
    timestamp: new Date().toISOString(),
    toStage: data.stage,
    trigger: 'user-force',
  };
  data.trace.push(entry);

  saveSession(data, projectRoot);
}

/**
 * Generate a prompt for the current stage.
 *
 * Weaves methodology from the knowledge-base, embeds acceptance criteria
 * from the stage's gate config, and includes upstream artifact summaries.
 */
export function nextPrompt(
  sessionId: string,
  projectRoot?: string,
  knowledgeBasePath?: string
): LayeredPrompt {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);
  if (data.state === 'completed') throw new Error(`Session ${sessionId} is completed`);
  if (data.state === 'paused') throw new Error(`Plan not confirmed. Run confirmPlan() first.`);

  const stage = data.stage;
  const stageOutput = STAGE_OUTPUTS[stage];
  const outputPath = path.join(
    sessionDir(sessionId, projectRoot),
    stageOutput.dir,
    stageOutput.artifact
  );

  // Load gate criteria from knowledge-base
  const kbp = knowledgeBasePath || path.join(__dirname, '../../knowledge');
  const gateConfig = loadGateConfig(stage, kbp);

  // Build PromptContext
  const methodologies = weaveMethodology(
    stage === 'design'
      ? ['specs-authoring', 'design-authoring']
      : stage === 'specify'
        ? ['requirement-analysis']
        : stage === 'plan'
          ? ['task-decomposition']
          : stage === 'implement'
            ? ['code-generation']
            : stage === 'review'
              ? ['code-review']
              : stage === 'test'
                ? ['test-strategy']
                : stage === 'accept'
                  ? ['e2e-verification']
                  : stage === 'integrate'
                    ? ['ci-integration']
                    : [],
    kbp
  );

  const ctx: PromptContext = {
    sessionId,
    stage,
    task: `Complete the ${stage} stage for "${data.intent}".`,
    acceptanceCriteria: [...gateConfig.entry, ...gateConfig.exit].map(
      (c) => `${c.id}: ${c.description}`
    ),
    projectConstraints: [
      'Follow the project profile and existing conventions',
      'Respect the confirmed plan scope',
      'Output to the specified path',
    ],
    methodologies,
    upstreamArtifacts: data.completedArtifacts.map((a) => ({
      id: a,
      path: path.join(sessionDir(sessionId, projectRoot), a),
      summary: `${a} — completed`,
    })),
    projectProfile: `Session: ${sessionId}\nIntent: ${data.intent}\nStage: ${stage}`,
    outputSpec: { outputPath },
  };

  // Add previous failure if retrying
  if (data.previousDiagnoses.length > 0) {
    const lastDiag = data.previousDiagnoses[data.previousDiagnoses.length - 1];
    ctx.previousFailure = {
      retryLevel: lastDiag.retryLevel,
      similarToPrevious: lastDiag.similarToPrevious,
      failedCriteria: lastDiag.failedCriteria,
    };
  }

  const prompt = buildPrompt(ctx);
  return { xml: prompt.xml, stage, sessionId };
}

/**
 * Submit a result from the external agent, evaluate the gate, and advance
 * state if all exit criteria pass.
 */
export function submitResult(
  sessionId: string,
  result: AgentResult,
  projectRoot?: string,
  knowledgeBasePath?: string
): AdvanceResult {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  const stage = data.stage;

  // Persist artifact contents for gate evaluation.
  // Gate evaluators expect artifactContents keyed by artifact id (proposal,
  // design, tasks, etc.), not by stage name.
  const artifactContents: Record<string, string> = {};
  const artifactFiles: Record<string, string> = {};
  for (const art of result.artifacts) {
    // Map by artifact id (the file's base name without extension)
    const baseName = path.basename(art.path).replace(/\.\w+$/, '');
    artifactContents[baseName] = (artifactContents[baseName] || '') + art.content;
    // Also map by stage name as a fallback
    artifactContents[stage] = (artifactContents[stage] || '') + art.content;
    artifactFiles[stage] = art.path;
    // Write artifact to disk
    const absPath = path.resolve(projectRoot || process.cwd(), art.path);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, art.content, 'utf-8');
  }

  const kbp = knowledgeBasePath || path.join(__dirname, '../../knowledge');

  const evalCtx: EvaluationContext = {
    projectRoot: projectRoot || process.cwd(),
    stage,
    artifactFiles,
    artifactContents,
    traceEdges: buildTraceEdges(data),
  };

  const gateResult: GateResult = evaluateGate(stage, 'exit', evalCtx, kbp);

  if (gateResult.passed) {
    // Advance to next stage
    const currentIdx = STAGES.indexOf(stage);
    const nextIdx = currentIdx + 1;
    const done = nextIdx >= STAGES.length;

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      fromStage: stage,
      toStage: done ? 'integrate' : STAGES[nextIdx],
      trigger: 'gate-pass',
      result: 'pass',
    };
    data.trace.push(entry);
    data.completedArtifacts.push(`${stage}/${STAGE_OUTPUTS[stage].artifact}`);
    data.retryCount = 0;
    data.previousDiagnoses = [];

    if (done) {
      data.stage = 'integrate';
      data.state = 'completed';
    } else {
      data.stage = STAGES[nextIdx];
    }
    saveSession(data, projectRoot);

    return {
      advanced: true,
      nextStage: done ? null : (data.stage as Stage),
      done,
    };
  }

  // Gate failed: diagnose
  const diagnosis: GateDiagnosis = diagnoseFailure(gateResult, data.previousDiagnoses);
  data.previousDiagnoses.push(diagnosis);
  data.retryCount++;
  saveSession(data, projectRoot);

  return {
    advanced: false,
    nextStage: stage,
    diagnosis,
    done: false,
  };
}

/**
 * Query the current status of a session.
 */
export function status(sessionId?: string, projectRoot?: string): Status {
  if (!sessionId) {
    return {
      sessionId: null,
      intent: null,
      stage: null,
      state: null,
      progress: { currentStageIndex: 0, totalStages: 8, completedArtifacts: 0 },
      blockers: [],
      recentDiagnosis: null,
    };
  }

  const data = loadSession(sessionId, projectRoot);
  if (!data) {
    return {
      sessionId,
      intent: null,
      stage: null,
      state: null,
      progress: { currentStageIndex: 0, totalStages: 8, completedArtifacts: 0 },
      blockers: [],
      recentDiagnosis: null,
    };
  }

  return {
    sessionId: data.sessionId,
    intent: data.intent,
    stage: data.stage,
    state: data.state,
    progress: {
      currentStageIndex: STAGES.indexOf(data.stage),
      totalStages: STAGES.length,
      completedArtifacts: data.completedArtifacts.length,
    },
    blockers:
      data.state === 'paused'
        ? ['Plan not yet confirmed. Run confirmPlan()']
        : data.previousDiagnoses.length > 0
          ? [`Gate failed ${data.retryCount} times`]
          : [],
    recentDiagnosis:
      data.previousDiagnoses.length > 0
        ? data.previousDiagnoses[data.previousDiagnoses.length - 1]
        : null,
  };
}

/**
 * Intervene in the current workflow.
 */
export function intervene(
  sessionId: string,
  action: 'modify-plan' | 'force-advance' | 'rollback' | 'resume',
  payload?: unknown,
  projectRoot?: string
): { success: boolean; newStatus: Status } {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  switch (action) {
    case 'force-advance': {
      const currentIdx = STAGES.indexOf(data.stage);
      data.stage = STAGES[Math.min(currentIdx + 1, STAGES.length - 1)];
      data.retryCount = 0;
      data.previousDiagnoses = [];
      const entry: TraceEntry = {
        timestamp: new Date().toISOString(),
        fromStage: STAGES[currentIdx],
        toStage: data.stage,
        trigger: 'user-force',
      };
      data.trace.push(entry);
      saveSession(data, projectRoot);
      break;
    }
    case 'resume':
      data.state = 'running';
      saveSession(data, projectRoot);
      break;
    case 'rollback': {
      const payloadObj = payload as { toStage?: Stage } | undefined;
      if (payloadObj?.toStage && STAGES.includes(payloadObj.toStage)) {
        data.stage = payloadObj.toStage;
      } else {
        const idx = Math.max(STAGES.indexOf(data.stage) - 1, 0);
        data.stage = STAGES[idx];
      }
      data.retryCount = 0;
      data.previousDiagnoses = [];
      const entry: TraceEntry = {
        timestamp: new Date().toISOString(),
        fromStage: data.stage,
        toStage: data.stage,
        trigger: 'user-force',
      };
      data.trace.push(entry);
      saveSession(data, projectRoot);
      break;
    }
    case 'modify-plan':
      if (payload) {
        Object.assign(data.plan, payload);
      }
      saveSession(data, projectRoot);
      break;
  }

  return {
    success: true,
    newStatus: status(sessionId, projectRoot),
  };
}

/**
 * List all active sessions.
 */
export function listSessions(projectRoot?: string): string[] {
  const base = projectRoot || process.cwd();
  const sessionsPath = path.join(base, '.spec-graph', 'sessions');
  if (!fs.existsSync(sessionsPath)) return [];
  try {
    return fs
      .readdirSync(sessionsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto-run: fully automatic loop
// ---------------------------------------------------------------------------

export interface AutoRunOptions {
  adapterId: string;
  projectRoot?: string;
  knowledgeBasePath?: string;
  /** Max retries per stage before escalating (default: 3) */
  maxRetriesPerStage?: number;
  /** Called for each progress update */
  onProgress?: (event: AutoRunEvent) => void;
}

export interface AutoRunEvent {
  type: 'stage-start' | 'agent-called' | 'gate-result' | 'retry' | 'stage-advanced' | 'done' | 'error';
  stage?: Stage;
  message: string;
  data?: unknown;
}

/**
 * Run the full automated workflow for a session.
 *
 * The loop:
 *   1. nextPrompt → generate XML prompt
 *   2. invokeAgent → delegate to external agent (Claude Code, Codex, etc.)
 *   3. submitResult → evaluate gate, advance state
 *   4. repeat until done or non-recoverable error
 *
 * Returns the final Status of the session.
 */
export async function autoRun(
  sessionId: string,
  options: AutoRunOptions
): Promise<Status> {
  const maxRetries = options.maxRetriesPerStage ?? 3;

  while (true) {
    const s = status(sessionId, options.projectRoot);
    options.onProgress?.({
      type: 'stage-start',
      stage: s.stage || undefined,
      message: `Starting stage: ${s.stage}`,
    });

    if (s.state === 'completed') {
      options.onProgress?.({ type: 'done', message: 'All stages complete!' });
      return s;
    }
    if (s.state === 'paused') {
      options.onProgress?.({ type: 'error', message: 'Session is paused. Run spec-graph intervene resume first.' });
      return s;
    }

    // 1. Generate prompt
    const prompt = nextPrompt(sessionId, options.projectRoot, options.knowledgeBasePath);

    // 2. Invoke agent with retry loop
    let retryCount = 0;
    let advanced = false;

    while (!advanced && retryCount < maxRetries) {
      options.onProgress?.({
        type: 'agent-called',
        stage: prompt.stage as Stage,
        message: `Invoking agent (attempt ${retryCount + 1}/${maxRetries})...`,
      });

      const { invokeAgent, createClaudeCodeAdapter, createCodexAdapter } =
        await import('../external-coordination/index.js');

      // Ensure adapter is registered
      try { createClaudeCodeAdapter(); } catch {}
      try { createCodexAdapter(); } catch {}

      const agentResponse = await invokeAgent(prompt.xml, {
        adapterId: options.adapterId,
        timeoutMs: 300_000,
      });

      options.onProgress?.({
        type: 'agent-called',
        stage: prompt.stage as Stage,
        message: `Agent: ${agentResponse.status} (${agentResponse.durationMs}ms)`,
      });

      // 3. Submit result
      const result = submitResult(
        sessionId,
        {
          artifacts: agentResponse.artifacts.length > 0
            ? agentResponse.artifacts
            : [{ path: `${prompt.stage}-output`, content: agentResponse.raw }],
          selfCheck: { acceptanceCriteriaMet: agentResponse.status === 'success' },
        },
        options.projectRoot,
        options.knowledgeBasePath
      );

      options.onProgress?.({
        type: 'gate-result',
        stage: prompt.stage as Stage,
        message: result.advanced
          ? `Gate passed → ${result.nextStage || 'done'}`
          : `Gate failed: ${result.diagnosis?.failedCriteria.map(c => c.id).join(', ') || 'unknown'}`,
        data: result.diagnosis || null,
      });

      if (result.advanced) {
        advanced = true;
        options.onProgress?.({ type: 'stage-advanced', message: `Advanced to ${result.nextStage}` });
      } else if (result.diagnosis) {
        retryCount++;
        if (retryCount < maxRetries) {
          options.onProgress?.({
            type: 'retry',
            stage: prompt.stage as Stage,
            message: `Retry ${retryCount}/${maxRetries}`,
            data: result.diagnosis,
          });
        } else {
          options.onProgress?.({
            type: 'error',
            message: `Max retries (${maxRetries}) exhausted. Escalating to user.`,
            data: result.diagnosis,
          });
          return status(sessionId, options.projectRoot);
        }
      }
    }

    if (advanced) {
      const current = status(sessionId, options.projectRoot);
      if (current.state === 'completed') {
        options.onProgress?.({ type: 'done', message: 'All stages complete!' });
        return current;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTraceEdges(data: SessionData): Record<string, string[]> {
  const edges: Record<string, string[]> = {};
  const stages = ['plan', 'specify', 'design', 'tasks', 'code', 'tests'];
  for (let i = 0; i < stages.length - 1; i++) {
    edges[stages[i]] = [stages[i + 1]];
  }
  return edges;
}

// ---------------------------------------------------------------------------
// YAML helpers (minimal writer for our specific session format)
// ---------------------------------------------------------------------------

function formatStateYaml(data: SessionData): string {
  const lines: string[] = [
    `# spec-graph session state — ${data.sessionId}`,
    `sessionId: "${data.sessionId}"`,
    `intent: "${data.intent}"`,
    `stage: "${data.stage}"`,
    `state: "${data.state}"`,
    `retryCount: ${data.retryCount}`,
    ``,
    `# Plan`,
    `plan:`,
    `  sessionId: "${data.plan.sessionId}"`,
    `  intent: "${data.plan.intent}"`,
    `  complexity: "${data.plan.complexity}"`,
    `  capabilities:`,
    ...(data.plan?.capabilities || []).map(
      (c) => `    - id: "${c.id}"\n      description: "${c.description || ''}"`
    ),
    `  risks:`,
    ...(data.plan?.risks || []).map((r) => `    - "${r}"`),
    ``,
    `# Completed artifacts`,
    `completedArtifacts:`,
    ...data.completedArtifacts.map((a) => `  - "${a}"`),
    ``,
    `# Trace`,
    `trace:`,
    ...data.trace.map(
      (t) =>
        `  - timestamp: "${t.timestamp}"\n    toStage: "${t.toStage}"\n    trigger: "${t.trigger}"`
    ),
    ``,
  ];
  return lines.join('\n');
}

function parseStateYaml(yaml: string): Partial<SessionData> {
  // Minimal YAML parser for reading back session state
  const result: Partial<SessionData> = {} as Partial<SessionData>;
  const trace: TraceEntry[] = [];
  let inTrace = false;

  for (const line of yaml.split('\n')) {
    const sessionMatch = line.match(/^sessionId:\s*"(.+)"$/);
    if (sessionMatch) result.sessionId = sessionMatch[1];

    const intentMatch = line.match(/^intent:\s*"(.+)"$/);
    if (intentMatch) {
      if (!result.plan) result.plan = {} as Plan;
      if (!result.intent) result.intent = intentMatch[1];
    }

    const stageMatch = line.match(/^stage:\s*"(.+)"$/);
    if (stageMatch) result.stage = stageMatch[1] as Stage;

    const stateMatch = line.match(/^state:\s*"(.+)"$/);
    if (stateMatch) result.state = stateMatch[1] as SessionState;

    if (line.startsWith('trace:')) inTrace = true;
    if (inTrace && line.match(/^\s{2}-\s+timestamp:/)) {
      const ts = line.match(/timestamp:\s*"(.+)"/)?.[1] || '';
      trace.push({ timestamp: ts, toStage: '', trigger: 'user-force' });
    }
  }

  result.trace = trace;
  result.completedArtifacts = [];
  result.previousDiagnoses = [];
  result.retryCount = 0;
  // Ensure plan object exists with required fields
  if (!result.plan) {
    result.plan = {
      sessionId: result.sessionId || 'unknown',
      intent: result.intent || '',
      capabilities: [],
      order: [],
      complexity: 'medium',
      risks: [],
      openQuestions: [],
    };
  }
  if (!result.plan.capabilities) result.plan.capabilities = [];
  if (!result.plan.risks) result.plan.risks = [];

  return result;
}
